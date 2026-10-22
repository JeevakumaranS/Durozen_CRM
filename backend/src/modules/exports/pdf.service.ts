import { Injectable } from "@nestjs/common";
import PDFDocument = require("pdfkit");
import {
  ActivityTimelineEntry,
  buildReportTable,
  formatReportValue,
  ReportColumn,
} from "./export.utils";

@Injectable()
export class PdfExportService {
  createLeadActivityTimeline(
    title: string,
    leadInformation: { label: string; value: string }[],
    activities: ActivityTimelineEntry[],
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({
        size: "A4",
        margins: { top: 42, right: 46, bottom: 42, left: 46 },
      });
      const chunks: Buffer[] = [];
      document.on("data", (chunk: Buffer) => chunks.push(chunk));
      document.on("end", () => resolve(Buffer.concat(chunks)));
      document.on("error", reject);

      const left = 46;
      const right = document.page.width - 46;
      const pageBottom = () => document.page.height - 42;
      const drawPageHeading = (continued: boolean) => {
        document
          .font("Helvetica-Bold")
          .fontSize(16)
          .fillColor("#174955")
          .text(continued ? `${title} (continued)` : title, left, 42, {
            width: right - left,
          });
        document.y += 12;
      };
      const nextPage = () => {
        document.addPage({
          size: "A4",
          margins: { top: 42, right: 46, bottom: 42, left: 46 },
        });
        drawPageHeading(true);
      };
      const ensureSpace = (height: number) => {
        if (document.y + height > pageBottom()) nextPage();
      };
      const formatDate = (value: Date | string) => {
        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime())
          ? String(value)
          : new Intl.DateTimeFormat("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(date);
      };
      const writeSectionHeading = (heading: string) => {
        ensureSpace(30);
        document
          .font("Helvetica-Bold")
          .fontSize(11)
          .fillColor("#174955")
          .text(heading, left, document.y, { width: right - left });
        document.y += 5;
      };
      const writeInformation = (label: string, value: string) => {
        const text = `${label}: ${value}`;
        document.font("Helvetica").fontSize(9);
        const height = document.heightOfString(text, {
          width: right - left,
          lineGap: 2,
        });
        ensureSpace(height + 7);
        document
          .font("Helvetica-Bold")
          .fillColor("#45565a")
          .text(`${label}: `, left, document.y, { continued: true });
        document
          .font("Helvetica")
          .fillColor("#344b50")
          .text(value, { width: right - left, lineGap: 2 });
        document.y += 4;
      };

      drawPageHeading(false);
      writeSectionHeading("Lead Information");
      leadInformation.forEach(({ label, value }) =>
        writeInformation(label, value),
      );
      document.y += 8;
      writeSectionHeading("Activity Timeline");
      if (!activities.length) {
        writeInformation("Activity", "No activity has been recorded.");
      }

      activities.forEach((activity, index) => {
        ensureSpace(48);
        const activityPage = document.page;
        const headerY = document.y;
        const timelineX = left + 7;
        document
          .circle(timelineX, headerY + 5, 4)
          .fill("#368d83");
        document
          .font("Helvetica-Bold")
          .fontSize(10)
          .fillColor("#174955")
          .text(
            `${index + 1}. ${activity.type.replaceAll("_", " ")}`,
            left + 22,
            headerY,
            { width: right - left - 22 },
          );
        document
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#718186")
          .text(formatDate(activity.createdAt), left + 22, document.y + 2, {
            width: right - left - 22,
          });
        document.y += 7;
        activity.details.forEach(({ label, value }) => {
          if (!value) return;
          const text = `${label}: ${value}`;
          document.font("Helvetica").fontSize(8.5);
          const height = document.heightOfString(text, {
            width: right - left - 30,
            lineGap: 2,
          });
          ensureSpace(height + 6);
          document
            .font("Helvetica-Bold")
            .fillColor("#45565a")
            .text(`${label}: `, left + 22, document.y, { continued: true });
          document
            .font("Helvetica")
            .fillColor("#344b50")
            .text(value, { width: right - left - 30, lineGap: 2 });
          document.y += 4;
        });
        const lineBottom = document.y;
        if (index < activities.length - 1 && document.page === activityPage) {
          document
            .moveTo(timelineX, headerY + 11)
            .lineTo(timelineX, lineBottom + 2)
            .lineWidth(1)
            .strokeColor("#b9d3cf")
            .stroke();
        }
        document.y = lineBottom + 12;
      });
      document.end();
    });
  }

  create(
    rows: unknown[],
    type: string,
    title: string,
    details: string[] = [],
  ): Promise<Buffer> {
    const report = buildReportTable(rows, type);
    const landscape = report.columns.length > 6;
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({
        size: "A4",
        layout: landscape ? "landscape" : "portrait",
        margins: { top: 34, right: 34, bottom: 34, left: 34 },
      });
      const chunks: Buffer[] = [];
      document.on("data", (chunk: Buffer) => chunks.push(chunk));
      document.on("end", () => resolve(Buffer.concat(chunks)));
      document.on("error", reject);

      const pageLeft = 34;
      const pageRight = document.page.width - 34;
      const pageBottom = document.page.height - 34;
      const weights = report.columns.reduce(
        (sum, column) => sum + column.weight,
        0,
      );
      const widths = report.columns.map(
        (column) => ((pageRight - pageLeft) * column.weight) / weights,
      );
      const drawPageHeading = (continuation: boolean) => {
        document
          .font("Helvetica-Bold")
          .fontSize(15)
          .fillColor("#174955")
          .text(continuation ? `${title} (continued)` : title, pageLeft, 34, {
            width: pageRight - pageLeft,
          });
        document
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#45565a");
        for (const detail of details) {
          document.text(detail, pageLeft, document.y + 3, {
            width: pageRight - pageLeft,
          });
        }
        document.moveDown(0.7);
      };
      const drawTableHeader = () => {
        const y = document.y;
        const height = this.rowHeight(
          report.columns.map((column) => column.label),
          widths,
          document,
          true,
        );
        let x = pageLeft;
        report.columns.forEach((column, index) => {
          document
            .rect(x, y, widths[index], height)
            .fillAndStroke("#e8f0ef", "#b9c9c8");
          document
            .font("Helvetica-Bold")
            .fontSize(7.5)
            .fillColor("#174955")
            .text(column.label, x + 4, y + 4, {
              width: widths[index] - 8,
              height: height - 8,
              lineGap: 1,
            });
          x += widths[index];
        });
        document.y = y + height;
      };

      drawPageHeading(false);
      drawTableHeader();
      if (!report.rows.length) {
        document
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#45565a")
          .text("No records found for this report.", pageLeft, document.y + 8);
      }
      report.rows.forEach((row, rowIndex) => {
        const values = report.columns.map((column) =>
          formatReportValue(row[column.key], column.format),
        );
        const height = this.rowHeight(
          values,
          widths,
          document,
          false,
        );
        if (document.y + height > pageBottom) {
          document.addPage({
            size: "A4",
            layout: landscape ? "landscape" : "portrait",
            margins: { top: 34, right: 34, bottom: 34, left: 34 },
          });
          drawPageHeading(true);
          drawTableHeader();
        }
        const y = document.y;
        let x = pageLeft;
        report.columns.forEach((_column, index) => {
          document
            .rect(x, y, widths[index], height)
            .fillAndStroke(rowIndex % 2 ? "#ffffff" : "#f8fbfb", "#dce5e4");
          document
            .font("Helvetica")
            .fontSize(7)
            .fillColor("#344b50")
            .text(values[index], x + 4, y + 4, {
              width: widths[index] - 8,
              height: height - 8,
              lineGap: 1,
            });
          x += widths[index];
        });
        document.y = y + height;
      });

      if (report.summary.length) {
        if (document.y + 30 > pageBottom) {
          document.addPage({
            size: "A4",
            layout: landscape ? "landscape" : "portrait",
            margins: { top: 34, right: 34, bottom: 34, left: 34 },
          });
          drawPageHeading(true);
        }
        document.moveDown(0.8).font("Helvetica-Bold").fontSize(9);
        report.summary.forEach((item) => {
          document.text(
            `${item.label}: ${formatReportValue(item.value, item.format)}`,
            pageLeft,
            document.y,
            {
            width: pageRight - pageLeft,
            },
          );
        });
      }
      document.end();
    });
  }

  private rowHeight(
    values: string[],
    widths: number[],
    document: PDFKit.PDFDocument,
    header: boolean,
  ) {
    const size = header ? 7.5 : 7;
    const max = values.reduce((height, value, index) => {
      document.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(size);
      return Math.max(
        height,
        document.heightOfString(value, {
          width: widths[index] - 8,
          lineGap: 1,
        }),
      );
    }, 0);
    return Math.max(header ? 24 : 20, max + 8);
  }
}
