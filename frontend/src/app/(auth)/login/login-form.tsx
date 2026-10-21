"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "../../../lib/api-client";
import {
  AuthUser,
  clearAccessToken,
  getAccessToken,
  setAccessToken,
  setAuthUser,
} from "../../../lib/auth";
import { notify } from "../../../lib/notifications";

type LoginResponse = { accessToken: string; user: AuthUser };

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const tokenExpired = window.sessionStorage.getItem("durozen_token_expired");
    if (tokenExpired) {
      notify("Your session has expired. Please sign in again.", "error");
      window.sessionStorage.removeItem("durozen_token_expired");
    }
    const warning = window.sessionStorage.getItem("durozen_logout_warning");
    if (warning) {
      notify(warning, "error");
      window.sessionStorage.removeItem("durozen_logout_warning");
    }
    if (!getAccessToken()) return;

    apiClient<AuthUser>("/auth/me")
      .then((user) => {
        setAuthUser(user);
        router.replace("/dashboard");
      })
      .catch(() => clearAccessToken());
  }, [router]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await apiClient<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setAccessToken(result.accessToken);
      setAuthUser(result.user);
      router.replace("/dashboard");
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Unable to sign in.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <p className="login-brand">
          DUROZEN <span>CRM</span>
        </p>
        <p className="eyebrow">SALES OPERATIONS</p>
        <h1>Welcome back</h1>
        <p className="login-copy">Sign in to your sales workspace.</p>
        <form onSubmit={login} className="login-form">
          <label>
            Email address
            <input
              required
              type="email"
              autoComplete="username"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              required
              type="password"
              autoComplete="current-password"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
      <aside className="login-aside">
        <span>DUROZEN TECHNOLOGIES</span>
        <h2>Make every customer conversation count.</h2>
        <p>Leads, follow-ups, and sales progress in one shared workspace.</p>
      </aside>
    </main>
  );
}
