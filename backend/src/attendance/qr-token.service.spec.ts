import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { QrTokenService, ATTENDANCE_QR_TTL_SECONDS } from './qr-token.service';

describe('QrTokenService', () => {
  let service: QrTokenService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        JwtModule.register({ secret: 'test-access-secret' }),
      ],
      providers: [QrTokenService],
    }).compile();

    service = moduleRef.get(QrTokenService);
    // ensure dedicated QR secret path is exercised
    const config = moduleRef.get(ConfigService);
    jest.spyOn(config, 'get').mockImplementation((key: string) => {
      if (key === 'ATTENDANCE_QR_SECRET') return 'test-qr-secret';
      if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret';
      return undefined;
    });
  });

  it('issues a signed token with workplace, kiosk, action, nonce and expiry', async () => {
    const issued = await service.issue({
      workplaceId: 7,
      kioskId: 3,
      action: 'CHECK_IN',
    });

    expect(issued.token).toEqual(expect.any(String));
    expect(issued.ttlSeconds).toBe(ATTENDANCE_QR_TTL_SECONDS);
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const payload = await service.verify(issued.token);
    expect(payload.typ).toBe('ATTENDANCE_QR');
    expect(payload.wid).toBe(7);
    expect(payload.kid).toBe(3);
    expect(payload.act).toBe('CHECK_IN');
    expect(payload.nonce).toBe(issued.nonce);
  });

  it('preserves CHECK_OUT action distinctly from CHECK_IN', async () => {
    const issued = await service.issue({
      workplaceId: 1,
      kioskId: 1,
      action: 'CHECK_OUT',
    });
    const payload = await service.verify(issued.token);
    expect(payload.act).toBe('CHECK_OUT');
  });

  it('rejects tampered tokens', async () => {
    const issued = await service.issue({
      workplaceId: 1,
      kioskId: 1,
      action: 'CHECK_IN',
    });
    const [header, body, sig] = issued.token.split('.');
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    decoded.act = 'CHECK_OUT';
    const tamperedBody = Buffer.from(JSON.stringify(decoded)).toString('base64url');
    const tampered = `${header}.${tamperedBody}.${sig}`;

    await expect(service.verify(tampered)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects tokens signed with a different secret', async () => {
    const foreign = await service['jwtService'].signAsync(
      {
        typ: 'ATTENDANCE_QR',
        wid: 1,
        kid: 1,
        act: 'CHECK_IN',
        nonce: 'n',
      },
      { secret: 'wrong-secret', expiresIn: 20 },
    );

    await expect(service.verify(foreign)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects non-attendance JWTs (e.g. API access tokens)', async () => {
    const apiToken = await service['jwtService'].signAsync(
      { sub: 1, username: 'x', role: 'SALES' },
      { secret: 'test-qr-secret', expiresIn: 20 },
    );

    await expect(service.verify(apiToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects expired tokens', async () => {
    const expired = await service['jwtService'].signAsync(
      {
        typ: 'ATTENDANCE_QR',
        wid: 1,
        kid: 1,
        act: 'CHECK_IN',
        nonce: 'n',
      },
      { secret: 'test-qr-secret', expiresIn: -1 },
    );

    await expect(service.verify(expired)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'QR_TOKEN_EXPIRED' }),
    });
  });
});
