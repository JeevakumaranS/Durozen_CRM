import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    const status = exception.getStatus();
    const payload = exception.getResponse();
    response.status(status).json({
      statusCode: status,
      message:
        typeof payload === "string"
          ? payload
          : ((payload as { message?: unknown }).message ?? exception.message),
      timestamp: new Date().toISOString(),
    });
  }
}
