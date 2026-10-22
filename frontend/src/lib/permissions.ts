export type UserRole = "ADMIN" | "SALES_MANAGER" | "BDE";

export function hasRole(userRole: UserRole, allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(userRole);
}

const bdeRoutes = [
  "/dashboard",
  "/leads",
  "/pipeline",
  "/activities",
  "/activities/calls",
  "/activities/meetings",
  "/activities/proposals",
  "/activities/negotiations",
  "/meetings",
  "/proposals",
  "/negotiations",
  "/performance",
];

const managerRoutes = [
  "/dashboard",
  "/leads",
  "/pipeline",
  "/activities/proposals",
  "/activities/negotiations",
  "/proposals",
  "/negotiations",
  "/performance",
  "/reports",
  "/monthly-summary",
];

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function canAccessRoute(userRole: UserRole, pathname: string): boolean {
  if (userRole === "ADMIN") return true;
  if (userRole === "SALES_MANAGER" && matchesRoute(pathname, "/leads/new")) {
    return false;
  }
  const allowedRoutes = userRole === "BDE" ? bdeRoutes : managerRoutes;
  return allowedRoutes.some((route) => matchesRoute(pathname, route));
}
