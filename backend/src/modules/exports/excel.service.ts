import { Injectable } from "@nestjs/common";
import { Workbook } from "exceljs";
import { buildReportTable } from "./export.utils";

@Injectable()
export class ExcelExportService {
  async create(
    rows: unknown[],
    type: string,
    title: string,
    details: string[] = [],
  ): Promise<Buffer> {
    const report = buildReportTable(rows, type);
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet(type.slice(0, 31));
    const lastColumn = report.columns.length;
    const titleRow = sheet.addRow([title]);
    titleRow.font = { bold: true, size: 16, color: { argb: "FF174955" } };
    for (const detail of details) {
      const detailRow = sheet.addRow([detail]);
      detailRow.font = { color: { argb: "FF45565A" } };
    }
    sheet.addRow([]);
    sheet.columns = report.columns.map((column) => ({
      key: column.key,
      width: Math.min(Math.max(column.label.length + 3, 14), 32),
    }));
    const headerRowNumber = sheet.rowCount + 1;
    const header = sheet.addRow(report.columns.map((column) => column.label));
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF174955" },
    };
    header.alignment = { vertical: "middle", wrapText: true };
    header.height = 30;

    for (const values of report.rows) {
      const row = sheet.addRow(
        report.columns.map((column) =>
          this.cellValue(values[column.key], column.format),
        ),
      );
      row.alignment = { vertical: "top", wrapText: true };
      row.eachCell((cell, index) => {
        const column = report.columns[index - 1];
        if (column?.format === "date") cell.numFmt = "dd-mmm-yyyy";
        if (column?.format === "money") cell.numFmt = '"₹"#,##0.00';
        if (column?.format === "percent") cell.numFmt = '0.0"%"';
        if (column?.format === "number") cell.numFmt = "#,##0";
      });
    }

    const maxWidths = report.columns.map((column, index) => {
      const values = report.rows.map((row) =>
        this.displayWidth(row[column.key]),
      );
      return Math.min(
        Math.max(column.label.length + 2, ...values, 14),
        42,
      );
    });
    sheet.columns.forEach((column, index) => {
      column.width = maxWidths[index];
    });

    sheet.autoFilter = {
      from: `A${headerRowNumber}`,
      to: `${sheet.getColumn(lastColumn).letter}${headerRowNumber + report.rows.length}`,
    };
    sheet.views = [{ state: "frozen", ySplit: headerRowNumber }];
    sheet.pageSetup = {
      orientation: lastColumn > 6 ? "landscape" : "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    };

    if (report.summary.length) {
      sheet.addRow([]);
      for (const summary of report.summary) {
        const summaryRow = sheet.addRow([
          summary.label,
          this.cellValue(summary.value, summary.format),
        ]);
        summaryRow.font = { bold: true, color: { argb: "FF174955" } };
        if (summary.format === "money")
          summaryRow.getCell(2).numFmt = '"₹"#,##0.00';
        if (summary.format === "number")
          summaryRow.getCell(2).numFmt = "#,##0";
      }
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private cellValue(
    value: unknown,
    format: "date" | "money" | "number" | "percent" | undefined,
  ): string | number | Date | null {
    if (value === undefined || value === null || value === "") return null;
    if (format === "date") {
      const date = value instanceof Date ? value : new Date(String(value));
      return Number.isNaN(date.getTime()) ? String(value) : date;
    }
    if (format === "money" || format === "number" || format === "percent") {
      const number = Number(value);
      return Number.isFinite(number) ? number : String(value);
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      value instanceof Date
    )
      return value;
    return String(value);
  }

  private displayWidth(value: unknown) {
    return value === null || value === undefined
      ? 0
      : String(value).split(/\r?\n/).reduce((longest, line) => Math.max(longest, line.length), 0);
  }
}
