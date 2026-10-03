import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QrTokenService, AttendanceQrAction } from './qr-token.service';
import { AppErrorCode } from '../common/errors/error-codes';
import { ERROR_MESSAGES } from '../common/errors/error-messages';

const EMPLOYEE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SALES', 'INVENTORY'] as const;

interface ScanRateBucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);
  private readonly scanBuckets = new Map<string, ScanRateBucket>();

  constructor(
    private prisma: PrismaService,
    private qrTokenService: QrTokenService,
    private configService: ConfigService,
  ) {}

  private get scanRateLimit(): number {
    return Number(this.configService.get<string>('ATTENDANCE_SCAN_RATE_LIMIT', '12'));
  }

  private get scanRateWindowMs(): number {
    return Number(this.configService.get<string>('ATTENDANCE_SCAN_RATE_WINDOW_MS', '60000'));
  }

  private assertEmployeeRole(role: string): void {
    if (!(EMPLOYEE_ROLES as readonly string[]).includes(role)) {
      throw new ForbiddenException({
        code: AppErrorCode.FORBIDDEN_ROLE,
        message: ERROR_MESSAGES[AppErrorCode.FORBIDDEN_ROLE],
      });
    }
  }

  private enforceScanRateLimit(employeeId: number): void {
    const key = String(employeeId);
    const now = Date.now();
    const bucket = this.scanBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.scanBuckets.set(key, { count: 1, resetAt: now + this.scanRateWindowMs });
      return;
    }

    bucket.count += 1;
    if (bucket.count > this.scanRateLimit) {
      throw new BadRequestException({
        code: AppErrorCode.RATE_LIMITED,
        message: ERROR_MESSAGES[AppErrorCode.RATE_LIMITED],
      });
    }
  }

  private async getTimezone(): Promise<string> {
    const settings = await this.prisma.appSetting.findUnique({ where: { id: 1 } });
    return settings?.timezone || 'Africa/Cairo';
  }

  private getTimeZoneOffsetMs(date: Date, timeZone: string): number {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const map: Record<string, string> = {};
    for (const part of parts) {
      map[part.type] = part.value;
    }
    const hour = map.hour === '24' ? '00' : map.hour;
    const asUtc = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(hour),
      Number(map.minute),
      Number(map.second),
    );
    return asUtc - date.getTime();
  }

  private startOfDayInTimezone(now: Date, timeZone: string): Date {
    const offset = this.getTimeZoneOffsetMs(now, timeZone);
    const local = new Date(now.getTime() + offset);
    const dayStartUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
    return new Date(dayStartUtc - offset);
  }

  private endOfDayInTimezone(now: Date, timeZone: string): Date {
    const start = this.startOfDayInTimezone(now, timeZone);
    return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  }

  async issueKioskQr(kioskId: number, action: AttendanceQrAction) {
    const kiosk = await this.prisma.employee.findFirst({
      where: {
        id: kioskId,
        role: 'ATTENDANCE_KIOSK',
        isActive: true,
        deletedAt: null,
      },
      include: {
        workplace: {
          select: { id: true, name: true, isActive: true },
        },
      },
    });

    if (!kiosk || !kiosk.workplace || !kiosk.workplace.isActive) {
      throw new ForbiddenException({
        code: AppErrorCode.KIOSK_NOT_CONFIGURED,
        message: ERROR_MESSAGES[AppErrorCode.KIOSK_NOT_CONFIGURED],
      });
    }

    const issued = await this.qrTokenService.issue({
      workplaceId: kiosk.workplace.id,
      kioskId: kiosk.id,
      action,
    });

    return {
      token: issued.token,
      action,
      expiresAt: issued.expiresAt.toISOString(),
      ttlSeconds: issued.ttlSeconds,
      workplace: {
        id: kiosk.workplace.id,
        name: kiosk.workplace.name,
      },
      kiosk: {
        id: kiosk.id,
        name: kiosk.name,
      },
    };
  }

  async getKioskContext(kioskId: number) {
    const kiosk = await this.prisma.employee.findFirst({
      where: {
        id: kioskId,
        role: 'ATTENDANCE_KIOSK',
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        workplace: {
          select: { id: true, name: true },
        },
      },
    });

    if (!kiosk || !kiosk.workplace) {
      throw new ForbiddenException({
        code: AppErrorCode.KIOSK_NOT_CONFIGURED,
        message: ERROR_MESSAGES[AppErrorCode.KIOSK_NOT_CONFIGURED],
      });
    }

    return kiosk;
  }

  async scan(params: {
    employeeId: number;
    employeeRole: string;
    token: string;
  }) {
    this.assertEmployeeRole(params.employeeRole);
    this.enforceScanRateLimit(params.employeeId);

    const payload = await this.qrTokenService.verify(params.token);

    const workplace = await this.prisma.workplace.findFirst({
      where: { id: payload.wid, deletedAt: null, isActive: true },
    });
    if (!workplace) {
      throw new UnauthorizedException({
        code: AppErrorCode.QR_WORKPLACE_MISMATCH,
        message: ERROR_MESSAGES[AppErrorCode.QR_WORKPLACE_MISMATCH],
      });
    }

    const kiosk = await this.prisma.employee.findFirst({
      where: {
        id: payload.kid,
        role: 'ATTENDANCE_KIOSK',
        isActive: true,
        deletedAt: null,
        workplaceId: workplace.id,
      },
      select: { id: true },
    });
    if (!kiosk) {
      throw new UnauthorizedException({
        code: AppErrorCode.QR_TOKEN_INVALID,
        message: ERROR_MESSAGES[AppErrorCode.QR_TOKEN_INVALID],
      });
    }

    if (payload.act === 'CHECK_IN') {
      return this.checkIn(params.employeeId, workplace.id, kiosk.id);
    }
    return this.checkOut(params.employeeId, workplace.id, kiosk.id);
  }

  private async checkIn(
    employeeId: number,
    workplaceId: number,
    kioskId: number,
  ) {
    const now = new Date();
    const timezone = await this.getTimezone();
    const dayStart = this.startOfDayInTimezone(now, timezone);
    const dayEnd = this.endOfDayInTimezone(now, timezone);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const open = await tx.attendance.findFirst({
          where: { employeeId, checkOut: null },
        });
        if (open) {
          throw new BadRequestException({
            code: AppErrorCode.ALREADY_CHECKED_IN,
            message: ERROR_MESSAGES[AppErrorCode.ALREADY_CHECKED_IN],
          });
        }

        const todayClosed = await tx.attendance.findFirst({
          where: {
            employeeId,
            date: { gte: dayStart, lte: dayEnd },
            checkOut: { not: null },
          },
        });
        if (todayClosed) {
          throw new BadRequestException({
            code: AppErrorCode.ALREADY_CHECKED_IN,
            message: 'You have already completed attendance for today.',
          });
        }

        return tx.attendance.create({
          data: {
            employeeId,
            workplaceId,
            kioskId,
            status: 'PRESENT',
            checkIn: now,
            date: now,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException({
          code: AppErrorCode.ALREADY_CHECKED_IN,
          message: ERROR_MESSAGES[AppErrorCode.ALREADY_CHECKED_IN],
        });
      }
      throw error;
    }
  }

  private async checkOut(
    employeeId: number,
    workplaceId: number,
    kioskId: number,
  ) {
    const now = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const open = await tx.attendance.findFirst({
          where: { employeeId, checkOut: null },
          orderBy: { checkIn: 'desc' },
        });

        if (!open) {
          throw new BadRequestException({
            code: AppErrorCode.NOT_CHECKED_IN,
            message: ERROR_MESSAGES[AppErrorCode.NOT_CHECKED_IN],
          });
        }

        return tx.attendance.update({
          where: { id: open.id },
          data: {
            checkOut: now,
            workplaceId: open.workplaceId ?? workplaceId,
            kioskId,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException({
          code: AppErrorCode.ALREADY_CHECKED_IN,
          message: ERROR_MESSAGES[AppErrorCode.ALREADY_CHECKED_IN],
        });
      }
      throw error;
    }
  }

  async getMyTodayAttendance(employeeId: number) {
    const timezone = await this.getTimezone();
    const now = new Date();
    const dayStart = this.startOfDayInTimezone(now, timezone);
    const dayEnd = this.endOfDayInTimezone(now, timezone);

    const open = await this.prisma.attendance.findFirst({
      where: { employeeId, checkOut: null },
      orderBy: { checkIn: 'desc' },
      include: {
        workplace: { select: { id: true, name: true } },
      },
    });
    if (open) {
      return open;
    }

    const record = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        date: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { checkIn: 'desc' },
      include: {
        workplace: { select: { id: true, name: true } },
      },
    });

    return record || null;
  }

  private async resolveDayRange(startDate?: string, endDate?: string): Promise<{
    start?: Date;
    end?: Date;
  }> {
    if (!startDate && !endDate) {
      return {};
    }

    const timezone = await this.getTimezone();
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    if (start && Number.isNaN(start.getTime())) {
      throw new BadRequestException({
        code: AppErrorCode.VALIDATION_ERROR,
        message: ERROR_MESSAGES[AppErrorCode.VALIDATION_ERROR],
      });
    }
    if (end && Number.isNaN(end.getTime())) {
      throw new BadRequestException({
        code: AppErrorCode.VALIDATION_ERROR,
        message: ERROR_MESSAGES[AppErrorCode.VALIDATION_ERROR],
      });
    }

    // Date-only bounds become UTC midnight and can miss the local day in the app
    // timezone (e.g. Africa/Cairo starts at 21:00Z the previous day) — expand
    // start to start-of-day and end to end-of-day in the app timezone.
    const startIsDateOnly =
      start !== undefined && startDate !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(startDate.trim());
    const endIsDateOnly =
      end !== undefined && endDate !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim());

    return {
      start: start ? (startIsDateOnly ? this.startOfDayInTimezone(start, timezone) : start) : undefined,
      end: end ? (endIsDateOnly ? this.endOfDayInTimezone(end, timezone) : end) : undefined,
    };
  }

  async findAll(params: {
    employeeId?: number;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const { employeeId, startDate, endDate, page = 1, limit = 25 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.AttendanceWhereInput = {};
    if (employeeId) {
      where.employeeId = employeeId;
    }
    if (startDate || endDate) {
      const range = await this.resolveDayRange(startDate, endDate);
      where.date = {};
      if (range.start) where.date.gte = range.start;
      if (range.end) where.date.lte = range.end;
    }

    const [data, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        include: {
          employee: { select: { id: true, name: true, role: true } },
          workplace: { select: { id: true, name: true } },
          kiosk: { select: { id: true, name: true } },
        },
        skip,
        take: limit,
        orderBy: { date: 'desc' },
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getEmployeeStats(employeeId: number, startDate: string, endDate: string) {
    const range = await this.resolveDayRange(startDate, endDate);

    const records = await this.prisma.attendance.findMany({
      where: {
        employeeId,
        date: {
          gte: range.start,
          lte: range.end,
        },
      },
      orderBy: { date: 'asc' },
    });

    const totalDays = records.length;
    const daysPresent = records.filter((r) => r.checkOut !== null).length;
    const totalHours = records.reduce((sum, r) => {
      if (r.checkOut) {
        const hours =
          (new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / (1000 * 60 * 60);
        return sum + hours;
      }
      return sum;
    }, 0);

    return {
      employeeId,
      startDate,
      endDate,
      totalDays,
      daysPresent,
      daysAbsent: totalDays - daysPresent,
      totalHours: Math.round(totalHours * 100) / 100,
    };
  }

  async correctAttendance(
    adminId: number,
    attendanceId: number,
    dto: { reason: string; checkIn?: string; checkOut?: string },
  ) {
    const existing = await this.prisma.attendance.findUnique({
      where: { id: attendanceId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: AppErrorCode.NOT_FOUND,
        message: ERROR_MESSAGES[AppErrorCode.NOT_FOUND],
      });
    }

    if (!dto.reason || dto.reason.trim().length < 5) {
      throw new BadRequestException({
        code: AppErrorCode.VALIDATION_ERROR,
        message: ERROR_MESSAGES[AppErrorCode.VALIDATION_ERROR],
      });
    }

    const before = {
      checkIn: existing.checkIn.toISOString(),
      checkOut: existing.checkOut?.toISOString() ?? null,
    };

    let checkIn: Date | undefined;
    let checkOut: Date | undefined | null;

    if (dto.checkIn !== undefined) {
      const parsed = new Date(dto.checkIn);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException({
          code: AppErrorCode.VALIDATION_ERROR,
          message: ERROR_MESSAGES[AppErrorCode.VALIDATION_ERROR],
        });
      }
      checkIn = parsed;
    }

    if (dto.checkOut !== undefined) {
      if (dto.checkOut === '' || dto.checkOut === null) {
        checkOut = null;
      } else {
        const parsed = new Date(dto.checkOut);
        if (Number.isNaN(parsed.getTime())) {
          throw new BadRequestException({
            code: AppErrorCode.VALIDATION_ERROR,
            message: ERROR_MESSAGES[AppErrorCode.VALIDATION_ERROR],
          });
        }
        checkOut = parsed;
      }
    }

    const finalCheckIn = checkIn ?? existing.checkIn;
    const finalCheckOut = checkOut === undefined ? existing.checkOut : checkOut;
    if (finalCheckOut instanceof Date && finalCheckOut.getTime() < finalCheckIn.getTime()) {
      throw new BadRequestException({
        code: AppErrorCode.VALIDATION_ERROR,
        message: 'Check-out must be after check-in.',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.attendance.update({
        where: { id: attendanceId },
        data: {
          ...(checkIn !== undefined && { checkIn }),
          ...(checkOut !== undefined && { checkOut }),
        },
      });

      await tx.systemAuditLog.create({
        data: {
          employeeId: adminId,
          action: 'ATTENDANCE_CORRECTED',
          entityType: 'Attendance',
          entityId: String(attendanceId),
          metadata: {
            reason: dto.reason,
            before,
            after: {
              checkIn: result.checkIn.toISOString(),
              checkOut: result.checkOut?.toISOString() ?? null,
            },
          },
        },
      });

      return result;
    });

    this.logger.log(`Attendance #${attendanceId} corrected by employee #${adminId}`);
    return updated;
  }
}
