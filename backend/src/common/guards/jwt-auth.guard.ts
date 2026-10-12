import {
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { verify } from "jsonwebtoken";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : undefined;

    if (!token) throw new UnauthorizedException();

    try {
      request.user = verify(
        token,
        process.env.JWT_SECRET || "development-secret",
      );
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
