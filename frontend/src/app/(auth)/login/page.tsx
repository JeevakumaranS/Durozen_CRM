"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "../../../lib/api-client";
import { AuthUser, setAccessToken, setAuthUser } from "../../../lib/auth";

type LoginResponse = { accessToken: string; user: AuthUser };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await apiClient<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setAccessToken(result.accessToken);
      setAuthUser(result.user);
      router.replace("/dashboard");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in.");
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
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}
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
