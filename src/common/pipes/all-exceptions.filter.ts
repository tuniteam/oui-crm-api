import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ApiMessages } from '../messages';

const { errors } = ApiMessages;

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (!(exception instanceof HttpException)) {
      console.error('[AllExceptionsFilter] Unhandled exception:', exception);
    }

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let code: string = errors.code.INTERNAL_ERROR;
    let text: string = errors.message.INTERNAL_ERROR;
    let details: string[] | undefined;

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        // Case 1: Error with code/message (new format from services)
        if (resp.code && resp.message) {
          code = resp.code as string;
          text = resp.message as string;
          if (Array.isArray(resp.details)) {
            details = resp.details as string[];
          }
        }
        else if (status === HttpStatus.UNAUTHORIZED) {
          code = errors.code.UNAUTHORIZED;
          text = errors.message.UNAUTHORIZED;
        }
        // Case 2: DTO validation error (class-validator)
        else if (Array.isArray(resp.message)) {
          code = errors.code.INVALID_DATA;
          text = resp.message.join(', ');
        }
        // Case 3: Simple error
        else if (resp.message) {
          code = errors.code.INVALID_DATA;
          text = resp.message as string;
        }
      } else {
        text = exceptionResponse as string;
      }
    }

    const body: Record<string, unknown> = {
      statusCode: String(status),
      code,
      text,
      level: 'error',
    };
    if (details) {
      body.details = details;
    }

    response.status(status).json({ messages: body });
  }
}