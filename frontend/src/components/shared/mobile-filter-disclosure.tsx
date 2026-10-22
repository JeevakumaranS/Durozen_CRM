"use client";

import { ReactNode } from "react";

export function MobileFilterToggle({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      aria-expanded={expanded}
      aria-label={expanded ? "Hide filters" : "Show filters"}
      className="mobile-filter-toggle"
      onClick={onToggle}
      type="button"
    >
      <span>Filters</span>
      <span aria-hidden="true" className="mobile-filter-toggle-icon">
        {expanded ? "−" : "+"}
      </span>
    </button>
  );
}

export function MobileFilterContent({
  expanded,
  children,
}: {
  expanded: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`mobile-filter-content${expanded ? " is-open" : ""}`}>
      {children}
    </div>
  );
}
