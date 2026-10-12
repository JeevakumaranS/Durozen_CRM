import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CreateMeetingDto } from "./dto/create-meeting.dto";
import { MeetingsService } from "./meetings.service";

@Controller("meetings")
@UseGuards(JwtAuthGuard, RolesGuard)
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}
  @Get() list(
    @Query("date") date: string | undefined,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.meetings.list(date, user);
  }
  @Post() create(
    @Body() dto: CreateMeetingDto,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.meetings.create(dto, user);
  }
}
