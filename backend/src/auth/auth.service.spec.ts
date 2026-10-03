import { BadRequestException, ForbiddenException, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { AppErrorCode } from '../common/errors/error-codes';
import { ERROR_MESSAGES } from '../common/errors/error-messages';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const employeesService = {
    findByUsername: jest.fn(),
    updateRefreshToken: jest.fn(),
    findById: jest.fn(),
    updatePasswordHash: jest.fn(),
  };

  const jwtService = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };

  const configService = {
    get: jest.fn((key: string, fallback?: string) => fallback ?? key),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jwtService.signAsync.mockResolvedValue('token');
  });

  it('throws validation error for empty credentials', async () => {
    const service = new AuthService(employeesService as any, jwtService as any, configService as any);

    await expect(service.login('', 'secret')).rejects.toMatchObject({
      response: {
        code: AppErrorCode.VALIDATION_ERROR,
        message: ERROR_MESSAGES[AppErrorCode.VALIDATION_ERROR],
      },
    });
  });

  it('throws invalid credentials when user is not found', async () => {
    const service = new AuthService(employeesService as any, jwtService as any, configService as any);
    employeesService.findByUsername.mockResolvedValue(null);

    await expect(service.login('missing-user', 'secret')).rejects.toMatchObject({
      response: {
        code: AppErrorCode.INVALID_CREDENTIALS,
        message: ERROR_MESSAGES[AppErrorCode.INVALID_CREDENTIALS],
      },
    });
  });

  it('throws inactive account error for disabled employees', async () => {
    const service = new AuthService(employeesService as any, jwtService as any, configService as any);
    employeesService.findByUsername.mockResolvedValue({
      id: 1,
      username: 'jane',
      role: 'ADMIN',
      name: 'Jane Doe',
      isActive: false,
      passwordHash: 'hash',
    });

    await expect(service.login('jane', 'secret')).rejects.toMatchObject({
      response: {
        code: AppErrorCode.ACCOUNT_INACTIVE,
        message: ERROR_MESSAGES[AppErrorCode.ACCOUNT_INACTIVE],
      },
    });
  });

  it('converts database failures to a safe internal error', async () => {
    const service = new AuthService(employeesService as any, jwtService as any, configService as any);
    employeesService.findByUsername.mockRejectedValue(new Error('Prisma connection failed'));

    await expect(service.login('jane', 'secret')).rejects.toMatchObject({
      response: {
        code: AppErrorCode.INTERNAL_SERVER_ERROR,
        message: ERROR_MESSAGES[AppErrorCode.INTERNAL_SERVER_ERROR],
      },
    });
  });

  describe('refreshTokens (ISS-013)', () => {
    const employee = {
      id: 7,
      username: 'jane',
      role: 'ADMIN',
      name: 'Jane Doe',
      isActive: true,
      passwordHash: 'argon-hash',
      refreshToken: 'stored-hash',
      workplaceId: null,
    };

    function makeService() {
      return new AuthService(
        employeesService as any,
        jwtService as any,
        configService as any,
      );
    }

    it('verifies the refresh JWT signature/expiry even when employeeId is supplied', async () => {
      const service = makeService();
      jwtService.verifyAsync.mockResolvedValue({ sub: 7, username: 'jane', role: 'ADMIN' });
      employeesService.findById.mockResolvedValue(employee);
      jest.spyOn(require('argon2'), 'verify').mockResolvedValue(true as any);

      await service.refreshTokens(7, 'signed-refresh-token');

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('signed-refresh-token', {
        secret: expect.anything(),
      });
    });

    it('rejects an expired refresh JWT even when employeeId matches', async () => {
      const service = makeService();
      jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(service.refreshTokens(7, 'expired-token')).rejects.toMatchObject({
        response: {
          code: AppErrorCode.TOKEN_EXPIRED,
          message: ERROR_MESSAGES[AppErrorCode.TOKEN_EXPIRED],
        },
      });
      expect(employeesService.findById).not.toHaveBeenCalled();
    });

    it('rejects when supplied employeeId does not match the token subject', async () => {
      const service = makeService();
      jwtService.verifyAsync.mockResolvedValue({ sub: 7, username: 'jane', role: 'ADMIN' });

      await expect(service.refreshTokens(99, 'other-users-token')).rejects.toMatchObject({
        response: {
          code: AppErrorCode.TOKEN_EXPIRED,
          message: ERROR_MESSAGES[AppErrorCode.TOKEN_EXPIRED],
        },
      });
      expect(employeesService.findById).not.toHaveBeenCalled();
    });
  });
});
