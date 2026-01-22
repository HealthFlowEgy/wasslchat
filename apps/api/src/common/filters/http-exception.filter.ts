import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    path?: string;
    timestamp: string;
  };
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let message: string;
    let details: any;
    let code: string;

    if (typeof exceptionResponse === 'object') {
      const responseObj = exceptionResponse as any;
      message = responseObj.message || exception.message;
      details = responseObj.details || responseObj.errors;
      code = responseObj.code || this.getErrorCode(status);

      // Handle class-validator errors
      if (Array.isArray(message)) {
        details = message;
        message = 'Validation failed';
        code = 'VALIDATION_ERROR';
      }
    } else {
      message = exceptionResponse as string;
      code = this.getErrorCode(status);
    }

    // Translate common error messages to Arabic
    const arabicMessage = this.translateMessage(message, code);

    const errorResponse: ErrorResponse = {
      success: false,
      error: {
        code,
        message: arabicMessage,
        details,
        path: request.url,
        timestamp: new Date().toISOString(),
      },
    };

    // Log error (don't log 4xx errors at error level)
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} - ${status}`,
        exception.stack,
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} - ${status}: ${message}`);
    }

    response.status(status).json(errorResponse);
  }

  private getErrorCode(status: number): string {
    const codes: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      405: 'METHOD_NOT_ALLOWED',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
    };
    return codes[status] || 'UNKNOWN_ERROR';
  }

  private translateMessage(message: string, code: string): string {
    // Common Arabic translations
    const translations: Record<string, string> = {
      UNAUTHORIZED: 'غير مصرح لك بالوصول. يرجى تسجيل الدخول',
      FORBIDDEN: 'ليس لديك صلاحية للوصول إلى هذا المورد',
      NOT_FOUND: 'المورد المطلوب غير موجود',
      VALIDATION_ERROR: 'فشل التحقق من البيانات',
      TOO_MANY_REQUESTS: 'لقد تجاوزت الحد المسموح من الطلبات. يرجى المحاولة لاحقاً',
      INTERNAL_SERVER_ERROR: 'حدث خطأ داخلي. يرجى المحاولة لاحقاً',
      CONFLICT: 'يوجد تعارض مع البيانات الموجودة',
      BAD_REQUEST: 'طلب غير صالح',
    };

    // Return Arabic translation if available, otherwise return original message
    return translations[code] || message;
  }
}
