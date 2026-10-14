import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { DashboardService } from "../dashboard/dashboard.service";
import { PerformanceService } from "../performance/performance.service";
import { ReportsService } from "../reports/reports.service";
import { UsersService } from "../users/users.service";

type AdminActor = { sub: string; role: string };

@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class AdminController {
  constructor(
    private readonly users: UsersService,
    private readonly dashboard: DashboardService,
    private readonly performance: PerformanceService,
    private readonly reports: ReportsService,
  ) {}

  @Get("profile")
  profile(@CurrentUser() user: AdminActor) {
    return this.users.profile(user.sub);
  }

  @Get("users")
  usersDirectory() {
    return this.users.list();
  }

  @Get("overview")
  overview(@CurrentUser() user: AdminActor) {
    return this.dashboard.summary(user);
  }

  @Get("performance")
  bdePerformance(
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: AdminActor,
  ) {
    return this.performance.summary(from, to, user);
  }

  @Get("reports/:type")
  report(
    @Param("type") type: string,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: AdminActor,
  ) {
    return this.reports.run(type, from, to, user);
  }
}
