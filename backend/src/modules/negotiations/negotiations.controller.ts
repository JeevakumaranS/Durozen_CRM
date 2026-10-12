import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CreateNegotiationDto } from "./dto/create-negotiation.dto";
import { NegotiationsService } from "./negotiations.service";

@Controller("negotiations")
@UseGuards(JwtAuthGuard, RolesGuard)
export class NegotiationsController {
  constructor(private readonly negotiations: NegotiationsService) {}
  @Get() list(@CurrentUser() user: { sub: string; role: string }) {
    return this.negotiations.list(user);
  }
  @Post() create(
    @Body() dto: CreateNegotiationDto,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.negotiations.create(dto, user);
  }
}
