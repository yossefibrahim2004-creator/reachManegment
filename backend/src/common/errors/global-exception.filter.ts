import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { AppErrorCode } from './error-codes';
import { ERROR_MESSAGES } from './error-messages';
import { ErrorResponseDto } from './error-response.interface';

interface ResolvedError {
  status: number;
  code: string;
  message: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const resolved = this.resolve(exception);

    const safeResponse: ErrorResponseDto = {
      message:
        resolved.status >= 500
          ? ERROR_MESSAGES[AppErrorCode.CONNECTION_ERROR]
          : resolved.message,
      code: resolved.code,
      statusCode: resolved.status,
    };

    if (resolved.status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${resolved.status} ${resolved.code}`,
        exception instanceof Error ? exception.stack : undefined,
        GlobalExceptionFilter.name,
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} -> ${resolved.status} ${resolved.code}: ${safeResponse.message}`,
        GlobalExceptionFilter.name,
      );
    }

    response.status(resolved.status).json(safeResponse);
  }

  private resolve(exception: unknown): ResolvedError {
    const prismaError = this.mapPrismaError(exception);
    if (prismaError) {
      return prismaError;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse() as Record<string, unknown>;

      const code =
        typeof payload?.code === 'string' && payload.code.trim()
          ? payload.code
          : status >= 500
            ? AppErrorCode.INTERNAL_SERVER_ERROR
            : AppErrorCode.VALIDATION_ERROR;

      return { status, code, message: this.resolveMessage(payload?.message, status) };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: AppErrorCode.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES[AppErrorCode.CONNECTION_ERROR],
    };
  }

  /**
   * ValidationPipe failures carry `message` as an array of constraint strings —
   * join them so clients can show which fields failed.
   */
  private resolveMessage(raw: unknown, status: number): string {
    if (typeof raw === 'string' && raw.trim()) {
      return raw;
    }

    if (Array.isArray(raw)) {
      const joined = raw
        .filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
        .join(' • ');
      if (joined) {
        return joined;
      }
    }

    if (raw && typeof raw === 'object') {
      const objectMessage = (raw as { message?: unknown }).message;
      if (typeof objectMessage === 'string' && objectMessage.trim()) {
        return objectMessage;
      }
    }

    if (status >= 500) {
      return ERROR_MESSAGES[AppErrorCode.CONNECTION_ERROR];
    }
    if (status >= 400) {
      return ERROR_MESSAGES[AppErrorCode.VALIDATION_ERROR];
    }
    return ERROR_MESSAGES[AppErrorCode.INTERNAL_SERVER_ERROR];
  }

  /**
   * Map well-known Prisma request errors to proper HTTP statuses so unique
   * constraint races return 409 instead of leaking a generic 500.
   * Returns null when the error is not a mapped Prisma error.
   */
  private mapPrismaError(exception: unknown): ResolvedError | null {
    if (!(exception instanceof Prisma.PrismaClientKnownRequestError)) {
      return null;
    }

    switch (exception.code) {
      case 'P2002': {
        const target = exception.meta?.target;
        const targetLabel = Array.isArray(target)
          ? ` (${target.map(String).join(', ')})`
          : typeof target === 'string'
            ? ` (${target})`
            : '';
        return {
          status: HttpStatus.CONFLICT,
          code: AppErrorCode.CONFLICT,
          message: `A record with this value already exists${targetLabel}.`,
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: AppErrorCode.NOT_FOUND,
          message: ERROR_MESSAGES[AppErrorCode.NOT_FOUND],
        };
      case 'P2023':
        return {
          status: HttpStatus.BAD_REQUEST,
          code: AppErrorCode.VALIDATION_ERROR,
          message: ERROR_MESSAGES[AppErrorCode.VALIDATION_ERROR],
        };
      default:
        return null;
    }
  }
}
