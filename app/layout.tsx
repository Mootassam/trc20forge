import type { Metadata, Viewport } from "next";
import "./globals.css";
import { WalletProvider } from "@/components/WalletProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { extensionGuardScript } from "@/lib/extension-guard";

export const metadata: Metadata = {
  title: "TRC-20 Forge",
  description: "Create, compile, deploy and verify a fixed-supply TRC-20 token on TRON: no mint, no owner, no hidden powers.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Browser extensions (e.g. FoxClocks, Grammarly, dark-mode tools) inject attributes on <html>
    // before React hydrates. This only silences attribute mismatches on this one element.
    <html lang="en" suppressHydrationWarning>
      <head>
        {process.env.NODE_ENV !== "production" && (
          // Dev only: strips attributes injected by browser extensions (e.g. Bitdefender's bis_skin_checked)
          // before React hydrates, so the dev overlay doesn't report false hydration errors.
          <script dangerouslySetInnerHTML={{ __html: extensionGuardScript }} />
        )}
      </head>
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm dark:focus:bg-zinc-900">
          Skip to content
        </a>
        <WalletProvider>
          <SiteHeader />
          <main id="main" className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
            {children}
          </main>
          <footer className="border-t border-zinc-200 py-8 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
            Independent tool. Tokens created here are not USDT, not affiliated with Tether or TRON DAO, and have no guaranteed value.
            Always test on Nile first.
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
