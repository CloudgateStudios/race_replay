import type { Metadata } from "next";
import { Barlow, Barlow_Condensed, Geist_Mono } from "next/font/google";
import Link from "next/link";

import pkg from "../../package.json";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://racereplay.app";

export const metadata: Metadata = {
  title: {
    default: "Race Replay — See every pass, know your race",
    template: "%s — Race Replay",
  },
  description:
    "Race Replay shows you every position change from your triathlon or running race — leg by leg, athlete by athlete. See the story of your race in data from how you did on course.",
  metadataBase: new URL(BASE_URL),
  openGraph: {
    siteName: "Race Replay",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${barlow.variable} ${barlowCondensed.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Apply theme class before first paint to avoid flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(s==='dark'||(!s&&d))document.documentElement.classList.add('dark');})();`,
          }}
        />
      </head>
      <body className="bg-background text-foreground flex min-h-full flex-col">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="bg-card/80 sticky top-0 z-10 border-b backdrop-blur-sm">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-[clamp(1.5rem,5vw,5rem)]">
            {/* Logo */}
            <Link
              href="/"
              className="hover:text-primary flex items-center gap-1.5 transition-colors"
              style={{ fontFamily: "var(--font-barlow-condensed), sans-serif" }}
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 28 28"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
              >
                <polygon points="26,14 20,24 8,24 2,14 8,4 20,4" fill="#f97316" />
                <polygon points="11,9 11,19 20,14" fill="white" />
              </svg>
              <span className="text-lg font-black tracking-wide uppercase">Race Replay</span>
            </Link>

            {/* Nav */}
            <nav className="flex items-center gap-6">
              <Link
                href="/races"
                className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
              >
                Races
              </Link>
              <Link
                href="/about"
                className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
              >
                About
              </Link>
            </nav>
          </div>
        </header>

        {/* ── Page content ────────────────────────────────────────────────── */}
        <main className="mx-auto w-full max-w-6xl flex-1 px-[clamp(1.5rem,5vw,5rem)] py-10">
          {children}
        </main>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer className="bg-card border-t">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-[clamp(1.5rem,5vw,5rem)]">
            <p className="text-muted-foreground text-sm">
              © {new Date().getFullYear()}{" "}
              <Link
                href="https://cloudgatestudios.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
              >
                Cloudgate Studios
              </Link>
            </p>
            <div className="flex items-center gap-4">
              <ThemeToggle />
              <Link
                href="https://github.com/CloudgateStudios/race_replay"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="GitHub"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
              </Link>
              <p className="text-muted-foreground font-mono text-xs">v{pkg.version}</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
