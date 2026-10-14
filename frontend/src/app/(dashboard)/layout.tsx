"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiClient, logoutAndRedirect } from "../../lib/api-client";
import { AuthUser, getAccessToken, setAuthUser } from "../../lib/auth";

const adminNavigation = [
  ["Dashboard", "/dashboard"],
  ["Leads", "/leads"],
  ["Pipeline", "/pipeline"],
  ["Follow-ups", "/follow-ups"],
  ["Activities", "/activities"],
  ["Meetings", "/meetings"],
  ["Proposals", "/proposals"],
  ["Negotiations", "/negotiations"],
  ["Customers", "/customers"],
  ["Performance", "/performance"],
  ["Admin dashboard", "/admin"],
];

const bdeRoutes = [
  "/dashboard",
  "/leads",
  "/pipeline",
  "/follow-ups",
  "/activities",
  "/meetings",
  "/proposals",
  "/customers",
  "/performance",
];
const managerRoutes = [
  "/dashboard",
  "/leads",
  "/pipeline",
  "/follow-ups",
  "/proposals",
  "/performance",
  "/reports",
];
const managerNavigation = [
  ["Dashboard", "/dashboard"],
  ["Leads", "/leads"],
  ["Pipeline", "/pipeline"],
  ["Follow-ups", "/follow-ups"],
  ["Proposals", "/proposals"],
  ["Performance", "/performance"],
  ["Reports", "/reports"],
];
const bdeNavigation = [
  ["Dashboard", "/dashboard"],
  ["Leads", "/leads"],
  ["Pipeline", "/pipeline"],
  ["Follow-ups", "/follow-ups"],
  ["Activities", "/activities"],
  ["Meetings", "/meetings"],
  ["Proposals", "/proposals"],
  ["Customers", "/customers"],
  ["Performance", "/performance"],
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
        if (reason instanceof Error) setError(reason.message);
        setLoading(false);
      });
  }, [pathname]);

  if (loading) {
    return <main className="dashboard-loading">Verifying access...</main>;
  }
  if (error) {
    return (
      <main className="dashboard-loading" role="alert">
        {error}
      </main>
    );
  }
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
