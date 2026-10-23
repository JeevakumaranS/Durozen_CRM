import { clearAccessToken, getAccessToken } from "./auth";

export function getApiUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured.");
  }
  return apiUrl;
}

export const API_DATA_CHANGED_EVENT = "durozen:data-changed";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiClientResponse(path: string, init: RequestInit = {}) {
  const token = getAccessToken();
  const response = await fetch(`${getApiUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const responseText = await response.text();
    let message = responseText;
    let tokenExpired = false;
    try {
      const body: unknown = JSON.parse(responseText);
      if (body && typeof body === "object") {
        if ("code" in body) tokenExpired = body.code === "TOKEN_EXPIRED";
        if ("message" in body) {
          const detail = body.message;
          message = Array.isArray(detail)
            ? detail.join(", ")
            : String(detail);
        }
      }
    } catch {
      message = responseText;
    }
    if (
      response.status === 401 &&
      path !== "/auth/login" &&
      path !== "/auth/logout" &&
      typeof window !== "undefined"
    ) {
      if (tokenExpired) {
        window.sessionStorage.setItem("durozen_token_expired", "true");
      }
      clearAccessToken();
      window.location.assign("/login");
    }
    throw new ApiError(message || "The request could not be completed.", response.status);
  }
  const method = (init.method ?? "GET").toUpperCase();
  if (
    typeof window !== "undefined" &&
    !["GET", "HEAD", "OPTIONS"].includes(method)
  ) {
    window.dispatchEvent(new Event(API_DATA_CHANGED_EVENT));
  }
  return response;
}

export async function apiClient<T>(path: string, init: RequestInit = {}) {
  const response = await apiClientResponse(path, init);
  return response.json() as Promise<T>;
}

export async function logoutAndRedirect(): Promise<void> {
  let logoutFailed = false;
  try {
    await apiClient<{ message: string }>("/auth/logout", { method: "POST" });
  } catch {
    logoutFailed = true;
  } finally {
    clearAccessToken();
    if (logoutFailed && typeof window !== "undefined") {
      window.sessionStorage.setItem(
        "durozen_logout_warning",
        "The local session was cleared, but the server could not confirm token revocation.",
      );
    }
    if (typeof window !== "undefined") window.location.assign("/login");
  }
}
