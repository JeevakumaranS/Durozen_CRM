"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, apiClient } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/auth";

type TeamUser = {
  id: string;
  fullName: string;
  email: string;
  role: "SALES_MANAGER" | "BDE";
  isActive: boolean;
  managerId: string | null;
  manager: { id: string; fullName: string } | null;
  _count: { leads: number; managedBdes: number };
};

type TeamPageData = {
  items: TeamUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type AdminUser = {
  role: "ADMIN";
};
type CreateRole = "BDE" | "SALES_MANAGER";
const PAGE_SIZE = 10;

export default function AdminTeamPage() {
  const [items, setItems] = useState<TeamUser[]>([]);
  const [managers, setManagers] = useState<
    { id: string; fullName: string }[]
  >([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<CreateRole>("BDE");
  const [managerId, setManagerId] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingUser, setEditingUser] = useState<TeamUser | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (search.trim()) params.set("search", search.trim());
    const [result, activeManagers] = await Promise.all([
      apiClient<TeamPageData>(`/users?${params}`),
      apiClient<{ id: string; fullName: string }[]>("/users/managers"),
    ]);
    setItems(result.items);
    setTotal(result.total);
    setTotalPages(result.totalPages);
    setManagers(activeManagers);
  }, [page, search]);

  useEffect(() => {
    if (!getAccessToken()) {
      window.location.replace("/login");
      return;
    }
    let current = true;
    setLoading(true);
    setError("");
    apiClient<AdminUser>("/admin/profile")
      .then(() => load())
      .catch((reason: unknown) => {
        if (reason instanceof ApiError && reason.status === 401) {
          window.location.replace("/login");
          return;
        }
        if (reason instanceof ApiError && reason.status === 403) {
          window.location.replace("/dashboard");
          return;
        }
        if (current) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to verify Admin access.",
          );
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [load]);

  async function refresh() {
    try {
      await load();
      setNotice("");
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "Unable to refresh team.",
      );
    }
  }

  async function updateManager(userId: string, managerId: string) {
    setNotice("");
    try {
      await apiClient(`/users/${userId}/manager`, {
        method: "PATCH",
        body: JSON.stringify({ managerId: managerId || null }),
      });
      await refresh();
      setNotice("BDE manager assignment updated.");
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "Unable to update assignment.",
      );
    }
  }

  async function updateStatus(user: TeamUser) {
    setNotice("");
    try {
      await apiClient(`/users/${user.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      await refresh();
      setNotice(`${user.fullName}'s account was updated.`);
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "Unable to update account.",
      );
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setNotice("");
    try {
      await apiClient<TeamUser>("/users", {
        method: "POST",
        body: JSON.stringify({
          fullName,
          email,
          password,
          role,
          managerId: role === "BDE" ? managerId || null : null,
        }),
      });
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("BDE");
      setManagerId("");
      setShowCreateForm(false);
      setPage(1);
      await refresh();
      setNotice("Team account created successfully.");
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "Unable to create account.",
      );
    } finally {
      setCreating(false);
    }
  }

  function openEdit(user: TeamUser) {
    setEditingUser(user);
    setEditFullName(user.fullName);
    setEditEmail(user.email);
  }

  async function updateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUser) return;
    setSavingEdit(true);
    setNotice("");
    try {
      await apiClient<TeamUser>(`/users/${editingUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullName: editFullName.trim(),
          email: editEmail.trim(),
        }),
      });
      setEditingUser(null);
      await refresh();
      setNotice("Team account details updated.");
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Unable to update team account.",
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteUser(user: TeamUser) {
    const detail =
      user.role === "BDE" && user._count.leads > 0
        ? ` This BDE owns ${user._count.leads} leads, so the API will require those leads to be reassigned first.`
        : user.role === "SALES_MANAGER" && user._count.managedBdes > 0
          ? ` This manager has ${user._count.managedBdes} BDEs assigned, so reassign them first.`
          : "";
    if (
      !window.confirm(
        `Delete ${user.fullName}'s account?${detail} This action cannot be undone.`,
      )
    ) {
      return;
    }
    setNotice("");
    try {
      await apiClient(`/users/${user.id}`, { method: "DELETE" });
      setNotice(`${user.fullName}'s account was deleted.`);
      if (items.length === 1 && page > 1) {
        setPage((current) => current - 1);
      } else {
        await refresh();
      }
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "Unable to delete account.",
      );
    }
  }

  return (
    <main className="lead-workspace admin-workspace admin-team-page">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h1>Manage team</h1>
          <p className="subtitle">
            View team accounts, assign BDEs, manage access, and remove accounts.
          </p>
        </div>
        <div className="workspace-actions">
          <button
            className="primary"
            onClick={() => setShowCreateForm(true)}
          >
            + Create team account
          </button>
          <Link className="secondary-action" href="/admin">
            Admin dashboard
          </Link>
        </div>
      </header>

      {error && (
        <div className="workspace-notice" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="workspace-notice" role="status">
          {notice}
          <button onClick={() => setNotice("")} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <section className="panel admin-team">
        <div className="activity-tools admin-team-tools">
          <label className="search-field">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Search team"
              placeholder="Search name, email, or manager"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
        <div className="lead-table-wrap admin-team-table-wrap">
          <table className="lead-table admin-team-table">
            <thead>
              <tr>
                <th>Team member</th>
                <th>Role</th>
                <th>Sales Manager</th>
                <th>Leads / BDEs</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.fullName}</strong>
                    <small className="admin-team-email">{user.email}</small>
                  </td>
                  <td>
                    <span className="stage-pill">
                      {user.role.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td>
                    {user.role === "BDE" ? (
                      <select
                        aria-label={`Sales Manager for ${user.fullName}`}
                        value={user.managerId ?? ""}
                        onChange={(event) =>
                          void updateManager(user.id, event.target.value)
                        }
                      >
                        <option value="">Unassigned</option>
                        {managers.map((manager) => (
                          <option key={manager.id} value={manager.id}>
                            {manager.fullName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {user.role === "BDE"
                      ? user._count.leads
                      : `${user._count.managedBdes} BDEs`}
                  </td>
                  <td>
                    <span
                      className={`stage-pill${user.isActive ? "" : " inactive"}`}
                    >
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div className="admin-team-actions">
                      <button
                        className="user-toggle"
                        onClick={() => openEdit(user)}
                      >
                        Edit
                      </button>
                      <button
                        className="user-toggle"
                        onClick={() => void updateStatus(user)}
                      >
                        {user.isActive ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        className="user-delete"
                        onClick={() => void deleteUser(user)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && items.length === 0 && (
            <p className="empty-list">No team accounts match this search.</p>
          )}
          {loading && (
            <p className="empty-list" role="status">
              Loading team accounts...
            </p>
          )}
        </div>
        {!loading && (
          <nav className="pagination" aria-label="Team pages">
            <span>
              {total === 0
                ? "0–0 of 0"
                : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
            </span>
            {totalPages > 0 && (
              <div className="pagination-controls">
                <button
                  className="secondary-action"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </button>
                <strong>
                  Page {page} of {totalPages}
                </strong>
                <button
                  className="secondary-action"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </nav>
        )}
      </section>
      {showCreateForm && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowCreateForm(false);
          }}
        >
          <section
            className="lead-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-team-user-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">TEAM ACCOUNT</p>
                <h2 id="new-team-user-title">Create team account</h2>
              </div>
              <button
                className="modal-close"
                aria-label="Close"
                onClick={() => setShowCreateForm(false)}
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
                    setRole(event.target.value as CreateRole)
                  }
                >
                  <option value="BDE">BDE / Sales Executive</option>
                  <option value="SALES_MANAGER">Sales Manager</option>
                </select>
              </label>
              {role === "BDE" && (
                <label className="form-wide">
                  Sales Manager
                  <select
                    value={managerId}
                    onChange={(event) => setManagerId(event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {managers.map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.fullName}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="form-footer">
                <p>Share the temporary password securely with the new user.</p>
                <button className="primary" disabled={creating}>
                  {creating ? "Creating..." : "Create account"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {editingUser && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditingUser(null);
          }}
        >
          <section
            className="lead-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-team-user-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">TEAM ACCOUNT</p>
                <h2 id="edit-team-user-title">Edit team account</h2>
              </div>
              <button
                className="modal-close"
                aria-label="Close"
                onClick={() => setEditingUser(null)}
              >
                ×
              </button>
            </div>
            <form className="lead-form" onSubmit={updateUser}>
              <label className="form-wide">
                Full name *
                <input
                  required
                  value={editFullName}
                  onChange={(event) => setEditFullName(event.target.value)}
                />
              </label>
              <label className="form-wide">
                Email *
                <input
                  required
                  type="email"
                  value={editEmail}
                  onChange={(event) => setEditEmail(event.target.value)}
                />
              </label>
              <label className="form-wide">
                Role
                <input
                  value={editingUser.role.replaceAll("_", " ")}
                  readOnly
                />
              </label>
              <div className="form-footer">
                <p>Changing the email address will sign out the current account.</p>
                <button className="primary" disabled={savingEdit}>
                  {savingEdit ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
