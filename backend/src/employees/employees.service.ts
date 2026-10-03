import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  async findByUsername(username: string) {
    return this.prisma.employee.findUnique({
      where: { username },
    });
  }

  async findById(id: number) {
    return this.prisma.employee.findUnique({
      where: { id },
    });
  }

  async findAll(params: {
    search?: string;
    role?: Role;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { search, role, isActive, page = 1, limit = 25 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.EmployeeWhereInput = {
      deletedAt: null,
      ...(role && { role }),
      ...(isActive !== undefined && { isActive }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { username: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
          isActive: true,
          workplaceId: true,
          workplace: { select: { id: true, name: true } },
          createdAt: true,
          updatedAt: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.employee.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async create(data: {
    name: string;
    username: string;
    password: string;
    role: Role;
    workplaceId?: number;
  }) {
    const existing = await this.prisma.employee.findUnique({
      where: { username: data.username },
    });

    if (existing) {
      throw new ConflictException({ code: 'USERNAME_DUPLICATE', message: 'Username already exists' });
    }

    if (data.role === Role.ATTENDANCE_KIOSK && !data.workplaceId) {
      throw new ConflictException({
        code: 'KIOSK_WORKPLACE_REQUIRED',
        message: 'Attendance kiosk accounts must be assigned to a workplace',
      });
    }

    const passwordHash = await argon2.hash(data.password);

    return this.prisma.employee.create({
      data: {
        name: data.name,
        username: data.username,
        passwordHash,
        role: data.role,
        workplaceId: data.workplaceId ?? null,
      },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        isActive: true,
        workplaceId: true,
        createdAt: true,
      },
    });
  }

  async update(
    id: number,
    data: { name?: string; username?: string; role?: Role; isActive?: boolean; workplaceId?: number },
  ) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee || employee.deletedAt) {
      throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' });
    }

    if (data.username !== undefined && data.username !== employee.username) {
      const existing = await this.prisma.employee.findUnique({
        where: { username: data.username },
      });
      if (existing) {
        throw new ConflictException({ code: 'USERNAME_DUPLICATE', message: 'Username already exists' });
      }
    }

    const nextRole = data.role ?? employee.role;
    const nextWorkplaceId =
      data.workplaceId !== undefined ? data.workplaceId : employee.workplaceId;
    if (nextRole === Role.ATTENDANCE_KIOSK && !nextWorkplaceId) {
      throw new ConflictException({
        code: 'KIOSK_WORKPLACE_REQUIRED',
        message: 'Attendance kiosk accounts must be assigned to a workplace',
      });
    }

    return this.prisma.employee.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        isActive: true,
        workplaceId: true,
        workplace: { select: { id: true, name: true } },
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deactivate(id: number) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee || employee.deletedAt) {
      throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' });
    }

    // Soft delete + revoke refresh tokens immediately
    return this.prisma.employee.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
        refreshToken: null,
      },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        isActive: true,
      },
    });
  }

  async resetPassword(id: number, newPassword: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee || employee.deletedAt) {
      throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' });
    }

    const passwordHash = await argon2.hash(newPassword);

    return this.prisma.employee.update({
      where: { id },
      data: {
        passwordHash,
        refreshToken: null, // Revoke all refresh tokens
      },
      select: {
        id: true,
        name: true,
        username: true,
      },
    });
  }

  async updateRefreshToken(employeeId: number, refreshToken: string | null) {
    const hashedToken = refreshToken ? await argon2.hash(refreshToken) : null;
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { refreshToken: hashedToken },
    });
  }

  async updatePasswordHash(employeeId: number, passwordHash: string) {
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { passwordHash },
    });
  }
}
