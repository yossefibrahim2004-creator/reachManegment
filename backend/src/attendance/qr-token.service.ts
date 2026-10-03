import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { AppErrorCode } from '../common/errors/error-codes';
import { ERROR_MESSAGES } from '../common/errors/error-messages';

export type AttendanceQrAction = 'CHECK_IN' | 'CHECK_OUT';

export interface AttendanceQrPayload {
  typ: 'ATTENDANCE_QR';
  wid: number;
  kid: number;
  act: AttendanceQrAction;
  nonce: string;
  iat?: number;
  exp?: number;
}

export const ATTENDANCE_QR_TTL_SECONDS = 20;

@Injectable()
export class QrTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private get secret(): string {
    return (
      this.configService.get<string>('ATTENDANCE_QR_SECRET') ||
      this.configService.get<string>('JWT_ACCESS_SECRET') ||
      ''
    );
  }

  async issue(params: {
    workplaceId: number;
    kioskId: number;
    action: AttendanceQrAction;
  }): Promise<{ token: string; expiresAt: Date; ttlSeconds: number; nonce: string }> {
    const nonce = randomUUID();
    const payload: AttendanceQrPayload = {
      typ: 'ATTENDANCE_QR',
      wid: params.workplaceId,
      kid: params.kioskId,
      act: params.action,
      nonce,
    };

    const token = await this.jwtService.signAsync(payload, {
      secret: this.secret,
      expiresIn: ATTENDANCE_QR_TTL_SECONDS,
    });

    const decoded = await this.jwtService.verifyAsync<AttendanceQrPayload>(token, {
      secret: this.secret,
    });
    const expiresAt = decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + ATTENDANCE_QR_TTL_SECONDS * 1000);

    return { token, expiresAt, ttlSeconds: ATTENDANCE_QR_TTL_SECONDS, nonce };
  }

  async verify(token: string): Promise<AttendanceQrPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<AttendanceQrPayload>(token, {
        secret: this.secret,
      });

      if (
        payload?.typ !== 'ATTENDANCE_QR' ||
        typeof payload.wid !== 'number' ||
        typeof payload.kid !== 'number' ||
        (payload.act !== 'CHECK_IN' && payload.act !== 'CHECK_OUT') ||
        typeof payload.nonce !== 'string'
      ) {
        throw new Error('invalid shape');
      }

      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.toLowerCase().includes('expired')) {
        throw new UnauthorizedException({
          code: AppErrorCode.QR_TOKEN_EXPIRED,
          message: ERROR_MESSAGES[AppErrorCode.QR_TOKEN_EXPIRED],
        });
      }
      throw new UnauthorizedException({
        code: AppErrorCode.QR_TOKEN_INVALID,
        message: ERROR_MESSAGES[AppErrorCode.QR_TOKEN_INVALID],
      });
    }
  }
}
