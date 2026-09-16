import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '../../domain/domain.error';

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = {
      ENTITY_NOT_FOUND: HttpStatus.NOT_FOUND,
      INSUFFICIENT_STOCK: HttpStatus.BAD_REQUEST,
      CONFLICT: HttpStatus.CONFLICT,
      PRESCRIPTION_REQUIRED: HttpStatus.BAD_REQUEST,
    }[error.code];

    response.status(status).json({
      statusCode: status,
      error: error.code,
      message: error.message,
    });
  }
}
