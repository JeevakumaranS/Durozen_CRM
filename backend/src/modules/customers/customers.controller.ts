import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CustomersService } from "./customers.service";

@Controller("customers")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}
  @Get() list(@CurrentUser() user: { sub: string; role: string }) {
    return this.customers.list(user);
  }
}
