import { Injectable } from "@nestjs/common";
import PDFDocument = require("pdfkit");
import { flattenRow } from "./export.utils";

@Injectable()
export class PdfExportService {
  create(rows: unknown[], title: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({
        size: "A4",
        margin: 42,
        bufferPages: true,
      });
      const chunks: Buffer[] = [];
      document.on("data", (chunk: Buffer) => chunks.push(chunk));
      document.on("end", () => resolve(Buffer.concat(chunks)));
      document.on("error", reject);
      document
        .fontSize(18)
        .fillColor("#174955")
        .text(title, { continued: false });
      document.moveDown(0.5).fontSize(8).fillColor("#45565a");
      if (!rows.length) document.text("No records found for this report.");
      for (const [index, row] of rows.entries()) {
        const flattened = flattenRow(row);
        if (document.y > 740) document.addPage();
        document
          .fontSize(10)
          .fillColor("#174955")
          .text(`Record ${index + 1}`, { underline: true });
        document.fontSize(8).fillColor("#45565a");
        for (const [key, value] of Object.entries(flattened)) {
          document.text(`${key.replaceAll("_", " ")}: ${String(value ?? "")}`, {
            lineGap: 2,
          });
        }
        document.moveDown(0.7);
      }
      document.end();
    });
  }
}
