import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { LeadsService } from "./leads.service";
import { CreateLeadDto, LeadStage } from "./dto/create-lead.dto";
import { CreateActivityDto } from "./dto/create-activity.dto";
import { UpdateLeadDto } from "./dto/update-lead.dto";

@Controller("leads")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get("assignees") assignees(
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.leads.assignees(user);
  }
  @Get() list(
    @Query("stage") stage: LeadStage | undefined,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.leads.list(stage, user);
  }
  @Get(":id") get(
    @Param("id") id: string,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.leads.get(id, user);
  }
  @Post() create(
    @Body() dto: CreateLeadDto,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    if (user.role === "BDE") dto.assignedBdeId = user.sub;
    return this.leads.create(dto, user.sub);
  }
  @Post(":id/activities") addActivity(
    @Param("id") id: string,
    @Body() dto: CreateActivityDto,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.leads.addActivity(id, dto, user);
  }
  @Patch(":id") update(
    @Param("id") id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.leads.update(id, dto, user);
  }
}
