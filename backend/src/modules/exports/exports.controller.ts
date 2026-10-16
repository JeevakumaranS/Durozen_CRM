import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ReportsService } from "../reports/reports.service";
import { ExcelExportService } from "./excel.service";
import { PdfExportService } from "./pdf.service";

@Controller("exports")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "SALES_MANAGER")
export class ExportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly excel: ExcelExportService,
    private readonly pdf: PdfExportService,
  ) {}

  @Get(":type")
  async export(
    @Param("type") type: string,
    @Query("format") format: string,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("assignedBdeId") assignedBdeId: string | undefined,
    @Query("stage") stage: string | undefined,
    @Query("status") status: string | undefined,
    @Query("category") category: string | undefined,
    @Query("lostReason") lostReason: string | undefined,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    const rows = await this.reports.run(type, from, to, user, {
      assignedBdeId,
      stage,
      status,
      category,
      lostReason,
    });
    const title = this.reportTitle(type);
    const selectedBde = assignedBdeId
      ? (await this.reports.bdeOptions(user)).find(
          (bde) => bde.id === assignedBdeId,
        )
      : undefined;
    const dateBasis: Record<string, string> = {
      leads: "lead creation date",
      pipeline: "lead creation date",
      "lead-aging": "lead creation date",
      "follow-ups": "follow-up due date",
      proposals: "proposal date",
      "won-lost": "outcome date",
      revenue: "won date",
      "lost-leads": "lost date",
      "bde-performance": "each metric's recorded date",
      "monthly-summary": "each metric's recorded date",
    };
    const details = [
      from || to
        ? `Date range (${dateBasis[type] ?? "record date"}): ${from ?? "Any"} to ${to ?? "Today"}`
        : "",
      assignedBdeId
        ? `Assigned BDE: ${selectedBde?.fullName ?? assignedBdeId}`
        : "",
      stage ? `Stage: ${stage}` : "",
      status ? `Status: ${status}` : "",
      category ? `Follow-up category: ${category}` : "",
      lostReason ? `Lost reason contains: ${lostReason}` : "",
    ].filter(Boolean);
    if (format === "pdf") {
      const data = await this.pdf.create(rows, type, title, details);
      return new StreamableFile(data, {
        type: "application/pdf",
        disposition: `attachment; filename="${type}.pdf"`,
      });
    }
    if (format === "xlsx") {
      const data = await this.excel.create(rows, type, title, details);
      return new StreamableFile(data, {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        disposition: `attachment; filename="${type}.xlsx"`,
      });
    }
    throw new BadRequestException("Format must be pdf or xlsx");
  }

  private reportTitle(type: string) {
    const titles: Record<string, string> = {
      leads: "Lead Report",
      "bde-performance": "BDE Performance Report",
      pipeline: "Pipeline Report",
      "follow-ups": "Follow-up Report",
      proposals: "Proposal Report",
      "won-lost": "Won/Lost Report",
      revenue: "Revenue Report",
      "lost-leads": "Lost Lead Report",
      "monthly-summary": "Sales Performance Report",
    };
    return titles[type] ?? `${type.replaceAll("-", " ")} report`;
  }
}
