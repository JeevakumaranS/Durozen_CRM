import { Injectable } from "@nestjs/common";
import { Workbook } from "exceljs";
import { flattenRow } from "./export.utils";

@Injectable()
export class ExcelExportService {
  async create(rows: unknown[], sheetName: string): Promise<Buffer> {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
    const flattened = rows.map((row) => flattenRow(row));
    const headers = [...new Set(flattened.flatMap((row) => Object.keys(row)))];
    if (headers.length) {
      sheet.columns = headers.map((header) => ({
        header,
        key: header,
        width: Math.min(Math.max(header.length + 3, 16), 36),
      }));
      sheet.addRows(flattened);
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF174955" },
      };
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.autoFilter = {
        from: "A1",
        to: `${sheet.getColumn(headers.length).letter}1`,
      };
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
