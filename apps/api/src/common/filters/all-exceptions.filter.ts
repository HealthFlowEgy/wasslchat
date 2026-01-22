import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@wasslchat/database';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'حدث خطأ داخلي. يرجى المحاولة لاحقاً';
    let code = 'INTERNAL_SERVER_ERROR';
    let details: any;

    // Handle HTTP Exceptions
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || exception.message;
        code = (exceptionResponse as any).code || this.getErrorCode(status);
        details = (exceptionResponse as any).details;
      } else {
        message = exceptionResponse as string;
        code = this.getErrorCode(status);
      }
    }
    // Handle Prisma Errors
    else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const prismaError = this.handlePrismaError(exception);
      status = prismaError.status;
      message = prismaError.message;
      code = prismaError.code;
      details = prismaError.details;
    }
    // Handle Prisma Validation Errors
    else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'خطأ في التحقق من البيانات';
      code = 'VALIDATION_ERROR';
    }
    // Handle other errors
    else if (exception instanceof Error) {
      message = exception.message;
      
      // Don't expose internal error messages in production
      if (process.env.NODE_ENV === 'production') {
        message = 'حدث خطأ داخلي. يرجى المحاولة لاحقاً';
      }
    }

    // Log the error
    this.logger.error(
      `${request.method} ${request.url} - ${status}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
        details,
        path: request.url,
        timestamp: new Date().toISOString(),
      },
    });
  }

  private handlePrismaError(error: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
    code: string;
    details?: any;
  } {
    switch (error.code) {
      case 'P2002': // Unique constraint violation
        const target = (error.meta?.target as string[]) || [];
        return {
          status: HttpStatus.CONFLICT,
          message: `القيمة موجودة مسبقاً: ${target.join(', ')}`,
          code: 'DUPLICATE_ENTRY',
          details: { fields: target },
        };

      case 'P2025': // Record not found
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'السجل المطلوب غير موجود',
          code: 'NOT_FOUND',
        };

      case 'P2003': // Foreign key constraint failed
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'لا يمكن تنفيذ العملية. السجل مرتبط ببيانات أخرى',
          code: 'FOREIGN_KEY_VIOLATION',
        };

      case 'P2014': // Required relation violation
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'البيانات المطلوبة غير مكتملة',
          code: 'REQUIRED_RELATION_VIOLATION',
        };

      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'حدث خطأ في قاعدة البيانات',
          code: 'DATABASE_ERROR',
          details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
        };
    }
  }

  private getErrorCode(status: number): string {
    const codes: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
    };
    return codes[status] || 'UNKNOWN_ERROR';
  }
}
