import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ReportsService } from "./reports.service";

@Controller("reports")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("monthly-summary")
  monthlySummary(
    @Query("month") month: string,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.reports.monthlySummary(month, user);
  }

  @Get(":type")
  @Roles("ADMIN", "SALES_MANAGER")
  run(
    @Param("type") type: string,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.reports.run(type, from, to, user);
  }
}
