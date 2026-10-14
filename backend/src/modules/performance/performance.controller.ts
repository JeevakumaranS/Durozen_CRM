import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { PerformanceService } from "./performance.service";

@Controller("performance")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "BDE", "SALES_MANAGER")
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}
  @Get() summary(
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.performance.summary(from, to, user);
  }
}
