import { Injectable, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { sign } from "jsonwebtoken";
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
    const accessToken = sign(
      { sub: user.id, role: user.role, name: user.fullName },
      process.env.JWT_SECRET || "development-secret",
      { expiresIn: "8h" },
    );
    return {
      accessToken,
      user: {
        id: user.id,
        name: user.fullName,
        email: user.email,
        role: user.role,
      },
    };
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
      data: { passwordHash },
    });
    return { message: "Password updated" };
  }
}
