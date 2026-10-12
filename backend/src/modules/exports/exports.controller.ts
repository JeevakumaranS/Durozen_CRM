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
    @CurrentUser() user: { sub: string; role: string },
  ) {
    const rows = await this.reports.run(type, from, to, user);
    if (format === "pdf") {
      const data = await this.pdf.create(
        rows,
        `${type.replaceAll("-", " ")} report`,
      );
      return new StreamableFile(data, {
        type: "application/pdf",
        disposition: `attachment; filename="${type}.pdf"`,
      });
    }
    if (format === "xlsx") {
      const data = await this.excel.create(rows, type);
      return new StreamableFile(data, {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        disposition: `attachment; filename="${type}.xlsx"`,
      });
    }
    throw new BadRequestException("Format must be pdf or xlsx");
  }
}
