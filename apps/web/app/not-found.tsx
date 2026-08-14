import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="empty-state">
      <span className="huge-code">404</span>
      <h1>No evidence found here.</h1>
      <p>The object may have moved, expired, or never existed.</p>
      <Link className="button" href="/">
        Return to the lab
      </Link>
    </main>
  );
}
