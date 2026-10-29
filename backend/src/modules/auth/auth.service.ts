import { Injectable, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { sign } from "jsonwebtoken";
import {
  getJwtExpirationMinutes,
  getJwtSecret,
} from "../../config/jwt.config";
import { PrismaService } from "../../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase(), isActive: true },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash)))
      throw new UnauthorizedException("Invalid email or password");
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date(), isOnline: true },
    });
    const accessToken = sign(
      {
        sub: user.id,
        role: user.role,
        name: user.fullName,
        tokenVersion: user.tokenVersion,
      },
      getJwtSecret(),
      { expiresIn: `${getJwtExpirationMinutes()}m` },
    );
    return {
      accessToken,
      user: {
        id: user.id,
        name: user.fullName,
        email: user.email,
        role: user.role,
        canViewCustomers: user.canViewCustomers,
      },
    };
  }

  async currentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, isActive: true },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        canViewCustomers: true,
      },
    });
    if (!user) throw new UnauthorizedException();
    return {
      id: user.id,
      name: user.fullName,
      email: user.email,
      role: user.role,
      canViewCustomers: user.canViewCustomers,
    };
  }

  async logout(userId: string) {
    await this.prisma.user.updateMany({
      where: { id: userId, isActive: true },
      data: { lastActiveAt: new Date(), isOnline: false },
    });
    return { message: "Signed out" };
  }

  async heartbeat(userId: string) {
    await this.prisma.user.updateMany({
      where: { id: userId, isActive: true },
      data: { lastActiveAt: new Date(), isOnline: true },
    });
    return { ok: true };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (
      !user ||
      !user.isActive ||
      !(await bcrypt.compare(currentPassword, user.passwordHash))
    ) {
      throw new UnauthorizedException("Current password is incorrect");
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    return { message: "Password updated" };
  }
}
