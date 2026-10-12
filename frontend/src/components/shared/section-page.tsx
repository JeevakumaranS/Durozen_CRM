import Link from "next/link";

type SectionPageProps = {
  title: string;
  description: string;
};

export function SectionPage({ title, description }: SectionPageProps) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span>DUROZEN CRM</span>
        </div>
        <nav aria-label="Main navigation">
          {[
            ["Dashboard", "/dashboard"],
            ["Leads", "/leads"],
            ["Pipeline", "/pipeline"],
            ["Follow-ups", "/follow-ups"],
            ["Proposals", "/proposals"],
            ["Customers", "/customers"],
            ["Performance", "/performance"],
            ["Reports", "/reports"],
          ].map(([label, href]) => (
            <Link
              href={href}
              key={href}
              style={{
                color: "inherit",
                textDecoration: "none",
                padding: "12px 13px",
              }}
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="content section-page">
        <header>
          <div>
            <p className="eyebrow">DUROZEN CRM</p>
            <h1>{title}</h1>
            <p className="subtitle">{description}</p>
          </div>
        </header>
        <section className="panel section-empty-state">
          <h2>{title}</h2>
          <p>This workspace is ready for its CRM workflow.</p>
        </section>
      </main>
    </div>
  );
}
