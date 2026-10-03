import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { AppErrorCode } from '../common/errors/error-codes';
import { ERROR_MESSAGES } from '../common/errors/error-messages';
import { EmployeesService } from '../employees/employees.service';

@Injectable()
export class AuthService {
  constructor(
    private employeesService: EmployeesService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(username: string, password: string) {
    try {
      this.assertRequiredCredentials(username, password);

      const employee = await this.employeesService.findByUsername(username.trim());
      if (!employee) {
        throw new UnauthorizedException({
          code: AppErrorCode.INVALID_CREDENTIALS,
          message: ERROR_MESSAGES[AppErrorCode.INVALID_CREDENTIALS],
        });
      }

      if (!employee.isActive) {
        throw new ForbiddenException({
          code: AppErrorCode.ACCOUNT_INACTIVE,
          message: ERROR_MESSAGES[AppErrorCode.ACCOUNT_INACTIVE],
        });
      }

      const passwordValid = await argon2.verify(employee.passwordHash, password);
      if (!passwordValid) {
        throw new UnauthorizedException({
          code: AppErrorCode.INVALID_CREDENTIALS,
          message: ERROR_MESSAGES[AppErrorCode.INVALID_CREDENTIALS],
        });
      }

      const tokens = await this.generateTokens(employee.id, employee.username, employee.role);
      await this.employeesService.updateRefreshToken(employee.id, tokens.refreshToken);

      const employeeSummary = this.getEmployeeSummary(employee);

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        employee: employeeSummary,
      };
    } catch (error) {
      this.rethrowOrConvertToInternalError(error);
    }
  }

  async refreshTokens(employeeId: number | undefined, refreshToken: string) {
    try {
      // Always verify signature/expiry first — even when employeeId is supplied (ISS-013).
      let resolvedEmployeeId: number;
      try {
        const payload = await this.jwtService.verifyAsync(refreshToken, {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        });
        resolvedEmployeeId = Number(payload.sub);
      } catch {
        throw new UnauthorizedException({
          code: AppErrorCode.TOKEN_EXPIRED,
          message: ERROR_MESSAGES[AppErrorCode.TOKEN_EXPIRED],
        });
      }

      if (
        employeeId !== undefined &&
        employeeId !== null &&
        employeeId !== resolvedEmployeeId
      ) {
        throw new UnauthorizedException({
          code: AppErrorCode.TOKEN_EXPIRED,
          message: ERROR_MESSAGES[AppErrorCode.TOKEN_EXPIRED],
        });
      }

      const employee = await this.employeesService.findById(resolvedEmployeeId);
      if (!employee || !employee.isActive) {
        throw new ForbiddenException({
          code: AppErrorCode.ACCOUNT_INACTIVE,
          message: ERROR_MESSAGES[AppErrorCode.ACCOUNT_INACTIVE],
        });
      }

      if (!employee.refreshToken) {
        throw new UnauthorizedException({
          code: AppErrorCode.TOKEN_EXPIRED,
          message: ERROR_MESSAGES[AppErrorCode.TOKEN_EXPIRED],
        });
      }

      const refreshTokenValid = await argon2.verify(employee.refreshToken, refreshToken);
      if (!refreshTokenValid) {
        throw new UnauthorizedException({
          code: AppErrorCode.TOKEN_EXPIRED,
          message: ERROR_MESSAGES[AppErrorCode.TOKEN_EXPIRED],
        });
      }

      const tokens = await this.generateTokens(employee.id, employee.username, employee.role);
      await this.employeesService.updateRefreshToken(employee.id, tokens.refreshToken);

      const employeeSummary = this.getEmployeeSummary(employee);

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        employee: employeeSummary,
      };
    } catch (error) {
      this.rethrowOrConvertToInternalError(error);
    }
  }

  async logout(employeeId: number) {
    try {
      await this.employeesService.updateRefreshToken(employeeId, null);
    } catch (error) {
      this.rethrowOrConvertToInternalError(error);
    }
  }

  async changePassword(employeeId: number, currentPassword: string, newPassword: string) {
    try {
      if (!currentPassword?.trim() || !newPassword?.trim()) {
        throw new BadRequestException({
          code: AppErrorCode.VALIDATION_ERROR,
          message: ERROR_MESSAGES[AppErrorCode.VALIDATION_ERROR],
        });
      }

      const employee = await this.employeesService.findById(employeeId);
      if (!employee) {
        throw new UnauthorizedException({
          code: AppErrorCode.INVALID_CREDENTIALS,
          message: ERROR_MESSAGES[AppErrorCode.INVALID_CREDENTIALS],
        });
      }

      const passwordValid = await argon2.verify(employee.passwordHash, currentPassword);
      if (!passwordValid) {
        throw new UnauthorizedException({
          code: AppErrorCode.INVALID_CREDENTIALS,
          message: ERROR_MESSAGES[AppErrorCode.INVALID_CREDENTIALS],
        });
      }

      const newHash = await argon2.hash(newPassword);
      await this.employeesService.updatePasswordHash(employeeId, newHash);
      await this.employeesService.updateRefreshToken(employeeId, null);

      return { message: 'Password changed successfully' };
    } catch (error) {
      this.rethrowOrConvertToInternalError(error);
    }
  }

  async getProfile(employeeId: number) {
    try {
      const employee = await this.employeesService.findById(employeeId);
      if (!employee) {
        throw new UnauthorizedException({
          code: AppErrorCode.INVALID_CREDENTIALS,
          message: ERROR_MESSAGES[AppErrorCode.INVALID_CREDENTIALS],
        });
      }

      return {
        ...this.getEmployeeSummary(employee),
        isActive: employee.isActive,
      };
    } catch (error) {
      this.rethrowOrConvertToInternalError(error);
    }
  }

  private assertRequiredCredentials(username: string, password: string) {
    if (!username?.trim() || !password?.trim()) {
      throw new BadRequestException({
        code: AppErrorCode.VALIDATION_ERROR,
        message: ERROR_MESSAGES[AppErrorCode.VALIDATION_ERROR],
      });
    }
  }

  private rethrowOrConvertToInternalError(error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }

    throw new InternalServerErrorException({
      code: AppErrorCode.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES[AppErrorCode.INTERNAL_SERVER_ERROR],
    });
  }

  private getEmployeeSummary(employee: {
    id: number;
    name: string;
    username: string;
    role: string;
    workplaceId?: number | null;
  }) {
    const safeName = employee.name ?? '';
    const nameParts = safeName.trim().split(/\s+/);
    const firstName = nameParts[0] ?? '';
    const lastName = nameParts.slice(1).join(' ');

    return {
      id: employee.id,
      name: employee.name,
      firstName,
      lastName,
      username: employee.username,
      role: employee.role,
      workplaceId: employee.workplaceId ?? null,
    };
  }

  private async generateTokens(employeeId: number, username: string, role: string) {
    const payload = { sub: employeeId, username, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRATION', '7d'),
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
