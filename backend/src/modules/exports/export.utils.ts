export type ReportColumn = {
  key: string;
  label: string;
  weight: number;
  format?: "date" | "money" | "number" | "percent";
  value: (row: Record<string, unknown>) => unknown;
};

export type ReportTable = {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  summary: { label: string; value: number | string; format?: ReportColumn["format"] }[];
};

export type ActivityTimelineEntry = {
  type: string;
  createdAt: Date | string;
  details: { label: string; value: string }[];
};

const field =
  (path: string) =>
  (row: Record<string, unknown>): unknown =>
    path.split(".").reduce<unknown>((value, part) => {
      if (!value || typeof value !== "object") return undefined;
      return (value as Record<string, unknown>)[part];
    }, row);

const column = (
  key: string,
  label: string,
  weight: number,
  format?: ReportColumn["format"],
  value = field(key),
): ReportColumn => ({ key, label, weight, format, value });

const assignedBde = column(
  "assignedBde.fullName",
  "Assigned BDE",
  1.1,
  undefined,
  field("assignedBde.fullName"),
);
const leadBde = column(
  "lead.assignedBde.fullName",
  "Assigned BDE",
  1.1,
  undefined,
  field("lead.assignedBde.fullName"),
);
const leadName = column(
  "customerName",
  "Lead / Deal",
  1.2,
  undefined,
  field("customerName"),
);
const leadCompany = column(
  "businessName",
  "Company",
  1.1,
  undefined,
  field("businessName"),
);

const definitions: Record<string, ReportColumn[]> = {
  leads: [
    column("customerName", "Lead Name", 1.2),
    leadCompany,
    column(
      "contactInformation",
      "Contact Information",
      1.4,
      undefined,
      (row) =>
        [row.mobileNumber, row.email].filter(Boolean).join(" · ") || null,
    ),
    column("leadSource", "Lead Source", 0.9),
    assignedBde,
    column("stage", "Current Stage", 0.9),
    column("createdAt", "Created Date", 1, "date"),
    column("followUpAt", "Next Follow-up", 1, "date"),
  ],
  "lead-activities": [
    column("type", "Activity Type", 0.9),
    column("createdAt", "Recorded Date", 1, "date"),
    column("contactDate", "Contact Date", 1, "date"),
    column("contactType", "Contact Type", 0.9),
    column("description", "Description", 1.8),
    column("outcome", "Outcome", 1.2),
    column("customerResponse", "Customer Response", 1.2),
    column("requirement", "Requirement", 1.3),
    column("estimatedBudget", "Estimated Budget", 1, "money"),
    column("paymentAmount", "Payment Amount", 1, "money"),
    column("paymentStatus", "Payment Status", 0.9),
    column("paymentTotal", "Total Paid", 1, "money"),
    column("paymentBalance", "Payment Balance", 1, "money"),
    column("expectedTimeline", "Expected Timeline", 1),
    column("nextAction", "Next Action", 1.2),
    column("followUpAt", "Follow-up Date", 1, "date"),
    column("remarks", "Remarks", 1.3),
    column("recordedBy", "Recorded By", 1),
  ],
  "bde-performance": [
    column("name", "BDE Name", 1.2),
    column("totalLeads", "Total Leads", 0.8, "number"),
    column("contacted", "Contacted Leads", 0.9, "number"),
    column("interested", "Interested Leads", 0.9, "number"),
    column("followUpsCompleted", "Follow-ups Completed", 1.1, "number"),
    column("overdueFollowUps", "Overdue Follow-ups", 1.1, "number"),
    column("meetings", "Meetings", 0.8, "number"),
    column("proposals", "Proposals", 0.8, "number"),
    column("won", "Won Deals", 0.8, "number"),
    column("lost", "Lost Deals", 0.8, "number"),
    column("revenue", "Revenue Generated", 1.1, "money"),
  ],
  pipeline: [
    leadName,
    leadCompany,
    assignedBde,
    column("stage", "Pipeline Stage", 1),
    column("leadSource", "Lead Source", 0.9),
    column("estimatedBudget", "Expected Deal Value", 1.1, "money"),
    column("lastActivityAt", "Last Activity Date", 1, "date"),
    column("followUpAt", "Next Follow-up", 1, "date"),
    column("daysInCurrentStage", "Days in Stage", 0.8, "number"),
  ],
  "lead-aging": [
    leadName,
    leadCompany,
    assignedBde,
    column("stage", "Current Stage", 0.9),
    column("daysInCurrentStage", "Days in Stage", 0.8, "number"),
    column("lastActivityAt", "Last Activity Date", 1, "date"),
    column("followUpAt", "Next Follow-up", 1, "date"),
  ],
  "follow-ups": [
    column("lead.customerName", "Lead Name", 1.2),
    column("lead.businessName", "Company", 1.1),
    leadBde,
    column("dueAt", "Follow-up Date", 1, "date"),
    column("type", "Follow-up Type", 0.9),
    column("status", "Status", 0.8),
    column("nextAction", "Next Action", 1.2),
    column(
      "latestActivity",
      "Last Activity / Notes",
      1.5,
      undefined,
      (row) => {
        const lead = row.lead as Record<string, unknown> | undefined;
        const activities = lead?.activities as
          | Record<string, unknown>[]
          | undefined;
        return row.remarks ?? activities?.[0]?.description ?? null;
      },
    ),
  ],
  proposals: [
    column("lead.leadNumber", "Lead Number", 1),
    column("lead.customerName", "Lead / Company", 1.2),
    leadBde,
    column("proposalDate", "Proposal Date", 1, "date"),
    column("finalAmount", "Proposal Value", 1, "money"),
    column("customerResponse", "Status / Response", 1.2),
  ],
  "won-lost": [
    leadName,
    leadCompany,
    assignedBde,
    column("stage", "Final Outcome", 0.9),
    column("stageEnteredAt", "Outcome Date", 1, "date"),
    column("finalDealValue", "Deal Value", 1, "money"),
    column("lostReason", "Lost Reason", 1.4),
  ],
  revenue: [
    column("stageEnteredAt", "Won Date", 1, "date"),
    leadName,
    leadCompany,
    assignedBde,
    column("finalDealValue", "Revenue", 1, "money"),
  ],
  "lost-leads": [
    leadName,
    leadCompany,
    assignedBde,
    column("stageEnteredAt", "Lost Date", 1, "date"),
    column("lostReason", "Lost Reason / Category", 1.4),
    column("finalDealValue", "Deal Value", 1, "money"),
  ],
  "monthly-summary": [
    column("month", "Month", 1),
    column("totalLeads", "Total Leads", 0.9, "number"),
    column("contacted", "Contacted Leads", 1, "number"),
    column("interested", "Interested Leads", 1, "number"),
    column("meetings", "Meetings", 0.8, "number"),
    column("proposals", "Proposals", 0.8, "number"),
    column("negotiations", "Negotiations", 0.9, "number"),
    column("won", "Won Deals", 0.8, "number"),
    column("lost", "Lost Deals", 0.8, "number"),
    column("revenue", "Revenue", 1, "money"),
    column("conversionRate", "Conversion Rate", 1, "percent"),
  ],
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};

const asNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export function buildReportTable(
  rows: unknown[],
  type: string,
): ReportTable {
  const columns = definitions[type];
  if (!columns) throw new Error(`No export columns configured for ${type}`);
  const records = rows.map(asRecord);
  const tableRows = records.map((row) =>
    Object.fromEntries(columns.map(({ key, value }) => [key, value(row)])),
  );
  const summary: ReportTable["summary"] = [];
  if (type === "revenue") {
    const total = records.reduce(
      (sum, row) => sum + asNumber(row.finalDealValue),
      0,
    );
    summary.push(
      { label: "Won deals", value: records.length, format: "number" },
      { label: "Total revenue", value: total, format: "money" },
    );
  }
  if (type === "lost-leads") {
    const counts = new Map<string, number>();
    for (const row of records) {
      const reason = String(row.lostReason ?? "Not recorded");
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    summary.push(
      ...[...counts.entries()].map(([reason, count]) => ({
        label: reason,
        value: count,
        format: "number" as const,
      })),
    );
  }
  return { columns, rows: tableRows, summary };
}

export function formatReportValue(value: unknown, format?: ReportColumn["format"]) {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "date") {
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-IN");
  }
  if (format === "money") {
    const number = Number(value);
    return Number.isFinite(number)
      ? new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
          maximumFractionDigits: 2,
        }).format(number)
      : String(value);
  }
  if (format === "percent") return `${value}%`;
  return String(value);
}
