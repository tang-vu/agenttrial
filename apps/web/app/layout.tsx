import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AgentTrial — Evidence for agent claims", template: "%s — AgentTrial" },
  description: "An autonomous adversarial evaluator for AI agents.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
};
const nav = [
  ["Methodology", "/methodology"],
  ["Security", "/security"],
  ["Developers", "/developers"],
  ["Verify", "/verify"],
] as const;
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
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
