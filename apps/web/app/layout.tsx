import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { connection } from "next/server";
import { canonicalPublicOrigin } from "../lib/site";

const title = "AgentTrial — Evidence for agent claims";
const description =
  "Adversarial agent evaluation with sealed trials, deterministic assertions, and signed evidence receipts anyone can verify.";

export const metadata: Metadata = {
  title: { default: title, template: "%s — AgentTrial" },
  description,
  metadataBase: new URL(canonicalPublicOrigin()),
  applicationName: "AgentTrial",
  authors: [{ name: "AgentTrial contributors", url: "https://github.com/tang-vu/agenttrial" }],
  creator: "AgentTrial contributors",
  publisher: "AgentTrial",
  category: "technology",
  keywords: [
    "AI agent evaluation",
    "adversarial testing",
    "evidence receipts",
    "deterministic scoring",
    "agent marketplaces",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "AgentTrial",
    title,
    description,
  },
  twitter: { card: "summary_large_image", title, description },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};
const nav = [
  ["Benchmark", "/benchmark"],
  ["Methodology", "/methodology"],
  ["Security", "/security"],
  ["Developers", "/developers"],
  ["Verify", "/verify"],
] as const;
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <Link className="brand" href="/" aria-label="AgentTrial home">
            <span className="brand-mark">AT</span>
            <span>AgentTrial</span>
          </Link>
          <nav aria-label="Primary">
            {nav.map(([label, href]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </nav>
          <Link className="button button-small" href="/new">
            Run a live trial
          </Link>
        </header>
        {children}
        <footer>
          <div>
            <div className="brand footer-brand">
              <span className="brand-mark">AT</span>AgentTrial
            </div>
            <p>The evidence layer for agent marketplaces.</p>
          </div>
          <div className="footer-links">
            <a href="/demo/agenttrial-live-demo-narrated.mp4">Demo</a>
            <Link href="/methodology">Methodology</Link>
            <Link href="/security">Responsible use</Link>
            <Link href="/developers">API</Link>
          </div>
          <p className="fine">
            Receipts are technical evidence, not legal certification or a guarantee of safety.
          </p>
        </footer>
      </body>
    </html>
  );
}
