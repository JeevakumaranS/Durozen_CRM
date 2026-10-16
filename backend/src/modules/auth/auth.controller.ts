import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post("login") login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
  @Get("me")
  @UseGuards(JwtAuthGuard)
  currentUser(@CurrentUser() user: { sub: string }) {
    return this.auth.currentUser(user.sub);
  }
  @Post("logout")
  @UseGuards(JwtAuthGuard)
  logout() {
    return this.auth.logout();
  }
  @Patch("password")
  @UseGuards(JwtAuthGuard)
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: { sub: string },
  ) {
    return this.auth.changePassword(
      user.sub,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
