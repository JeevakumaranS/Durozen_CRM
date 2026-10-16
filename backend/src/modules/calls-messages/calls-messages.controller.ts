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
import { CallsMessagesService } from "./calls-messages.service";
import { CompleteCallMessageDto } from "./dto/complete-call-message.dto";
import { CreateCallMessageDto } from "./dto/create-call-message.dto";

@Controller("calls-messages")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "BDE")
export class CallsMessagesController {
  constructor(private readonly callsMessages: CallsMessagesService) {}

  @Get()
  list(
    @Query("status") status: string | undefined,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.callsMessages.list(status, user);
  }

  @Post()
  create(
    @Body() dto: CreateCallMessageDto,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.callsMessages.create(dto, user);
  }

  @Patch(":id/complete")
  complete(
    @Param("id") id: string,
    @Body() dto: CompleteCallMessageDto,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.callsMessages.complete(id, dto, user);
  }
}
