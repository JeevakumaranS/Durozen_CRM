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
import { CreateMeetingDto } from "./dto/create-meeting.dto";
import { LogMeetingDto } from "./dto/log-meeting.dto";
import { RescheduleMeetingDto } from "./dto/reschedule-meeting.dto";
import { UpdateMeetingDto } from "./dto/update-meeting.dto";
import { MeetingsService } from "./meetings.service";

@Controller("meetings")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "BDE")
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}
  @Get() list(
    @Query("date") date: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("status") status: string | undefined,
    @Query("search") search: string | undefined,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.meetings.list({ date, from, to, status, search }, user);
  }
  @Get(":id")
  get(
    @Param("id") id: string,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.meetings.get(id, user);
  }
  @Post() create(
    @Body() dto: CreateMeetingDto,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.meetings.create(dto, user);
  }
  @Post("log") log(
    @Body() dto: LogMeetingDto,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.meetings.log(dto, user);
  }
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateMeetingDto,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.meetings.update(id, dto, user);
  }
  @Patch(":id/reschedule")
  reschedule(
    @Param("id") id: string,
    @Body() dto: RescheduleMeetingDto,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.meetings.reschedule(id, dto.meetingAt, user);
  }
  @Patch(":id/complete")
  complete(
    @Param("id") id: string,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.meetings.complete(id, user);
  }
  @Patch(":id/cancel")
  cancel(
    @Param("id") id: string,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.meetings.cancel(id, user);
  }
}
