import Link from "next/link";

export default function NotFound() {
  return (
    <main className="content section-page">
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p className="subtitle">The page you requested does not exist.</p>
      <Link href="/dashboard">Return to dashboard</Link>
    </main>
  );
}
