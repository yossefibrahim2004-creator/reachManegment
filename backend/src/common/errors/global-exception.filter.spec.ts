import { BadRequestException, HttpStatus, InternalServerErrorException } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

describe('GlobalExceptionFilter', () => {
  it('serializes HttpException responses with message, code and statusCode', () => {
    const filter = new GlobalExceptionFilter();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/auth/login' }),
      }),
    } as any;

    filter.catch(new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Please fill in all required fields.' }), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      message: 'Please fill in all required fields.',
      code: 'VALIDATION_ERROR',
      statusCode: HttpStatus.BAD_REQUEST,
    });
  });

  it('serializes unknown errors to a safe user-facing response', () => {
    const filter = new GlobalExceptionFilter();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/auth/login' }),
      }),
    } as any;

    filter.catch(new InternalServerErrorException('db exploded'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      message: "We're having trouble connecting. Please try again shortly.",
      code: 'INTERNAL_SERVER_ERROR',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  });
});
