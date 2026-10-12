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
import { CreateFollowUpDto } from "./dto/create-follow-up.dto";
import { UpdateFollowUpDto } from "./dto/update-follow-up.dto";
import { FollowUpsService } from "./follow-ups.service";

@Controller("follow-ups")
@UseGuards(JwtAuthGuard, RolesGuard)
export class FollowUpsController {
  constructor(private readonly followUps: FollowUpsService) {}

  @Get()
  list(
    @Query("scope") scope: string | undefined,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.followUps.list(scope, user);
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
