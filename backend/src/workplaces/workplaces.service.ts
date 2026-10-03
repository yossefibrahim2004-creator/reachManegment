import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkplaceDto, UpdateWorkplaceDto } from './dto/workplace.dto';
import { AppErrorCode } from '../common/errors/error-codes';
import { ERROR_MESSAGES } from '../common/errors/error-messages';

@Injectable()
export class WorkplacesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.workplace.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        radiusMeters: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { employees: { where: { deletedAt: null } } } },
      },
    });
  }

  async findById(id: number) {
    const workplace = await this.prisma.workplace.findFirst({
      where: { id, deletedAt: null },
    });
    if (!workplace) {
      throw new NotFoundException({
        code: AppErrorCode.NOT_FOUND,
        message: ERROR_MESSAGES[AppErrorCode.NOT_FOUND],
      });
    }
    return workplace;
  }

  async create(dto: CreateWorkplaceDto) {
    const existing = await this.prisma.workplace.findFirst({
      where: { name: dto.name, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException({
        code: AppErrorCode.CONFLICT,
        message: ERROR_MESSAGES[AppErrorCode.CONFLICT],
      });
    }

    return this.prisma.workplace.create({
      data: {
        name: dto.name,
        latitude: dto.latitude,
        longitude: dto.longitude,
        radiusMeters: dto.radiusMeters ?? 100,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: number, dto: UpdateWorkplaceDto) {
    await this.findById(id);
    return this.prisma.workplace.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && { longitude: dto.longitude }),
        ...(dto.radiusMeters !== undefined && { radiusMeters: dto.radiusMeters }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(id: number) {
    const workplace = await this.findById(id);
    const assigned = await this.prisma.employee.count({
      where: { workplaceId: id, deletedAt: null, isActive: true },
    });
    if (assigned > 0) {
      throw new BadRequestException({
        code: AppErrorCode.CONFLICT,
        message: 'Reassign active employees/kiosks before deleting this workplace.',
      });
    }
    return this.prisma.workplace.update({
      where: { id: workplace.id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
