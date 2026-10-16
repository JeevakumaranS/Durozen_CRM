import { clearAccessToken, getAccessToken } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

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
