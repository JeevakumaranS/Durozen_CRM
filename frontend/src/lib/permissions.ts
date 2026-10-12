export type UserRole = "ADMIN" | "SALES_MANAGER" | "BDE";

export function hasRole(userRole: UserRole, allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(userRole);
}
