import {
  Body,
  Delete,
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
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";
import { UpdateUserManagerDto } from "./dto/update-user-manager.dto";
import { UpdateTeamUserDto } from "./dto/update-team-user.dto";
import { UpdateTeamUserPasswordDto } from "./dto/update-team-user-password.dto";
import { UsersService } from "./users.service";

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get("managers")
  managers() {
    return this.users.listActiveManagers();
  }

  @Get("my-team")
  @Roles("SALES_MANAGER")
  myTeam(@CurrentUser() user: { sub: string }) {
    return this.users.listManagedBdes(user.sub);
  }

  @Get()
  list(
    @Query("page") page: string | undefined,
    @Query("pageSize") pageSize: string | undefined,
    @Query("search") search: string | undefined,
  ) {
    if (page !== undefined || pageSize !== undefined || search !== undefined) {
      const parsedPage = Number(page);
      const parsedPageSize = Number(pageSize);
      return this.users.listTeamPage(
        Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
        Number.isInteger(parsedPageSize) && parsedPageSize > 0
          ? Math.min(parsedPageSize, 100)
          : 20,
        search?.trim() || undefined,
      );
    }
    return this.users.list();
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(":id/status")
  setActive(@Param("id") id: string, @Body() dto: UpdateUserStatusDto) {
    return this.users.setActive(id, dto.isActive);
  }

  @Patch(":id/manager")
  setManager(@Param("id") id: string, @Body() dto: UpdateUserManagerDto) {
    return this.users.setManager(id, dto.managerId ?? null);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateTeamUserDto) {
    return this.users.updateTeamUser(id, dto);
  }

  @Patch(":id/password")
  updatePassword(
    @Param("id") id: string,
    @Body() dto: UpdateTeamUserPasswordDto,
  ) {
    return this.users.updateTeamUserPassword(id, dto.password);
  }

  @Delete(":id")
  delete(@Param("id") id: string) {
    return this.users.deleteTeamUser(id);
  }
}
