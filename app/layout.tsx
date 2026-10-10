/**
 * @file app/layout.tsx
 *
 * Root App Router layout for AfterBuy.
 *
 * Wraps every route with Inter, theme bootstrap, and design-token styles.
 *
 * @module App
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: {
    default: 'AfterBuy',
    template: '%s — AfterBuy',
  },
  description: 'AfterBuy — the Telegram store that remembers every buyer.',
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
};

type RootLayoutProps = {
  readonly children: ReactNode;
};

const THEME_BOOTSTRAP = `
  try {
    const t = localStorage.getItem('afterbuy-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', t);
  } catch(e) {}
`;

export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 2000,
            style: {
              background: 'var(--surface-2, var(--bg-card))',
              border: '1px solid var(--border-soft)',
              borderLeft: '3px solid var(--memory)',
              color: 'var(--text-0, var(--text-1))',
            },
          }}
        />
      </body>
    </html>
  );
}
