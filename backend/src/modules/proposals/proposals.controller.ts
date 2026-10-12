import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CreateProposalDto } from "./dto/create-proposal.dto";
import { UpdateProposalDto } from "./dto/update-proposal.dto";
import { ProposalsService } from "./proposals.service";

@Controller("proposals")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProposalsController {
  constructor(private readonly proposals: ProposalsService) {}
  @Get() list(@CurrentUser() user: { sub: string; role: string }) {
    return this.proposals.list(user);
  }
  @Post() create(
    @Body() dto: CreateProposalDto,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.proposals.create(dto, user);
  }
  @Patch(":id") update(
    @Param("id") id: string,
    @Body() dto: UpdateProposalDto,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.proposals.update(id, dto, user);
  }
}
