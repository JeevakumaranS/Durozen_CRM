"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiClient } from "../../lib/api-client";
import { getAccessToken } from "../../lib/auth";
import { notify } from "../../lib/notifications";
import AdminDashboard, { AdminProfile } from "./admin-dashboard";

export default function AdminPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    apiClient<AdminProfile>("/admin/profile")
      .then((adminProfile) => {
        setProfile(adminProfile);
        setChecking(false);
      })
      .catch((reason: unknown) => {
        if (reason instanceof ApiError && reason.status === 401) {
          router.replace("/login");
          return;
        }
        if (reason instanceof ApiError && reason.status === 403) {
          router.replace("/dashboard");
          return;
        }
        const message =
          reason instanceof Error
            ? reason.message
            : "Unable to verify administrator access.";
        setError(message);
        notify(message, "error");
        setChecking(false);
      });
  }, [router]);

  if (checking) {
    return <main className="dashboard-loading">Verifying Admin access...</main>;
  }
  if (profile) return <AdminDashboard profile={profile} />;
  if (error) return null;
  return null;
}
