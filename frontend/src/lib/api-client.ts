import { clearAccessToken, getAccessToken } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export async function apiClient<T>(path: string, init: RequestInit = {}) {
  const token = getAccessToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    if (
      response.status === 401 &&
      path !== "/auth/login" &&
      typeof window !== "undefined"
    ) {
      clearAccessToken();
      window.location.assign("/login");
    }
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}
