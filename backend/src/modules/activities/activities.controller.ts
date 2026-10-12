import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ActivitiesService } from "./activities.service";

@Controller("activities")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}
  @Get() list(
    @Query("type") type: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.activities.list(type, from, to, user);
  }
}
