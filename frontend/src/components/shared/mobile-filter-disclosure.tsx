"use client";

import { ReactNode } from "react";

export function MobileFilterToggle({
  expanded,
  active = false,
  onToggle,
}: {
  expanded: boolean;
  active?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      aria-expanded={expanded}
      aria-label={`${expanded ? "Hide" : "Show"} filters${active ? ", filters applied" : ""}`}
      className={`mobile-filter-toggle${active ? " has-active-filters" : ""}`}
      onClick={onToggle}
      type="button"
    >
      <span>Filters</span>
      {active && (
        <span aria-hidden="true" className="mobile-filter-active-indicator" />
      )}
      <span aria-hidden="true" className="mobile-filter-toggle-icon">
        {expanded ? "−" : "+"}
      </span>
    </button>
  );
}

export function MobileFilterContent({
  expanded,
  children,
  onClose,
}: {
  expanded: boolean;
  children: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className={`mobile-filter-content${expanded ? " is-open" : ""}`}>
      {expanded && onClose && (
        <button
          aria-label="Close filters"
          className="mobile-filter-close"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      )}
      {children}
    </div>
  );
}
