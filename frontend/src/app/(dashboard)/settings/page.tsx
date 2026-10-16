"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { notify } from "../../../lib/notifications";

export default function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmation) {
      notify("New passwords do not match.", "error");
      return;
    }
    setBusy(true);
    try {
      await apiClient<{ message: string }>("/auth/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      notify("Password updated.");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to update password.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="lead-workspace settings-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">ACCOUNT SECURITY</p>
          <h1>Settings</h1>
          <p className="subtitle">Manage your sign-in credentials.</p>
        </div>
        <Link className="secondary-action" href="/dashboard">
          Dashboard
        </Link>
      </header>
      <section className="panel settings-panel">
        <div>
          <h2>Change password</h2>
          <p>
            Use at least 10 characters. Your current session remains signed in.
          </p>
        </div>
        <form className="settings-form" onSubmit={changePassword}>
          <label>
            Current password
            <input
              required
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </label>
          <label>
            New password
            <input
              required
              type="password"
              minLength={10}
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>
          <label>
            Confirm new password
            <input
              required
              type="password"
              minLength={10}
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Updating..." : "Update password"}
          </button>
        </form>
      </section>
    </main>
  );
}
