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

  @Get("bde-options")
  @Roles("ADMIN", "BDE", "SALES_MANAGER")
  bdeOptions(@CurrentUser() user: { sub: string; role: string }) {
    return this.reports.bdeOptions(user);
  }

  @Get("monthly-summary")
  @Roles("ADMIN", "BDE", "SALES_MANAGER")
  monthlySummary(
    @Query("month") month: string,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.reports.monthlySummary(month, user);
  }

  @Get(":type")
  @Roles("ADMIN", "BDE", "SALES_MANAGER")
  run(
    @Param("type") type: string,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("assignedBdeId") assignedBdeId: string | undefined,
    @Query("stage") stage: string | undefined,
    @Query("status") status: string | undefined,
    @Query("category") category: string | undefined,
    @Query("lostReason") lostReason: string | undefined,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.reports.run(type, from, to, user, {
      assignedBdeId,
      stage,
      status,
      category,
      lostReason,
    });
  }
}
