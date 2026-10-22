import * as assert from "node:assert/strict";
import { test } from "node:test";
import { buildReportTable } from "./export.utils";

test("report table definitions expose the requested columns in stable order", () => {
  const expected: Record<string, string[]> = {
    leads: [
      "Lead Name",
      "Company",
      "Contact Information",
      "Lead Source",
      "Assigned BDE",
      "Current Stage",
      "Created Date",
      "Next Follow-up",
    ],
    "bde-performance": [
      "BDE Name",
      "Total Leads",
      "Contacted Leads",
      "Interested Leads",
      "Follow-ups Completed",
      "Overdue Follow-ups",
      "Meetings",
      "Proposals",
      "Won Deals",
      "Lost Deals",
      "Revenue Generated",
    ],
    pipeline: [
      "Lead / Deal",
      "Company",
      "Assigned BDE",
      "Pipeline Stage",
      "Lead Source",
      "Expected Deal Value",
      "Last Activity Date",
      "Next Follow-up",
      "Days in Stage",
    ],
    "follow-ups": [
      "Lead Name",
      "Company",
      "Assigned BDE",
      "Follow-up Date",
      "Follow-up Type",
      "Status",
      "Next Action",
      "Last Activity / Notes",
    ],
    proposals: [
      "Lead Number",
      "Lead / Company",
      "Assigned BDE",
      "Proposal Date",
      "Proposal Value",
      "Status / Response",
    ],
    "won-lost": [
      "Lead / Deal",
      "Company",
      "Assigned BDE",
      "Final Outcome",
      "Outcome Date",
      "Deal Value",
      "Lost Reason",
    ],
    revenue: ["Won Date", "Lead / Deal", "Company", "Assigned BDE", "Revenue"],
    "lost-leads": [
      "Lead / Deal",
      "Company",
      "Assigned BDE",
      "Lost Date",
      "Lost Reason / Category",
      "Deal Value",
    ],
  };

  for (const [type, labels] of Object.entries(expected)) {
    const report = buildReportTable([], type);
    assert.deepEqual(
      report.columns.map((column) => column.label),
      labels,
      `${type} columns`,
    );
  }
});

test("lead, revenue, and lost reason report values use stored records", () => {
  const leadReport = buildReportTable(
    [
      {
        customerName: "Example",
        mobileNumber: "123",
        email: "example@example.test",
      },
    ],
    "leads",
  );
  assert.equal(leadReport.rows[0].contactInformation, "123 · example@example.test");

  const revenueReport = buildReportTable(
    [
      { finalDealValue: "100.25" },
      { finalDealValue: "49.75" },
    ],
    "revenue",
  );
  assert.deepEqual(revenueReport.summary, [
    { label: "Won deals", value: 2, format: "number" },
    { label: "Total revenue", value: 150, format: "money" },
  ]);

  const lostReport = buildReportTable(
    [{ lostReason: "Budget" }, { lostReason: "Budget" }, { lostReason: null }],
    "lost-leads",
  );
  assert.deepEqual(lostReport.summary, [
    { label: "Budget", value: 2, format: "number" },
    { label: "Not recorded", value: 1, format: "number" },
  ]);
});

test("proposal reports derive the displayed lead number from the related lead", () => {
  const report = buildReportTable(
    [
      {
        lead: {
          leadNumber: "LD-2026-100",
          customerName: "Asha Rao",
        },
        finalAmount: "12500.50",
      },
    ],
    "proposals",
  );

  assert.equal(report.rows[0]["lead.leadNumber"], "LD-2026-100");
  assert.equal(report.rows[0].finalAmount, "12500.50");
});
