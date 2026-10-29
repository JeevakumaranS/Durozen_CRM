"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  API_DATA_CHANGED_EVENT,
  apiClient,
  logoutAndRedirect,
} from "../../lib/api-client";
import { AuthUser, getAccessToken, setAuthUser } from "../../lib/auth";
import { notify } from "../../lib/notifications";
import { canAccessRoute } from "../../lib/permissions";

type PendingCounts = {
  meetings: number;
  callsAndMessages: number;
  proposals: number;
  negotiations: number;
};

function pendingCountFor(
  label: string,
  counts: PendingCounts | null,
): number | undefined {
  if (!counts) return undefined;
  if (label === "Meetings") return counts.meetings;
  if (label === "Calls & Msg") return counts.callsAndMessages;
  if (label === "Proposals") return counts.proposals;
  if (label === "Negotiations") return counts.negotiations;
  return undefined;
}

const adminNavigation = [
  ["Dashboard", "/dashboard"],
  ["Leads", "/leads"],
  ["Sales Pipeline", "/pipeline"],
  ["Activities", "/activities"],
  ["Customers", "/customers"],
  ["Reports", "/reports"],
];

const managerNavigation = [
  ["Dashboard", "/dashboard"],
  ["Leads", "/leads"],
  ["Sales Pipeline", "/pipeline"],
  ["Activities", "/activities"],
  ["Reports", "/reports"],
  ["My Team", "/my-team"],
];
const bdeNavigation = [
  ["Dashboard", "/dashboard"],
  ["Leads", "/leads"],
  ["Sales Pipeline", "/pipeline"],
  ["Activities", "/activities"],
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActivitySection = pathname.startsWith("/activities");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activitiesExpanded, setActivitiesExpanded] =
    useState(isActivitySection);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingCounts, setPendingCounts] = useState<PendingCounts | null>(null);

  useEffect(() => {
    if (isActivitySection) setActivitiesExpanded(true);
  }, [isActivitySection]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const loadPendingCounts = () => {
      apiClient<PendingCounts>("/dashboard/pending-counts")
        .then((counts) => {
          if (active) setPendingCounts(counts);
        })
        .catch((reason: unknown) => {
          if (!active) return;
          const message =
            reason instanceof Error
              ? reason.message
              : "Unable to load pending activity counts.";
          notify(message, "error");
        });
    };
    loadPendingCounts();
    const interval = window.setInterval(loadPendingCounts, 60_000);
    window.addEventListener("focus", loadPendingCounts);
    window.addEventListener(API_DATA_CHANGED_EVENT, loadPendingCounts);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", loadPendingCounts);
      window.removeEventListener(API_DATA_CHANGED_EVENT, loadPendingCounts);
    };
  }, [user, pathname]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    let failureReported = false;
    const sendHeartbeat = () => {
      if (document.visibilityState !== "visible") return;
      apiClient<{ ok: boolean }>("/auth/heartbeat", { method: "POST" })
        .then(() => {
          failureReported = false;
        })
        .catch((reason: unknown) => {
          if (!active || failureReported) return;
          failureReported = true;
          notify(
            reason instanceof Error
              ? reason.message
              : "Unable to update your online status.",
            "error",
          );
        });
    };
    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, 60_000);
    document.addEventListener("visibilitychange", sendHeartbeat);
    window.addEventListener("focus", sendHeartbeat);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", sendHeartbeat);
      window.removeEventListener("focus", sendHeartbeat);
    };
  }, [user]);

  useEffect(() => {
    setLoading(true);
    setError("");
    if (!getAccessToken()) {
      window.location.replace("/login");
      return;
    }
    apiClient<AuthUser>("/auth/me")
      .then((currentUser) => {
        setAuthUser(currentUser);
        setUser(currentUser);
        if (
          !canAccessRoute(
            currentUser.role,
            pathname,
            currentUser.canViewCustomers,
          )
        ) {
          window.location.replace("/dashboard");
          return;
        }
        setLoading(false);
      })
      .catch((reason: unknown) => {
        const message =
          reason instanceof Error ? reason.message : "Unable to verify access.";
        setError(message);
        notify(message, "error");
        setLoading(false);
      });
  }, [pathname]);

  if (loading) {
    return <main className="dashboard-loading">Verifying access...</main>;
  }
  if (error) return null;
  if (!user) return null;

  const navigationForRole =
    user.role === "ADMIN"
      ? adminNavigation
      : user.role === "SALES_MANAGER"
        ? managerNavigation
        : bdeNavigation;
  const visibleNavigation =
    user.role !== "ADMIN" && user.canViewCustomers
      ? [...navigationForRole, ["Customers", "/customers"]]
      : navigationForRole;

  return (
    <div className="dashboard-shell">
      <header className="dashboard-mobile-header">
        <button
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          className={`dashboard-mobile-menu-toggle${mobileMenuOpen ? " is-open" : ""}`}
          onClick={() => setMobileMenuOpen((open) => !open)}
          type="button"
        >
          <span />
          <span />
          <span />
        </button>
        <Link
          className="dashboard-mobile-brand"
          href="/dashboard"
          onClick={() => setMobileMenuOpen(false)}
        >
          DUROZEN CRM
        </Link>
      </header>
      {mobileMenuOpen && (
        <button
          aria-label="Close navigation menu"
          className="dashboard-sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          type="button"
        />
      )}
      <aside className={`dashboard-sidebar${mobileMenuOpen ? " mobile-open" : ""}`}>
        <Link
          className="dashboard-brand"
          href="/dashboard"
          onClick={() => setMobileMenuOpen(false)}
        >
          <span>DUROZEN CRM</span>
        </Link>
        <nav aria-label="Main navigation">
          {visibleNavigation.map(([label, href]) => {
              if (label === "Activities") {
                const activityLinks =
                  user.role === "SALES_MANAGER"
                    ? [
                        ["Calls & Msg", "/activities/calls"],
                        ["Meetings", "/activities/meetings"],
                        ["Proposals", "/activities/proposals"],
                        ["Negotiations", "/activities/negotiations"],
                      ]
                    : [
                        ["Calls & Msg", "/activities/calls"],
                        ["Meetings", "/activities/meetings"],
                        ["Proposals", "/activities/proposals"],
                        ["Negotiations", "/activities/negotiations"],
                      ];
                return (
                  <div className="sidebar-activity-group" key={href}>
                    <button
                      aria-expanded={activitiesExpanded}
                      className={`sidebar-activity-toggle${isActivitySection ? " selected" : ""}`}
                      onClick={() =>
                        setActivitiesExpanded((expanded) => !expanded)
                      }
                      title="Activities"
                      type="button"
                    >
                      <span className="sidebar-activity-title">
                        Activities
                      </span>
                      <span aria-hidden="true" className="sidebar-activity-chevron">
                        {activitiesExpanded ? "⌃" : "+"}
                      </span>
                    </button>
                    {activitiesExpanded && (
                      <div className="sidebar-activity-children">
                        {activityLinks.map(([childLabel, childHref]) => {
                          const childSelected =
                            pathname === childHref ||
                            pathname.startsWith(`${childHref}/`);
                          const pendingCount = pendingCountFor(
                            childLabel,
                            pendingCounts,
                          );
                          const iconPath =
                            childLabel === "Meetings"
                              ? "M3.5 5.5h13v11h-13z M6.5 3.5v4 M13.5 3.5v4 M3.5 8.5h13"
                              : childLabel === "Calls & Msg"
                                ? "M6.2 3.8 8.4 6l-1.5 2.1a12 12 0 0 0 5 5l2.1-1.5 2.2 2.2-1.3 2.7c-.3.6-1 .9-1.7.8A14.5 14.5 0 0 1 2.7 4.8c-.1-.7.2-1.4.8-1.7z"
                                : "M4 3.5h12v13H4z M7 7h6 M7 10h6 M7 13h4";
                          return (
                            <Link
                              aria-current={childSelected ? "page" : undefined}
                              className={childSelected ? "selected" : ""}
                              href={childHref}
                              key={childHref}
                              onClick={() => setMobileMenuOpen(false)}
                              title={childLabel}
                            >
                              <svg aria-hidden="true" viewBox="0 0 20 20">
                                <path d={iconPath} />
                              </svg>
                              {childLabel}
                              {pendingCount !== undefined && pendingCount > 0 && (
                                <span
                                  aria-label={`${pendingCount} pending`}
                                  className="sidebar-pending-count"
                                >
                                  {pendingCount}
                                </span>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              const selected =
                pathname === href ||
                (href !== "/dashboard" && pathname.startsWith(`${href}/`));
              const pendingCount = pendingCountFor(label, pendingCounts);

              return (
                <Link
                  aria-current={selected ? "page" : undefined}
                  className={`${selected ? "selected " : ""}${pendingCount !== undefined && pendingCount > 0 ? "has-pending-count" : ""}`}
                  href={href}
                  key={href}
                  onClick={() => setMobileMenuOpen(false)}
                  title={label}
                >
                  {label}
                  {pendingCount !== undefined && pendingCount > 0 && (
                    <span
                      aria-label={`${pendingCount} pending`}
                      className="sidebar-pending-count"
                    >
                      {pendingCount}
                    </span>
                  )}
                </Link>
              );
            })}
          {user.role === "ADMIN" && (
            <div className="sidebar-nav-section">
              <Link
                aria-current={
                  pathname === "/team" || pathname.startsWith("/team/")
                    ? "page"
                    : undefined
                }
                className={
                  pathname === "/team" || pathname.startsWith("/team/")
                    ? "selected"
                    : ""
                }
                href="/team"
                onClick={() => setMobileMenuOpen(false)}
                title="Manage Team"
              >
                Manage Team
              </Link>
            </div>
          )}
        </nav>
        <button
          className="dashboard-user"
          onClick={() => void logoutAndRedirect()}
          title="Sign out"
          aria-label={`Sign out ${user.name}`}
        >
          <span>{user.name.slice(0, 2).toUpperCase()}</span>
          <div className="dashboard-user-details">
            <strong>{user.name}</strong>
            <small>{user.role.replaceAll("_", " ")}</small>
          </div>
          <span className="dashboard-signout-icon" aria-hidden="true">
            ↪
          </span>
          <strong className="dashboard-signout-label">Sign out</strong>
        </button>
      </aside>
      <div className="dashboard-content">
        {children}
      </div>
    </div>
  );
}
