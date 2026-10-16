import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import {
  SCHEDULED_MEETING_CONFLICT,
  SCHEDULED_MEETING_UNIQUE_INDEX,
} from "../scheduled-meeting";

@Catch(PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(
    exception: PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    const response = host.switchToHttp().getResponse();
    const target = exception.meta?.target;
    const scheduledMeetingConflict =
      exception.code === "P2002" &&
      (target === SCHEDULED_MEETING_UNIQUE_INDEX ||
        (Array.isArray(target) &&
          (target.includes(SCHEDULED_MEETING_UNIQUE_INDEX) ||
            (target.length === 1 && target[0] === "lead_id"))));
    const status =
      exception.code === "P2025" ? HttpStatus.NOT_FOUND : HttpStatus.CONFLICT;
    response.status(status).json({
      statusCode: status,
      message: scheduledMeetingConflict
        ? SCHEDULED_MEETING_CONFLICT
        : exception.code === "P2025"
          ? "Record not found"
          : "Database constraint failed",
      timestamp: new Date().toISOString(),
    });
  }
}
