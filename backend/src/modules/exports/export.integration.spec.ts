import * as assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { Workbook } from "exceljs";
import { ExcelExportService } from "./excel.service";
import { PdfExportService } from "./pdf.service";
import { ActivityTimelineEntry, buildReportTable } from "./export.utils";

const date = new Date("2026-10-12T12:00:00.000Z");
const longText = "Follow-up details ".repeat(24);
const fixtures: Record<string, Record<string, unknown>> = {
  leads: {
    customerName: "Asha Rao",
    businessName: "Durozen",
    mobileNumber: "5550100",
    email: "asha@example.test",
    leadSource: "Referral",
    assignedBde: { fullName: "BDE One" },
    stage: "CONTACTED",
    createdAt: date,
    followUpAt: date,
  },
  "lead-activities": {
    type: "Phone Call",
    createdAt: date,
    contactDate: date,
    contactType: "Phone Call",
    description: longText,
    outcome: "Interested",
    customerResponse: "Please send the proposal",
    requirement: longText,
    estimatedBudget: "14000.00",
    paymentAmount: "5000.00",
    paymentStatus: "Advance Payment",
    paymentTotal: "5000.00",
    paymentBalance: "9000.00",
    expectedTimeline: "Next month",
    nextAction: "Send proposal",
    followUpAt: date,
    remarks: longText,
    recordedBy: "BDE One",
  },
  "bde-performance": {
    name: "BDE One",
    totalLeads: 12,
    contacted: 8,
    interested: 5,
    followUpsCompleted: 4,
    overdueFollowUps: 2,
    meetings: 3,
    proposals: 2,
    won: 1,
    lost: 1,
    revenue: "12500.50",
  },
  pipeline: {
    customerName: "Asha Rao",
    businessName: "Durozen",
    assignedBde: { fullName: "BDE One" },
    stage: "PROPOSAL",
    leadSource: "Referral",
    estimatedBudget: "14000.00",
    lastActivityAt: date,
    followUpAt: date,
    daysInCurrentStage: 4,
  },
  "lead-aging": {
    customerName: "Asha Rao",
    businessName: "Durozen",
    assignedBde: { fullName: "BDE One" },
    stage: "PROPOSAL",
    daysInCurrentStage: 4,
    lastActivityAt: date,
    followUpAt: date,
  },
  "follow-ups": {
    lead: {
      customerName: "Asha Rao",
      businessName: "Durozen",
      assignedBde: { fullName: "BDE One" },
      activities: [{ description: longText }],
    },
    dueAt: date,
    type: "Proposal Follow-up",
    status: "PENDING",
    nextAction: "Call customer",
    remarks: longText,
  },
  proposals: {
    lead: {
      leadNumber: "LD-2026-100",
      customerName: "Asha Rao",
      assignedBde: { fullName: "BDE One" },
    },
    proposalDate: date,
    finalAmount: "12500.50",
    customerResponse: "PENDING",
  },
  "won-lost": {
    customerName: "Asha Rao",
    businessName: "Durozen",
    assignedBde: { fullName: "BDE One" },
    stage: "WON",
    stageEnteredAt: date,
    finalDealValue: "12500.50",
    lostReason: null,
  },
  revenue: {
    customerName: "Asha Rao",
    businessName: "Durozen",
    assignedBde: { fullName: "BDE One" },
    stageEnteredAt: date,
    finalDealValue: "12500.50",
  },
  "lost-leads": {
    customerName: "Asha Rao",
    businessName: "Durozen",
    assignedBde: { fullName: "BDE One" },
    stageEnteredAt: date,
    lostReason: "Budget",
    finalDealValue: null,
  },
  "monthly-summary": {
    month: "2026-10",
    totalLeads: 12,
    contacted: 8,
    interested: 5,
    meetings: 3,
    proposals: 2,
    negotiations: 1,
    won: 1,
    lost: 1,
    revenue: "12500.50",
    conversionRate: 8.3,
  },
};

const reportTypes = Object.keys(fixtures);

function toArrayBuffer(buffer: Uint8Array) {
  const copy = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(copy).set(buffer);
  return copy;
}

test("all report exports generate readable PDFs and parseable report-specific workbooks", async () => {
  const excel = new ExcelExportService();
  const pdf = new PdfExportService();
  const outputDirectory = process.env.REPORT_EXPORT_TEST_DIR;
  if (outputDirectory) await mkdir(outputDirectory, { recursive: true });

  for (const type of reportTypes) {
    const fixture = fixtures[type];
    const table = buildReportTable([fixture], type);
    const workbookBuffer = await excel.create([fixture], type, type);
    const workbook = new Workbook();
    await workbook.xlsx.load(toArrayBuffer(workbookBuffer));
    const sheet = workbook.getWorksheet(type);

    assert.ok(sheet, `${type} worksheet exists`);
    const headerRow = sheet.getRow(3);
    assert.deepEqual(
      table.columns.map((_column, index) => headerRow.getCell(index + 1).value),
      table.columns.map((column) => column.label),
      `${type} headers match configured report columns`,
    );
    assert.equal(sheet.views[0]?.state, "frozen");
    assert.equal(
      typeof sheet.autoFilter === "string"
        ? sheet.autoFilter.split(":")[0]
        : sheet.autoFilter?.from,
      "A3",
    );
    const dataRow = sheet.getRow(4);
    assert.equal(dataRow.cellCount, table.columns.length);
    table.columns.forEach((column, index) => {
      const expected = table.rows[0][column.key] ?? null;
      const actual = dataRow.getCell(index + 1).value;
      if (column.format === "date" && expected !== null) {
        assert.ok(actual instanceof Date, `${type} ${column.label} is a date`);
        const expectedDate =
          expected instanceof Date ? expected : new Date(String(expected));
        assert.equal(actual.getTime(), expectedDate.getTime());
      } else if (
        ["money", "number", "percent"].includes(column.format ?? "") &&
        expected !== null
      ) {
        assert.equal(actual, Number(expected), `${type} ${column.label} is numeric`);
      } else {
        assert.equal(actual, expected, `${type} ${column.label} stays in its column`);
      }
      assert.ok((sheet.getColumn(index + 1).width ?? 0) >= 14);
    });

    const emptyWorkbookBuffer = await excel.create([], type, type);
    const emptyWorkbook = new Workbook();
    await emptyWorkbook.xlsx.load(toArrayBuffer(emptyWorkbookBuffer));
    assert.equal(
      emptyWorkbook.getWorksheet(type)?.getRow(3).cellCount,
      table.columns.length,
    );

    const pdfBuffer = await pdf.create([fixture], type, `${type} report`, [
      "Date range: 2026-10-01 to 2026-10-31",
    ]);
    assert.equal(pdfBuffer.subarray(0, 5).toString(), "%PDF-");
    const pdfText = pdfBuffer.toString("latin1");
    const mediaBox = /\/MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/.exec(
      pdfText,
    );
    assert.ok(mediaBox, `${type} PDF contains page dimensions`);
    assert.equal(
      Number(mediaBox[1]) > Number(mediaBox[2]),
      table.columns.length > 6,
      `${type} PDF uses orientation appropriate for its width`,
    );
    const emptyPdf = await pdf.create([], type, `${type} report`);
    assert.equal(emptyPdf.subarray(0, 5).toString(), "%PDF-");
    if (outputDirectory) {
      await writeFile(join(outputDirectory, `${type}.pdf`), pdfBuffer);
      await writeFile(join(outputDirectory, `${type}-empty.pdf`), emptyPdf);
    }
  }
});

test("revenue exports preserve numeric values, dates, summaries, and empty cells", async () => {
  const excel = new ExcelExportService();
  const workbook = new Workbook();
  await workbook.xlsx.load(
    toArrayBuffer(await excel.create(
      [
        {
          customerName: "Asha Rao",
          businessName: "Durozen",
          assignedBde: { fullName: "BDE One" },
          stageEnteredAt: date,
          finalDealValue: "12500.50",
        },
      ],
      "revenue",
      "Revenue Report",
    )),
  );
  const sheet = workbook.getWorksheet("revenue");
  assert.ok(sheet);
  assert.ok(sheet.getRow(4).getCell(1).value instanceof Date);
  assert.equal(sheet.getRow(4).getCell(5).value, 12500.5);
  assert.equal(sheet.getRow(7).getCell(2).value, 12500.5);

  const emptyLeadReport = buildReportTable(
    [{ customerName: null, mobileNumber: null, email: null }],
    "leads",
  );
  assert.equal(emptyLeadReport.rows[0].contactInformation, null);
});

test("long report tables paginate and preserve the table header", async () => {
  const pdf = new PdfExportService();
  const rows = Array.from({ length: 80 }, (_, index) => ({
    customerName: `Lead ${index + 1}`,
    businessName: "Durozen",
    mobileNumber: `555${String(index).padStart(4, "0")}`,
    email: `lead-${index + 1}@example.test`,
    leadSource: "Referral",
    assignedBde: { fullName: "BDE One" },
    stage: "CONTACTED",
    createdAt: date,
    followUpAt: date,
  }));
  const buffer = await pdf.create(rows, "leads", "Lead Report");
  const pageCount = [...buffer.toString("latin1").matchAll(/\/Type\s*\/Page\b/g)]
    .length;
  assert.ok(pageCount > 1, "long report creates multiple pages");
  if (process.env.REPORT_EXPORT_TEST_DIR) {
    await writeFile(
      join(process.env.REPORT_EXPORT_TEST_DIR, "leads-multipage.pdf"),
      buffer,
    );
  }
});

test("lead activity exports place lead information before a chronological vertical timeline", async () => {
  const excel = new ExcelExportService();
  const pdf = new PdfExportService();
  const activities: ActivityTimelineEntry[] = [
    {
      type: "Phone Call",
      createdAt: new Date("2026-10-10T09:00:00.000Z"),
      details: [{ label: "Description", value: "First recorded activity" }],
    },
    {
      type: "Meeting",
      createdAt: new Date("2026-10-12T12:00:00.000Z"),
      details: [{ label: "Description", value: "Most recent activity" }],
    },
  ];
  const leadInformation = [
    { label: "Lead number", value: "LD-2026-100" },
    { label: "Customer", value: "Asha Rao" },
  ];
  const workbook = new Workbook();
  await workbook.xlsx.load(
    toArrayBuffer(
      await excel.createLeadActivityTimeline(
        "Activity Timeline - Asha Rao",
        leadInformation,
        activities,
      ),
    ),
  );
  const sheet = workbook.getWorksheet("Activity Timeline");
  assert.ok(sheet);
  assert.equal(sheet.getCell("B4").value, "Lead number");
  const rows = Array.from({ length: sheet.rowCount }, (_, index) =>
    sheet.getRow(index + 1),
  );
  const activityHeadingRow = rows.find(
    (row) => row.getCell(2).value === "Activity Timeline",
  );
  assert.ok(activityHeadingRow);
  const firstActivityRow = rows.find((row) =>
    String(row.getCell(2).value).includes("1. Phone Call"),
  );
  const secondActivityRow = rows.find((row) =>
    String(row.getCell(2).value).includes("2. Meeting"),
  );
  assert.ok(firstActivityRow && secondActivityRow);
  assert.ok(activityHeadingRow.number < firstActivityRow.number);
  assert.ok(firstActivityRow.number < secondActivityRow.number);
  assert.ok(!sheet.autoFilter);
  assert.equal(sheet.views?.length ?? 0, 0);

  const pdfBuffer = await pdf.createLeadActivityTimeline(
    "Activity Timeline - Asha Rao",
    leadInformation,
    activities,
  );
  assert.equal(pdfBuffer.subarray(0, 5).toString(), "%PDF-");
});

test("long lead activity timelines paginate into readable PDF pages", async () => {
  const pdf = new PdfExportService();
  const activities: ActivityTimelineEntry[] = Array.from(
    { length: 40 },
    (_, index) => ({
      type: "Call",
      createdAt: new Date(date.getTime() + index * 60_000),
      details: [
        { label: "Description", value: `${longText} ${index + 1}` },
        { label: "Outcome", value: "Follow-up required" },
      ],
    }),
  );
  const buffer = await pdf.createLeadActivityTimeline(
    "Activity Timeline - Asha Rao",
    [{ label: "Customer", value: "Asha Rao" }],
    activities,
  );
  const pageCount = [...buffer.toString("latin1").matchAll(/\/Type\s*\/Page\b/g)]
    .length;
  assert.ok(pageCount > 1, "long timeline creates multiple pages");
});
