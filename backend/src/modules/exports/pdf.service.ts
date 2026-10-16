import { Injectable } from "@nestjs/common";
import PDFDocument = require("pdfkit");
import {
  buildReportTable,
  formatReportValue,
  ReportColumn,
} from "./export.utils";

@Injectable()
export class PdfExportService {
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
