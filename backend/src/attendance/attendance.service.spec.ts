import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttendanceService } from './attendance.service';
import { QrTokenService } from './qr-token.service';
import { PrismaService } from '../prisma/prisma.service';

const workplace = {
  id: 1,
  name: 'Main Branch',
  isActive: true,
  deletedAt: null,
};

describe('AttendanceService', () => {
  let service: AttendanceService;
  let prisma: {
    workplace: { findFirst: jest.Mock };
    employee: { findFirst: jest.Mock };
    attendance: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
    };
    appSetting: { findUnique: jest.Mock };
    systemAuditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let qr: { verify: jest.Mock };

  beforeEach(async () => {
    prisma = {
      workplace: { findFirst: jest.fn().mockResolvedValue(workplace) },
      employee: { findFirst: jest.fn().mockResolvedValue({ id: 9, name: 'Kiosk' }) },
      attendance: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
      },
      appSetting: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Africa/Cairo' }) },
      systemAuditLog: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    qr = { verify: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: QrTokenService, useValue: qr },
        {
          provide: ConfigService,
          useValue: { get: (key: string, def?: string) => def },
        },
      ],
    }).compile();

    service = moduleRef.get(AttendanceService);
    // reset rate limit map between tests by recreating service state
    (service as unknown as { scanBuckets: Map<string, unknown> }).scanBuckets.clear();
  });

  it('rejects kiosk role from scanning', async () => {
    await expect(
      service.scan({
        employeeId: 1,
        employeeRole: 'ATTENDANCE_KIOSK',
        token: 'x',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects invalid QR tokens', async () => {
    qr.verify.mockRejectedValue(
      new UnauthorizedException({ code: 'QR_TOKEN_INVALID', message: 'invalid' }),
    );
    await expect(
      service.scan({ employeeId: 1, employeeRole: 'SALES', token: 'bad' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects expired QR tokens', async () => {
    qr.verify.mockRejectedValue(
      new UnauthorizedException({ code: 'QR_TOKEN_EXPIRED', message: 'expired' }),
    );
    await expect(
      service.scan({ employeeId: 1, employeeRole: 'SALES', token: 'old' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'QR_TOKEN_EXPIRED' }),
    });
  });

  it('rejects QR when workplace is inactive/missing', async () => {
    qr.verify.mockResolvedValue({ typ: 'ATTENDANCE_QR', wid: 99, kid: 9, act: 'CHECK_IN', nonce: 'n' });
    prisma.workplace.findFirst.mockResolvedValue(null);
    await expect(
      service.scan({ employeeId: 1, employeeRole: 'SALES', token: 't' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('creates check-in on valid scan', async () => {
    qr.verify.mockResolvedValue({ typ: 'ATTENDANCE_QR', wid: 1, kid: 9, act: 'CHECK_IN', nonce: 'n' });
    prisma.attendance.findFirst.mockResolvedValue(null);
    const created = { id: 10, employeeId: 1, checkOut: null };
    prisma.attendance.create.mockResolvedValue(created);

    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    );

    const result = await service.scan({
      employeeId: 1,
      employeeRole: 'SALES',
      token: 't',
    });

    expect(result).toEqual(created);
    expect(prisma.attendance.create).toHaveBeenCalled();
  });

  it('prevents duplicate open attendance (check-in when open exists)', async () => {
    qr.verify.mockResolvedValue({ typ: 'ATTENDANCE_QR', wid: 1, kid: 9, act: 'CHECK_IN', nonce: 'n' });
    prisma.attendance.findFirst
      .mockResolvedValueOnce({ id: 5, checkOut: null })
      .mockResolvedValue(null);

    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    );

    await expect(
      service.scan({ employeeId: 1, employeeRole: 'SALES', token: 't' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ALREADY_CHECKED_IN' }),
    });
  });

  it('rejects check-out when no open attendance', async () => {
    qr.verify.mockResolvedValue({ typ: 'ATTENDANCE_QR', wid: 1, kid: 9, act: 'CHECK_OUT', nonce: 'n' });
    prisma.attendance.findFirst.mockResolvedValue(null);

    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    );

    await expect(
      service.scan({ employeeId: 1, employeeRole: 'SALES', token: 't' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NOT_CHECKED_IN' }),
    });
  });

  it('rejects CHECK_OUT QR used when business state expects check-in path mismatch via action', async () => {
    // CHECK_OUT with open attendance succeeds; CHECK_IN action is only used for check-in
    qr.verify.mockResolvedValue({ typ: 'ATTENDANCE_QR', wid: 1, kid: 9, act: 'CHECK_OUT', nonce: 'n' });
    prisma.attendance.findFirst.mockResolvedValue({
      id: 3,
      employeeId: 1,
      checkOut: null,
      workplaceId: 1,
    });
    prisma.attendance.update.mockResolvedValue({ id: 3, checkOut: new Date() });
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    );

    const result = await service.scan({ employeeId: 1, employeeRole: 'SALES', token: 't' });
    expect(prisma.attendance.update).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ id: 3 }));
  });

  it('blocks repeated scans beyond rate limit', async () => {
    qr.verify.mockResolvedValue({ typ: 'ATTENDANCE_QR', wid: 1, kid: 9, act: 'CHECK_IN', nonce: 'n' });
    prisma.workplace.findFirst.mockResolvedValue(workplace);
    prisma.employee.findFirst.mockResolvedValue({ id: 9 });

    // force rate limit by filling the bucket via private method
    for (let i = 0; i < 12; i += 1) {
      (service as unknown as { enforceScanRateLimit: (id: number) => void }).enforceScanRateLimit(42);
    }
    expect(() =>
      (service as unknown as { enforceScanRateLimit: (id: number) => void }).enforceScanRateLimit(42),
    ).toThrow(BadRequestException);
  });

  it('requires reason on correction path validation (missing record)', async () => {
    prisma.attendance.findUnique.mockResolvedValue(null);
    await expect(
      service.correctAttendance(1, 999, { reason: 'forgot checkout' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NOT_FOUND' }),
    });
  });

  it('writes SystemAuditLog on successful correction', async () => {
    const existing = {
      id: 1,
      employeeId: 2,
      checkIn: new Date('2026-09-22T08:00:00Z'),
      checkOut: new Date('2026-09-22T16:00:00Z'),
    };
    prisma.attendance.findUnique.mockResolvedValue(existing);
    prisma.attendance.update.mockResolvedValue({
      ...existing,
      checkIn: new Date('2026-09-22T08:30:00Z'),
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    );

    await service.correctAttendance(1, 1, {
      reason: 'employee forgot badge, manager confirmed',
      checkIn: '2026-09-22T08:30:00Z',
    });

    expect(prisma.systemAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ATTENDANCE_CORRECTED',
          entityType: 'Attendance',
          entityId: '1',
        }),
      }),
    );
  });

  it('rejects a check-in correction after an existing check-out', async () => {
    prisma.attendance.findUnique.mockResolvedValue({
      id: 1,
      employeeId: 2,
      checkIn: new Date('2026-09-22T08:00:00Z'),
      checkOut: new Date('2026-09-22T16:00:00Z'),
    });

    await expect(
      service.correctAttendance(1, 1, {
        reason: 'invalid corrected time',
        checkIn: '2026-09-22T17:00:00Z',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    });
  });
});
