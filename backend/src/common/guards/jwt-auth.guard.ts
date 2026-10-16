import {
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { JwtPayload, TokenExpiredError } from "jsonwebtoken";
import { verify } from "jsonwebtoken";
import { getJwtSecret } from "../../config/jwt.config";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : undefined;

    if (!token) throw new UnauthorizedException();

    let claims: JwtPayload | string;
    try {
      claims = verify(token, getJwtSecret());
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException({
          code: "TOKEN_EXPIRED",
          message: "Your session has expired. Please sign in again.",
        });
      }
      throw new UnauthorizedException();
    }

    if (
      typeof claims === "string" ||
      typeof claims.sub !== "string"
    ) {
      throw new UnauthorizedException();
    }
    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: {
        id: true,
        role: true,
        fullName: true,
        email: true,
        isActive: true,
      },
    });
    if (!user?.isActive) {
      throw new UnauthorizedException();
    }

    request.user = {
      sub: user.id,
      role: user.role,
      name: user.fullName,
      email: user.email,
    };
    return true;
  }
}
