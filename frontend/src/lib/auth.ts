const ACCESS_TOKEN_KEY = "durozen_access_token";
const AUTH_USER_KEY = "durozen_auth_user";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "SALES_MANAGER" | "BDE";
};

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(AUTH_USER_KEY);
  }
}

export function setAuthUser(user: AuthUser): void {
  window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function getAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(AUTH_USER_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as AuthUser;
  } catch {
    return null;
  }
}
