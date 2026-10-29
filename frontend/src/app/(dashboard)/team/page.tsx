"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, apiClient } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/auth";
import { notify } from "../../../lib/notifications";

type TeamUser = {
  id: string;
  fullName: string;
  email: string;
  role: "SALES_MANAGER" | "BDE";
  canViewCustomers: boolean;
  isActive: boolean;
  isOnline: boolean;
  lastActiveAt: string | null;
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
type CreateRole = "" | "BDE" | "SALES_MANAGER";
const PAGE_SIZE = 10;
const ONLINE_WINDOW_MS = 2 * 60_000;
const EXACT_TIME_AFTER_MS = 20 * 60 * 60_000;

function PasswordVisibilityToggle({
  visible,
  onToggle,
  label,
}: {
  visible: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      aria-label={`${visible ? "Hide" : "Show"} ${label}`}
      className="password-visibility-toggle"
      onClick={onToggle}
      type="button"
    >
      <svg
        aria-hidden="true"
        fill="none"
        height="18"
        viewBox="0 0 24 24"
        width="18"
      >
        {visible ? (
          <>
            <path
              d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
            <circle
              cx="12"
              cy="12"
              r="3"
              stroke="currentColor"
              strokeWidth="2"
            />
          </>
        ) : (
          <>
            <path
              d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
            <path
              d="M9.9 5.2A10 10 0 0 1 12 5c6.4 0 10 7 10 7a15 15 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1.1 0 2.1-.2 3-.5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </>
        )}
      </svg>
    </button>
  );
}

function formatPresence(
  lastActiveAt: string | null,
  isOnline: boolean,
  now: number,
) {
  if (!lastActiveAt) return "Never";
  const lastActive = new Date(lastActiveAt);
  if (Number.isNaN(lastActive.getTime())) return "Never";
  const elapsed = Math.max(0, now - lastActive.getTime());
  if (isOnline && elapsed <= ONLINE_WINDOW_MS) return "Online";
  if (elapsed > EXACT_TIME_AFTER_MS) {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(lastActive);
  }

  const minutes = Math.floor(elapsed / 60_000);
  if (minutes === 0) return "Just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "min" : "mins"} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} ${hours === 1 ? "hr" : "hrs"} ago`;
}

export default function TeamPage() {
  const [items, setItems] = useState<TeamUser[]>([]);
  const [managers, setManagers] = useState<
    { id: string; fullName: string }[]
  >([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [role, setRole] = useState<CreateRole>("");
  const [canViewCustomers, setCanViewCustomers] = useState(false);
  const [managerId, setManagerId] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingUser, setEditingUser] = useState<TeamUser | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editCanViewCustomers, setEditCanViewCustomers] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editPassword, setEditPassword] = useState("");
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [now, setNow] = useState(() => Date.now());

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

  const refresh = useCallback(async () => {
    try {
      await load();
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Unable to refresh team.",
        "error",
      );
    }
  }, [load]);

  useEffect(() => {
    if (!getAccessToken()) {
      window.location.replace("/login");
      return;
    }
    let current = true;
    setLoading(true);
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
        if (current)
          notify(
            reason instanceof Error
              ? reason.message
              : "Unable to verify Admin access.",
            "error",
          );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [load]);

  useEffect(() => {
    const refreshPresence = () => {
      setNow(Date.now());
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = window.setInterval(refreshPresence, 60_000);
    document.addEventListener("visibilitychange", refreshPresence);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshPresence);
    };
  }, [load, refresh]);

  async function updateManager(userId: string, managerId: string) {
    try {
      await apiClient(`/users/${userId}/manager`, {
        method: "PATCH",
        body: JSON.stringify({ managerId: managerId || null }),
      });
      await refresh();
      notify("BDE manager assignment updated.");
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Unable to update assignment.",
        "error",
      );
    }
  }

  async function updateStatus(user: TeamUser) {
    try {
      await apiClient(`/users/${user.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      await refresh();
      notify(`${user.fullName}'s account was updated.`);
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Unable to update account.",
        "error",
      );
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!role) {
      notify("Choose a role for the team account.", "error");
      return;
    }
    setCreating(true);
    try {
      await apiClient<TeamUser>("/users", {
        method: "POST",
        body: JSON.stringify({
          fullName,
          email,
          password,
          role,
          canViewCustomers,
          managerId: role === "BDE" ? managerId || null : null,
        }),
      });
      setFullName("");
      setEmail("");
      setPassword("");
      setShowCreatePassword(false);
      setRole("");
      setCanViewCustomers(false);
      setManagerId("");
      setShowCreateForm(false);
      setPage(1);
      await refresh();
      notify("Team account created successfully.");
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Unable to create account.",
        "error",
      );
    } finally {
      setCreating(false);
    }
  }

  function closeCreateForm() {
    setShowCreateForm(false);
    setPassword("");
    setShowCreatePassword(false);
    setCanViewCustomers(false);
  }

  function openEdit(user: TeamUser) {
    setEditingUser(user);
    setEditFullName(user.fullName);
    setEditEmail(user.email);
    setEditCanViewCustomers(user.canViewCustomers);
    setEditPassword("");
    setShowEditPassword(false);
  }

  function closeEditForm() {
    setEditingUser(null);
    setEditPassword("");
    setShowEditPassword(false);
    setEditCanViewCustomers(false);
  }

  async function updateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUser) return;
    setSavingEdit(true);
    try {
      await apiClient<TeamUser>(`/users/${editingUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullName: editFullName.trim(),
          email: editEmail.trim(),
          canViewCustomers: editCanViewCustomers,
        }),
      });
      closeEditForm();
      await refresh();
      notify("Team account details updated.");
    } catch (reason) {
      notify(
        reason instanceof Error
          ? reason.message
          : "Unable to update team account.",
        "error",
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUser) return;
    setSavingPassword(true);
    try {
      await apiClient(`/users/${editingUser.id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ password: editPassword }),
      });
      closeEditForm();
      notify("Team account password updated successfully.");
    } catch (reason) {
      notify(
        reason instanceof Error
          ? reason.message
          : "Unable to update team account password.",
        "error",
      );
    } finally {
      setSavingPassword(false);
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
    try {
      await apiClient(`/users/${user.id}`, { method: "DELETE" });
      notify(`${user.fullName}'s account was deleted.`);
      if (items.length === 1 && page > 1) {
        setPage((current) => current - 1);
      } else {
        await refresh();
      }
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Unable to delete account.",
        "error",
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
            onClick={() => {
              setRole("");
              setPassword("");
              setShowCreatePassword(false);
              setShowCreateForm(true);
            }}
          >
            + Create team account
          </button>
          <Link className="secondary-action" href="/dashboard">
            Dashboard
          </Link>
        </div>
      </header>

      <div className="follow-up-search-row">
        <label className="search-field follow-up-search">
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
      <section className="panel admin-team">
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
                      title={
                        user.lastActiveAt
                          ? new Intl.DateTimeFormat("en-IN", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(user.lastActiveAt))
                          : undefined
                      }
                    >
                      {user.isActive
                        ? formatPresence(user.lastActiveAt, user.isOnline, now)
                        : "Inactive"}
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
            if (event.target === event.currentTarget) closeCreateForm();
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
                onClick={closeCreateForm}
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
              <label className="form-wide password-field-label">
                <span>Temporary password *</span>
                <div className="password-input-wrap">
                  <input
                    required
                    type={showCreatePassword ? "text" : "password"}
                    minLength={10}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <PasswordVisibilityToggle
                    visible={showCreatePassword}
                    onToggle={() =>
                      setShowCreatePassword((visible) => !visible)
                    }
                    label="temporary password"
                  />
                </div>
              </label>
              <label className="form-wide">
                Role *
                <select
                  required
                  value={role}
                  onChange={(event) => {
                    const selectedRole = event.target.value;
                    setRole(
                      selectedRole === "BDE" ||
                        selectedRole === "SALES_MANAGER"
                        ? selectedRole
                        : "",
                    );
                  }}
                >
                  <option value="" disabled>
                    Choose a role
                  </option>
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
              {role && (
                <label className="form-wide team-customer-access">
                  <span>Customer section</span>
                  <span className="team-customer-access-control">
                    <input
                      aria-label="Show Customers section for this user"
                      type="checkbox"
                      role="switch"
                      checked={canViewCustomers}
                      onChange={(event) =>
                        setCanViewCustomers(event.target.checked)
                      }
                    />
                    Show Customers section for this user
                  </span>
                  {/* <small>
                    Adds the Customers page to their navigation and grants
                    access to won accounts.
                  </small> */}
                </label>
              )}
              <div className="form-footer">
                <p>
                  Use at least 10 characters and share the temporary password
                  securely.
                </p>
                <button className="primary" disabled={creating || !role}>
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
            if (event.target === event.currentTarget) closeEditForm();
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
                onClick={closeEditForm}
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
              <label className="form-wide team-customer-access">
                <span>Customer section</span>
                <span className="team-customer-access-control">
                  <input
                    aria-label="Show Customers section for this user"
                    type="checkbox"
                    role="switch"
                    checked={editCanViewCustomers}
                    onChange={(event) =>
                      setEditCanViewCustomers(event.target.checked)
                    }
                  />
                  Show Customers section for this user
                </span>
                {/* <small>
                  Adds the Customers page to their navigation and grants
                  access to won accounts.
                </small> */}
              </label>
              <div className="form-footer">
                <p>Changing the email address or password will sign out the current account.</p>
                <button className="primary" disabled={savingEdit}>
                  {savingEdit ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
            <form
              className="lead-form team-password-form"
              onSubmit={updatePassword}
            >
              <label className="form-wide password-field-label">
                <span>Set a new password *</span>
                <div className="password-input-wrap">
                  <input
                    required
                    type={showEditPassword ? "text" : "password"}
                    minLength={10}
                    value={editPassword}
                    onChange={(event) => setEditPassword(event.target.value)}
                  />
                  <PasswordVisibilityToggle
                    visible={showEditPassword}
                    onToggle={() =>
                      setShowEditPassword((visible) => !visible)
                    }
                    label="new password"
                  />
                </div>
              </label>
              <div className="form-footer">
                <p>Use at least 10 characters. Share the new password securely.</p>
                <button
                  className="primary"
                  disabled={savingPassword || editPassword.length < 10}
                >
                  {savingPassword ? "Updating..." : "Update password"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
