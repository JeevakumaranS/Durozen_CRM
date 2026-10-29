"use client";

import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { notify } from "../../../lib/notifications";

const ONLINE_WINDOW_MS = 2 * 60_000;
const EXACT_TIME_AFTER_MS = 20 * 60 * 60_000;

type TeamMember = {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  isOnline: boolean;
  lastActiveAt: string | null;
  _count: { leads: number };
};

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

export default function MyTeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    const loadMembers = async () => {
      try {
        const result = await apiClient<TeamMember[]>("/users/my-team");
        if (active) {
          setMembers(result);
          setNow(Date.now());
        }
      } catch (reason) {
        if (!active) return;
        notify(
          reason instanceof Error ? reason.message : "Unable to load your team.",
          "error",
        );
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadMembers();
    const interval = window.setInterval(loadMembers, 60_000);
    window.addEventListener("focus", loadMembers);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", loadMembers);
    };
  }, []);

  return (
    <main className="lead-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">TEAM OVERVIEW</p>
          <h1>My Team</h1>
          <p className="subtitle">BDEs assigned to you and their lead totals.</p>
        </div>
      </header>

      <section className="panel">
        <div className="lead-table-wrap">
          <table className="lead-table">
            <thead>
              <tr>
                <th>Team member</th>
                <th>Leads</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>
                    <strong>{member.fullName}</strong>
                    <small className="admin-team-email">{member.email}</small>
                  </td>
                  <td>{member._count.leads}</td>
                  <td>
                    <span
                      className={`stage-pill${member.isActive ? "" : " inactive"}`}
                      title={
                        member.lastActiveAt
                          ? new Intl.DateTimeFormat("en-IN", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(member.lastActiveAt))
                          : undefined
                      }
                    >
                      {member.isActive
                        ? formatPresence(member.lastActiveAt, member.isOnline, now)
                        : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && (
            <p className="empty-list" role="status">
              Loading team members...
            </p>
          )}
          {!loading && members.length === 0 && (
            <p className="empty-list">No BDEs are assigned to you yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}
