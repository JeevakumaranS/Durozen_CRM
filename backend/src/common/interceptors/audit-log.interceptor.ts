import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { finalize, Observable } from "rxjs";

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const startedAt = Date.now();
    return next.handle().pipe(
      finalize(() => {
        this.logger.log(
          `${request.method} ${request.originalUrl ?? request.url} ${Date.now() - startedAt}ms`,
        );
      }),
    );
  }
}
