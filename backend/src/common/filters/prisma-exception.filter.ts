import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(
    exception: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    const response = host.switchToHttp().getResponse();
    const status =
      exception.code === "P2025" ? HttpStatus.NOT_FOUND : HttpStatus.CONFLICT;
    response.status(status).json({
      statusCode: status,
      message:
        exception.code === "P2025"
          ? "Record not found"
          : "Database constraint failed",
      timestamp: new Date().toISOString(),
    });
  }
}
