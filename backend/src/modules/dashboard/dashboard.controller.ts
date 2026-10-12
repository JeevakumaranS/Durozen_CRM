import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { DashboardService } from "./dashboard.service";
@Controller("dashboard")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}
  @Get("summary") summary(@CurrentUser() user: { sub: string; role: string }) {
    return this.dashboard.summary(user);
  }
}
