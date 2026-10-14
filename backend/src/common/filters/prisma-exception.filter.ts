import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

@Catch(PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(
    exception: PrismaClientKnownRequestError,
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
