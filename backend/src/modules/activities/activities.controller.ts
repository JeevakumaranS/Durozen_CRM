import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ActivitiesService } from "./activities.service";

@Controller("activities")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "BDE", "SALES_MANAGER")
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}
  @Get() list(
    @Query("type") type: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("search") search: string | undefined,
    @Query("category") category: string | undefined,
    @Query("page") page: string | undefined,
    @Query("pageSize") pageSize: string | undefined,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    const requestedPage = Number(page);
    const requestedPageSize = Number(pageSize);
    return this.activities.list(
      type,
      from,
      to,
      search?.trim() || undefined,
      category,
      Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
      Number.isInteger(requestedPageSize) && requestedPageSize > 0
        ? Math.min(requestedPageSize, 100)
        : 20,
      user,
    );
  }
}
