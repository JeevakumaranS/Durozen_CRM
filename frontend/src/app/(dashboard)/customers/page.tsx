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
  useEffect(() => {
    apiClient<Customer[]>("/customers")
      .then(setCustomers)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load customers.",
        ),
      );
  }, []);
  const filtered = customers.filter((customer) =>
    [
      customer.customerName,
      customer.businessName,
      customer.mobileNumber,
      customer.assignedBde.fullName,
    ].some((value) => value?.toLowerCase().includes(query.toLowerCase())),
  );
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
            onChange={(event) => setQuery(event.target.value)}
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
            {filtered.map((customer) => (
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
        {filtered.length === 0 && (
          <div className="empty-list">No won customers found.</div>
        )}
      </div>
    </main>
  );
}
