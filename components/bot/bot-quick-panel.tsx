/**
 * @file components/bot/bot-quick-panel.tsx
 *
 * "My Telegram Bot" quick-access widget for the dashboard sidebar.
 *
 * Gives owners and resellers a one-click view of their Telegram bot (status,
 * webhook, last health check, customers) without leaving the current page. It is
 * UI only: it reads the existing GET /api/bots/status (reseller) and
 * GET /api/owner/settings (owner) endpoints and never mutates anything. It is
 * rendered by components/ui/sidebar.tsx above the profile area.
 *
 * @module Components
 */

'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Copy, ExternalLink, Link2, Send, Settings } from 'lucide-react';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { formatRelativeTime } from '@/lib/relative-time';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import type { UserRole } from '@/modules/identity/types';

// ---------------------------------------------------------------------------
// Types and constants
// ---------------------------------------------------------------------------

type BotState = 'connected' | 'disconnected' | 'error';

type BotSummary =
  | { readonly kind: 'none' }
  | { readonly kind: 'pending' }
  | {
      readonly kind: 'bot';
      readonly username: string;
      readonly state: BotState;
      readonly lastHealthAt: string | null;
      readonly webhookUrl: string | null;
      readonly customerCount: number | null;
    };

type LoadState =
  | { readonly phase: 'loading' }
  | { readonly phase: 'error' }
  | { readonly phase: 'ready'; readonly summary: BotSummary };

type DotTone = 'success' | 'warning' | 'danger' | 'muted';

type PopupAnchor = { readonly left: number; readonly bottom: number };

type BotQuickPanelProps = {
  readonly role: UserRole;
  readonly collapsed: boolean;
  /** Called after navigating away so a mobile drawer can close. */
  readonly onNavigate?: () => void;
};

const TELEGRAM_LINK_BASE = 'https://t.me/';
const POPUP_WIDTH_PX = 320;
const POPUP_GAP_PX = 8;
const WEBHOOK_DISPLAY_MAX_CHARS = 34;
const POPUP_ENTER_SECONDS = 0.16;

const DOT_CLASS: Record<DotTone, string> = {
  success: 'bg-[var(--green)]',
  warning: 'bg-[var(--amber)]',
  danger: 'bg-[var(--red)]',
  muted: 'bg-[var(--text-3)]',
};

// ---------------------------------------------------------------------------
// Response parsing (all API payloads are `unknown` until narrowed here)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toBotState(value: string | null): BotState {
  if (value === 'connected' || value === 'error') {
    return value;
  }
  return 'disconnected';
}

/** Unwraps the `{ success: true, data }` envelope used by every API route. */
function unwrapEnvelope(body: unknown): Record<string, unknown> {
  if (!isRecord(body) || body.success !== true || !isRecord(body.data)) {
    throw new Error('Unexpected bot status response shape');
  }
  return body.data;
}

function parseResellerSummary(payload: Record<string, unknown>): BotSummary {
  if (payload.pending === true) {
    return { kind: 'pending' };
  }
  const username = readString(payload, 'username');
  if (username === null) {
    return { kind: 'none' };
  }
  return {
    kind: 'bot',
    username,
    // `connected` is the API's own verdict; fall back to `status` for error vs offline.
    state: payload.connected === true ? 'connected' : toBotState(readString(payload, 'status')),
    lastHealthAt: readString(payload, 'lastHealthAt'),
    webhookUrl: readString(payload, 'webhookUrl'),
    customerCount: readNumber(payload, 'customerCount'),
  };
}

function parseOwnerSummary(payload: Record<string, unknown>): BotSummary {
  const settings = payload.settings;
  if (!isRecord(settings)) {
    throw new Error('Unexpected owner settings response shape');
  }
  const username = readString(settings, 'ownerBotUsername');
  if (username === null) {
    return { kind: 'none' };
  }
  return {
    kind: 'bot',
    username,
    state: toBotState(readString(settings, 'ownerBotStatus')),
    lastHealthAt: readString(settings, 'ownerBotLastHealthAt'),
    webhookUrl: readString(payload, 'webhookUrl'),
    customerCount: null,
  };
}

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

/** Shortens `value` to `maxChars` by replacing the middle with an ellipsis. */
function truncateMiddle(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  const keepChars = maxChars - 1;
  const headChars = Math.ceil(keepChars / 2);
  const tailChars = Math.floor(keepChars / 2);
  return `${value.slice(0, headChars)}…${value.slice(value.length - tailChars)}`;
}

function buildBotLink(username: string): string {
  // SECURITY: encode the username so it can never break out of the URL path.
  return `${TELEGRAM_LINK_BASE}${encodeURIComponent(username)}`;
}

function toneFor(loadState: LoadState): DotTone {
  if (loadState.phase !== 'ready') {
    return 'muted';
  }
  const { summary } = loadState;
  if (summary.kind === 'pending') {
    return 'warning';
  }
  if (summary.kind === 'none') {
    return 'muted';
  }
  return summary.state === 'connected' ? 'success' : 'danger';
}

function describeStatus(loadState: LoadState): string {
  if (loadState.phase === 'loading') {
    return 'Loading';
  }
  if (loadState.phase === 'error') {
    return 'Status unavailable';
  }
  const { summary } = loadState;
  if (summary.kind === 'pending') {
    return 'Pending approval';
  }
  if (summary.kind === 'none') {
    return 'Not connected';
  }
  return summary.state === 'connected' ? 'Connected' : summary.state === 'error' ? 'Error' : 'Disconnected';
}

function describeTitle(loadState: LoadState): string {
  if (loadState.phase === 'ready' && loadState.summary.kind === 'bot') {
    return `@${loadState.summary.username}`;
  }
  if (loadState.phase === 'ready') {
    return loadState.summary.kind === 'pending' ? 'Bot pending approval' : 'No bot connected';
  }
  return loadState.phase === 'loading' ? 'My Telegram bot' : 'Bot status unavailable';
}

function manageRoute(role: UserRole): string {
  return role === 'owner' ? ROUTES.owner.settings : ROUTES.reseller.bot;
}

async function copyToClipboard(text: string, successMessage: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    // Clipboard access can be denied (insecure context / permissions); tell the user.
    toast.error('Could not copy to clipboard');
  }
}

// ---------------------------------------------------------------------------
// Data hook
// ---------------------------------------------------------------------------

function useBotSummary(role: UserRole): { loadState: LoadState; reload: () => Promise<void> } {
  const [loadState, setLoadState] = useState<LoadState>({ phase: 'loading' });
  const latestRequestRef = useRef(0);

  const reload = useCallback(async (): Promise<void> => {
    // Staff have no bot; the widget renders nothing for them, so skip the request.
    if (role !== 'owner' && role !== 'reseller') {
      return;
    }
    latestRequestRef.current += 1;
    const requestId = latestRequestRef.current;
    // Keep showing the previous result while refreshing; only blank out after a failure.
    setLoadState((previous) => (previous.phase === 'ready' ? previous : { phase: 'loading' }));
    try {
      const url = role === 'owner' ? API_ROUTES.ownerSettings : API_ROUTES.botsStatus;
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Bot status request failed with ${response.status}`);
      }
      const payload = unwrapEnvelope((await response.json()) as unknown);
      const summary = role === 'owner' ? parseOwnerSummary(payload) : parseResellerSummary(payload);
      // Ignore responses from superseded requests so an old reply cannot overwrite a newer one.
      if (requestId === latestRequestRef.current) {
        setLoadState({ phase: 'ready', summary });
      }
    } catch {
      if (requestId === latestRequestRef.current) {
        setLoadState({ phase: 'error' });
      }
    }
  }, [role]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { loadState, reload };
}

// ---------------------------------------------------------------------------
// Presentational pieces
// ---------------------------------------------------------------------------

function StatusDot({ tone, className = '' }: { tone: DotTone; className?: string }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${DOT_CLASS[tone]} ${className}`}
    />
  );
}

function SkeletonBar({ className }: { className: string }): JSX.Element {
  return <div className={`animate-pulse rounded-[var(--r-sm)] bg-[var(--surface-3)] ${className}`} />;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3 text-sm">
      <span className="text-[var(--text-2)]">{label}</span>
      <span className="min-w-0 text-right text-[var(--text-0)]">{children}</span>
    </div>
  );
}

const ACTION_CLASS =
  'flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--r-md)] border border-[var(--border)] px-3 text-sm text-[var(--text-1)] transition-colors duration-150 hover:bg-[var(--surface-2)] hover:text-[var(--text-0)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]';

const PRIMARY_ACTION_CLASS =
  'flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--r-md)] bg-[var(--accent)] px-3 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]';

function BotDetails({
  summary,
  role,
  onNavigate,
}: {
  summary: Extract<BotSummary, { kind: 'bot' }>;
  role: UserRole;
  onNavigate: () => void;
}): JSX.Element {
  const isLive = summary.state === 'connected';
  const botLink = buildBotLink(summary.username);
  return (
    <>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-semibold text-white"
        >
          {summary.username.charAt(0).toUpperCase()}
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-0)]">@{summary.username}</p>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs ${
            isLive ? 'text-[var(--green)]' : 'text-[var(--text-2)]'
          }`}
        >
          <StatusDot tone={isLive ? 'success' : 'muted'} className="h-1.5 w-1.5" />
          {isLive ? 'Live' : 'Offline'}
        </span>
      </div>
      <div className="mt-3 border-t border-[var(--border)] pt-2">
        <WebhookRow isActive={isLive} webhookUrl={summary.webhookUrl} />
        <DetailRow label="Last health check">{formatRelativeTime(summary.lastHealthAt)}</DetailRow>
        {summary.customerCount === null ? null : (
          <DetailRow label="Customers">{summary.customerCount}</DetailRow>
        )}
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <a href={botLink} target="_blank" rel="noopener noreferrer" className={PRIMARY_ACTION_CLASS}>
          <ExternalLink size={16} aria-hidden="true" />
          Open in Telegram
        </a>
        <button
          type="button"
          className={ACTION_CLASS}
          onClick={() => {
            void copyToClipboard(botLink, 'Bot link copied');
          }}
        >
          <Link2 size={16} aria-hidden="true" />
          Copy bot link
        </button>
        <Link href={manageRoute(role)} onClick={onNavigate} className={ACTION_CLASS}>
          <Settings size={16} aria-hidden="true" />
          Manage bot
        </Link>
      </div>
    </>
  );
}

function WebhookRow({ isActive, webhookUrl }: { isActive: boolean; webhookUrl: string | null }): JSX.Element {
  return (
    <div>
      <DetailRow label="Webhook">
        {isActive ? (
          <span className="inline-flex items-center gap-1 text-[var(--green)]">
            <Check size={14} aria-hidden="true" />
            Active
          </span>
        ) : (
          <span className="text-[var(--text-2)]">Not set</span>
        )}
      </DetailRow>
      {webhookUrl === null ? null : (
        <div className="mb-1 flex items-center gap-2 rounded-[var(--r-sm)] bg-[var(--surface-2)] px-2 py-1">
          <code className="min-w-0 flex-1 truncate text-xs text-[var(--text-2)]" title={webhookUrl}>
            {truncateMiddle(webhookUrl, WEBHOOK_DISPLAY_MAX_CHARS)}
          </code>
          <button
            type="button"
            aria-label="Copy webhook URL"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--r-sm)] text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-0)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            onClick={() => {
              void copyToClipboard(webhookUrl, 'Webhook URL copied');
            }}
          >
            <Copy size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

function PanelContent({
  loadState,
  role,
  onRetry,
  onNavigate,
}: {
  loadState: LoadState;
  role: UserRole;
  onRetry: () => void;
  onNavigate: () => void;
}): JSX.Element {
  if (loadState.phase === 'loading') {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Loading bot status">
        <SkeletonBar className="h-10 w-full" />
        <SkeletonBar className="h-4 w-3/4" />
        <SkeletonBar className="h-4 w-1/2" />
        <SkeletonBar className="h-11 w-full" />
      </div>
    );
  }
  if (loadState.phase === 'error') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-[var(--text-1)]">Couldn&apos;t load bot status</p>
        <button type="button" className={ACTION_CLASS} onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  const { summary } = loadState;
  if (summary.kind === 'bot') {
    return <BotDetails summary={summary} role={role} onNavigate={onNavigate} />;
  }
  if (summary.kind === 'pending') {
    return (
      <p className="text-sm text-[var(--text-1)]">Your bot unlocks after the owner approves your account.</p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-[var(--text-1)]">Connect your Telegram bot in 60 seconds</p>
      <Link href={manageRoute(role)} onClick={onNavigate} className={PRIMARY_ACTION_CLASS}>
        Connect bot
      </Link>
    </div>
  );
}

function SidebarCard({
  loadState,
  collapsed,
  isOpen,
  buttonRef,
  onToggle,
}: {
  loadState: LoadState;
  collapsed: boolean;
  isOpen: boolean;
  buttonRef: RefObject<HTMLButtonElement>;
  onToggle: () => void;
}): JSX.Element {
  const tone = toneFor(loadState);
  const title = describeTitle(loadState);
  const statusLabel = describeStatus(loadState);
  const layoutClass = collapsed ? 'h-11 w-11 justify-center' : 'min-h-11 w-full gap-2.5 px-3 py-2 text-left';
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onToggle}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-label={`My Telegram bot: ${title}, ${statusLabel}`}
      title={collapsed ? `${title} · ${statusLabel}` : undefined}
      className={`relative flex cursor-pointer items-center rounded-lg border border-[var(--border)] text-[var(--text-2)] transition-colors duration-150 hover:bg-[var(--surface-2)] hover:text-[var(--text-0)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${layoutClass}`}
    >
      <Send size={20} aria-hidden="true" className="shrink-0 text-[var(--accent-soft)]" />
      {collapsed ? (
        <StatusDot tone={tone} className="absolute right-1 top-1 ring-2 ring-[var(--surface-1)]" />
      ) : (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-[var(--text-0)]">{title}</span>
            <span className="block truncate text-xs text-[var(--text-3)]">{statusLabel}</span>
          </span>
          <StatusDot tone={tone} />
        </>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Popup behaviour
// ---------------------------------------------------------------------------

/**
 * Closes the popup on Escape (returning focus to the trigger), outside pointer
 * presses, and window resize (the popup is positioned from a one-time measurement).
 */
function useDismiss(
  isOpen: boolean,
  close: () => void,
  popupRef: RefObject<HTMLDivElement>,
  triggerRef: RefObject<HTMLButtonElement>,
): void {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        close();
        triggerRef.current?.focus();
      }
    }
    function handlePointerDown(event: PointerEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (popupRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      close();
    }
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', close);
    };
  }, [isOpen, close, popupRef, triggerRef]);
}

/**
 * Measures the trigger so the fixed-position popup can be anchored to it.
 * Prefers opening beside the sidebar; falls back to above the card on narrow screens.
 */
function measureAnchor(trigger: HTMLElement): PopupAnchor {
  const rect = trigger.getBoundingClientRect();
  const fitsBeside = rect.right + POPUP_GAP_PX + POPUP_WIDTH_PX <= window.innerWidth - POPUP_GAP_PX;
  if (fitsBeside) {
    return { left: rect.right + POPUP_GAP_PX, bottom: Math.max(POPUP_GAP_PX, window.innerHeight - rect.bottom) };
  }
  return {
    left: POPUP_GAP_PX,
    bottom: window.innerHeight - rect.top + POPUP_GAP_PX,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Sidebar widget showing the user's Telegram bot with a detail popup.
 *
 * @param props.role - Session role; owners read platform settings, resellers read bot status.
 * @param props.collapsed - When true, renders only the icon with a status dot.
 * @param props.onNavigate - Optional callback fired after a navigation action (closes mobile drawer).
 * @returns The card plus (when open) a portaled dialog; null for roles without a bot.
 *
 * SECURITY: Only reads data from role-gated endpoints; the server enforces access.
 */
export default function BotQuickPanel({ role, collapsed, onNavigate }: BotQuickPanelProps): JSX.Element | null {
  const isSupportedRole = role === 'owner' || role === 'reseller';
  const { loadState, reload } = useBotSummary(role);
  const prefersReducedMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [anchor, setAnchor] = useState<PopupAnchor>({ left: POPUP_GAP_PX, bottom: POPUP_GAP_PX });
  const [isMounted, setIsMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const close = useCallback((): void => setIsOpen(false), []);

  // Portals need `document`, which only exists after hydration.
  useEffect(() => setIsMounted(true), []);
  useDismiss(isOpen, close, popupRef, triggerRef);

  useEffect(() => {
    if (isOpen) {
      void reload();
      popupRef.current?.focus();
    }
  }, [isOpen, reload]);

  function handleToggle(): void {
    if (!isOpen && triggerRef.current) {
      setAnchor(measureAnchor(triggerRef.current));
    }
    setIsOpen((previous) => !previous);
  }

  function handleNavigate(): void {
    setIsOpen(false);
    onNavigate?.();
  }

  if (!isSupportedRole) {
    return null;
  }

  const popup = (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          ref={popupRef}
          role="dialog"
          aria-label="My Telegram bot"
          tabIndex={-1}
          initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.95 }}
          transition={{ duration: prefersReducedMotion ? 0 : POPUP_ENTER_SECONDS, ease: 'easeOut' }}
          style={{ left: anchor.left, bottom: anchor.bottom, width: `min(${POPUP_WIDTH_PX}px, calc(100vw - 1rem))`, transformOrigin: 'bottom left' }}
          className="fixed z-[70] rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[var(--shadow-card)] outline-none"
        >
          <PanelContent
            loadState={loadState}
            role={role}
            onRetry={() => {
              void reload();
            }}
            onNavigate={handleNavigate}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return (
    <div className="border-t border-[var(--border)] p-3">
      <div className={collapsed ? 'flex justify-center' : ''}>
        <SidebarCard
          loadState={loadState}
          collapsed={collapsed}
          isOpen={isOpen}
          buttonRef={triggerRef}
          onToggle={handleToggle}
        />
      </div>
      {isMounted ? createPortal(popup, document.body) : null}
    </div>
  );
}
