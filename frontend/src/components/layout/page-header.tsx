type PageHeaderProps = { title: string; description?: string };

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header>
      <div>
        <h1>{title}</h1>
        {description ? <p className="subtitle">{description}</p> : null}
      </div>
    </header>
  );
}
