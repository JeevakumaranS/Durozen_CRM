export const USER_ROLES = ["ADMIN", "SALES_MANAGER", "BDE"] as const;
export type UserRole = (typeof USER_ROLES)[number];
