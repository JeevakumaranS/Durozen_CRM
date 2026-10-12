"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";

type TeamUser = {
  id: string;
  fullName: string;
  email: string;
  role: "ADMIN" | "SALES_MANAGER" | "BDE";
  isActive: boolean;
};

export default function UsersPage() {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<TeamUser["role"]>("BDE");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setUsers(await apiClient<TeamUser[]>("/users"));
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Unable to load users.",
      );
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await apiClient<TeamUser>("/users", {
        method: "POST",
        body: JSON.stringify({ fullName, email, password, role }),
      });
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("BDE");
      setShowForm(false);
      setNotice("Team account created.");
      await load();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Unable to create user.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggle(user: TeamUser) {
    try {
      await apiClient<TeamUser>(`/users/${user.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      await load();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Unable to update account.",
      );
    }
  }

  return (
    <main className="lead-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">ACCESS MANAGEMENT</p>
          <h1>Team users</h1>
          <p className="subtitle">Manage account access and sales roles.</p>
        </div>
        <div className="workspace-actions">
          <Link className="secondary-action" href="/dashboard">
            Dashboard
          </Link>
          <button className="primary" onClick={() => setShowForm(true)}>
            + Add user
          </button>
        </div>
      </header>
      {notice && (
        <div className="workspace-notice" role="status">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}
      <div className="lead-table-wrap">
        <table className="lead-table user-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Access</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.fullName}</td>
                <td>{user.email}</td>
                <td>
                  <span className="stage-pill">
                    {user.role.replaceAll("_", " ")}
                  </span>
                </td>
                <td>{user.isActive ? "Active" : "Inactive"}</td>
                <td>
                  <button
                    className="user-toggle"
                    onClick={() => void toggle(user)}
                  >
                    {user.isActive ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="empty-list">No users available.</div>
        )}
      </div>
      {showForm && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowForm(false);
          }}
        >
          <section
            className="lead-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-user-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">TEAM ACCESS</p>
                <h2 id="new-user-title">Create account</h2>
              </div>
              <button
                className="modal-close"
                aria-label="Close"
                onClick={() => setShowForm(false)}
              >
                ×
              </button>
            </div>
            <form className="lead-form" onSubmit={createUser}>
              <label className="form-wide">
                Full name *
                <input
                  required
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                />
              </label>
              <label className="form-wide">
                Email *
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className="form-wide">
                Temporary password *
                <input
                  required
                  type="password"
                  minLength={10}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <label className="form-wide">
                Role
                <select
                  value={role}
                  onChange={(event) =>
                    setRole(event.target.value as TeamUser["role"])
                  }
                >
                  <option value="BDE">BDE / Sales Executive</option>
                  <option value="SALES_MANAGER">Sales Manager</option>
                  <option value="ADMIN">Admin / Owner</option>
                </select>
              </label>
              <div className="form-footer">
                <p>New users can sign in with this temporary password.</p>
                <button className="primary" disabled={busy}>
                  {busy ? "Creating..." : "Create user"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
