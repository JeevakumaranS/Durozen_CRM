"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiClient, logoutAndRedirect } from "../../lib/api-client";
import { AuthUser, getAccessToken, setAuthUser } from "../../lib/auth";
import { notify } from "../../lib/notifications";

const adminNavigation = [
  ["Dashboard", "/dashboard"],
  ["Leads", "/leads"],
  ["Sales Pipeline", "/pipeline"],
  ["Activities", "/activities"],
  ["Proposals", "/proposals"],
  ["Negotiations", "/negotiations"],
  ["Customers", "/customers"],
  ["Reports", "/reports"],
  ["Admin dashboard", "/admin"],
];

const bdeRoutes = [
  "/dashboard",
  "/leads",
  "/pipeline",
  "/tasks",
  "/activities",
  "/meetings",
  "/proposals",
  "/customers",
  "/performance",
  "/reports",
];
const managerRoutes = [
  "/dashboard",
  "/leads",
  "/pipeline",
  "/tasks",
  "/proposals",
  "/performance",
  "/reports",
];
const managerNavigation = [
  ["Dashboard", "/dashboard"],
  ["Leads", "/leads"],
  ["Sales Pipeline", "/pipeline"],
  ["Tasks", "/tasks"],
  ["Proposals", "/proposals"],
  ["Reports", "/reports"],
];
const bdeNavigation = [
  ["Dashboard", "/dashboard"],
  ["Leads", "/leads"],
  ["Sales Pipeline", "/pipeline"],
  ["Activities", "/activities"],
  ["Proposals", "/proposals"],
  ["Customers", "/customers"],
  ["Reports", "/reports"],
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActivitySection =
    pathname.startsWith("/activities") ||
    pathname === "/tasks" ||
    pathname === "/meetings";
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activitiesExpanded, setActivitiesExpanded] =
    useState(isActivitySection);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isActivitySection) setActivitiesExpanded(true);
  }, [isActivitySection]);

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
        const permittedRoutes =
          currentUser.role === "BDE"
            ? bdeRoutes
            : currentUser.role === "SALES_MANAGER"
              ? managerRoutes
              : null;
        const permitted =
          permittedRoutes === null ||
          permittedRoutes.some(
            (route) =>
              pathname === route || pathname.startsWith(`${route}/`),
          );
        if (!permitted) {
          window.location.replace(
            currentUser.role === "ADMIN" ? "/admin" : "/dashboard",
          );
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

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <Link className="dashboard-brand" href="/dashboard">
          <span>DUROZEN</span>
          <small>CRM</small>
        </Link>
        <nav aria-label="Main navigation">
          {navigationForRole.map(([label, href]) => {
              if (label === "Activities") {
                const activityLinks = [
                  ["Tasks", "/tasks"],
                  ["Meetings", "/meetings"],
                  ["Calls & Msg", "/activities/calls"],
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
                          const iconPath =
                            childLabel === "Tasks"
                              ? "M4 3.5h12v13H4z M7 7h.01 M9 7h4 M7 10h.01 M9 10h4 M7 13h.01 M9 13h4"
                              : childLabel === "Meetings"
                                ? "M3.5 5.5h13v11h-13z M6.5 3.5v4 M13.5 3.5v4 M3.5 8.5h13"
                                : "M6.2 3.8 8.4 6l-1.5 2.1a12 12 0 0 0 5 5l2.1-1.5 2.2 2.2-1.3 2.7c-.3.6-1 .9-1.7.8A14.5 14.5 0 0 1 2.7 4.8c-.1-.7.2-1.4.8-1.7z";
                          return (
                            <Link
                              aria-current={childSelected ? "page" : undefined}
                              className={childSelected ? "selected" : ""}
                              href={childHref}
                              key={childHref}
                              title={childLabel}
                            >
                              <svg aria-hidden="true" viewBox="0 0 20 20">
                                <path d={iconPath} />
                              </svg>
                              {childLabel}
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

              return (
                <Link
                  aria-current={selected ? "page" : undefined}
                  className={selected ? "selected" : ""}
                  href={href}
                  key={href}
                  title={label}
                >
                  {label}
                </Link>
              );
            })}
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
