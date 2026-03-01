import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';
    
    // Check if message is object (like validation error)
    const msgStr = typeof message === 'object' && (message as any).message 
      ? Array.isArray((message as any).message) 
        ? (message as any).message.join(', ') 
        : (message as any).message
      : (message as any).toString();

    response.status(status).json({
      code: status !== 200 && status !== 201 ? status : 500, // Non-zero code for error
      message: msgStr,
      data: null,
    });
  }
}
