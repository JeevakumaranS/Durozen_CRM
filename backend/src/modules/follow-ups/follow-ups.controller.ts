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
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CreateFollowUpDto } from "./dto/create-follow-up.dto";
import { UpdateFollowUpDto } from "./dto/update-follow-up.dto";
import { FollowUpsService } from "./follow-ups.service";

@Controller("follow-ups")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "BDE", "SALES_MANAGER")
export class FollowUpsController {
  constructor(private readonly followUps: FollowUpsService) {}

  @Get()
  list(
    @Query("scope") scope: string | undefined,
    @Query("search") search: string | undefined,
    @Query("type") type: string | undefined,
    @Query("assignedBdeId") assignedBdeId: string | undefined,
    @Query("status") status: string | undefined,
    @Query("pendingResponse") pendingResponse: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.followUps.list(
      { scope, search, type, assignedBdeId, status, pendingResponse, from, to },
      user,
    );
  }

  @Get("summary")
  summary(@CurrentUser() user: { sub: string; role: string }) {
    return this.followUps.summary(user);
  }

  @Get("lead/:leadId/pending-proposal")
  pendingProposalForLead(
    @Param("leadId") leadId: string,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.followUps.pendingProposalForLead(leadId, user);
  }

  @Post()
  create(
    @Body() dto: CreateFollowUpDto,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.followUps.create(dto, user);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateFollowUpDto,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.followUps.update(id, dto, user);
  }
}
