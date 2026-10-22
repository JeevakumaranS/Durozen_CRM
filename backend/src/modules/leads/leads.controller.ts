import {
  Body,
  Controller,
  Delete,
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
import { LeadsService } from "./leads.service";
import { CreateLeadDto, LeadStage } from "./dto/create-lead.dto";
import { CreateActivityDto } from "./dto/create-activity.dto";
import { RecordLeadPaymentDto } from "./dto/record-lead-payment.dto";
import { UpdateLeadDto } from "./dto/update-lead.dto";

@Controller("leads")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "BDE", "SALES_MANAGER")
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
  @Post()
  @Roles("ADMIN", "BDE")
  create(
    @Body() dto: CreateLeadDto,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.leads.create(dto, user);
  }
  @Post(":id/activities")
  @Roles("ADMIN", "BDE")
  addActivity(
    @Param("id") id: string,
    @Body() dto: CreateActivityDto,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.leads.addActivity(id, dto, user);
  }
  @Post(":id/payments")
  recordPayment(
    @Param("id") id: string,
    @Body() dto: RecordLeadPaymentDto,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.leads.recordPayment(id, dto.amount, user);
  }
  @Patch(":id") update(
    @Param("id") id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.leads.update(id, dto, user);
  }

  @Delete(":id")
  @Roles("ADMIN")
  delete(
    @Param("id") id: string,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    return this.leads.delete(id, user);
  }
}
