"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";

type Customer = {
  id: string;
  customerName: string;
  businessName?: string | null;
  businessCategory?: string | null;
  mobileNumber: string;
  email?: string | null;
  location?: string | null;
  requirement?: string | null;
  finalDealValue?: string | number | null;
  wonService?: string | null;
  paymentStatus?: string | null;
  stageEnteredAt: string;
  assignedBde: { fullName: string };
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  useEffect(() => {
    apiClient<Customer[]>("/customers")
      .then(setCustomers)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load customers.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  const filtered = customers.filter((customer) =>
    [
      customer.customerName,
      customer.businessName,
      customer.mobileNumber,
      customer.assignedBde.fullName,
    ].some((value) => value?.toLowerCase().includes(query.toLowerCase())),
  );
    const pageSize = 10;
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const visibleCustomers = filtered.slice(
      (page - 1) * pageSize,
      page * pageSize,
    );
    useEffect(() => {
      if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);
    return (
    <main className="lead-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">WON ACCOUNTS</p>
          <h1>Customers</h1>
          <p className="subtitle">
            Customer accounts confirmed from won opportunities.
          </p>
        </div>
        <Link className="secondary-action" href="/leads">
          All leads
        </Link>
      </header>
      {error && (
        <div className="workspace-notice" role="alert">
          {error}
        </div>
      )}
      <div className="workspace-toolbar">
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="Search customers"
            placeholder="Search name, company, mobile, BDE..."
            value={query}
            onChange={(event) => {
              setPage(1);
              setQuery(event.target.value);
            }}
          />
        </label>
        <span className="result-count">{filtered.length} customers</span>
      </div>
      <div className="lead-table-wrap">
        <table className="lead-table customer-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Company</th>
              <th>Mobile / Email</th>
              <th>Service / project</th>
              <th>BDE</th>
              <th>Deal value</th>
              <th>Payment</th>
              <th>Won date</th>
            </tr>
          </thead>
          <tbody>
            {visibleCustomers.map((customer) => (
              <tr key={customer.id}>
                <td>
                  <Link href={`/leads/${customer.id}`}>
                    {customer.customerName}
                  </Link>
                </td>
                <td>
                  {customer.businessName || customer.businessCategory || "—"}
                </td>
                <td>
                  {customer.mobileNumber}
                  <small>{customer.email || ""}</small>
                </td>
                <td>{customer.wonService || customer.requirement || "—"}</td>
                <td>{customer.assignedBde.fullName}</td>
                <td>
                  {customer.finalDealValue
                    ? `₹${Number(customer.finalDealValue).toLocaleString("en-IN")}`
                    : "—"}
                </td>
                <td>{customer.paymentStatus || "—"}</td>
                <td>
                  {new Intl.DateTimeFormat("en-IN", {
                    dateStyle: "medium",
                  }).format(new Date(customer.stageEnteredAt))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="empty-list">Loading customers...</div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="empty-list">No won customers found.</div>
        )}
      </div>
      {!loading && !error && (
        <nav className="pagination" aria-label="Customers pagination">
          <span>
            {filtered.length} {filtered.length === 1 ? "customer" : "customers"} ·
            Page {page} of {totalPages}
          </span>
          <div className="pagination-controls">
            <button
              className="secondary-action"
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
            >
              Previous
            </button>
            <strong>{page} / {totalPages}</strong>
            <button
              className="secondary-action"
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page === totalPages}
            >
              Next
            </button>
          </div>
        </nav>
      )}
    </main>
  );
}
