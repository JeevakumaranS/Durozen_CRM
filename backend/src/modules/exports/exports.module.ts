import { Module } from "@nestjs/common";
import { ReportsModule } from "../reports/reports.module";
import { LeadsModule } from "../leads/leads.module";
import { ExportsController } from "./exports.controller";
import { ExcelExportService } from "./excel.service";
import { PdfExportService } from "./pdf.service";

@Module({
  imports: [ReportsModule, LeadsModule],
  controllers: [ExportsController],
  providers: [ExcelExportService, PdfExportService],
})
export class ExportsModule {}
