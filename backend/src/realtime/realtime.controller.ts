import {
  Controller,
  Get,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEvent, RealtimeService } from './realtime.service';

@Controller('realtime')
export class RealtimeController {
  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  @Get('events')
  async events(@Req() request: Request, @Res() response: Response): Promise<void> {
    const user = await this.authenticate(request);

    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    const write = (event: RealtimeEvent) => {
      if (
        (event.roles && !event.roles.includes(user.role)) &&
        (event.employeeIds && !event.employeeIds.includes(user.id))
      ) {
        return;
      }
      if (!event.roles && !event.employeeIds) {
        return;
      }
      response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };

    response.write(`event: ready\ndata: ${JSON.stringify({ userId: user.id })}\n\n`);
    const unsubscribe = this.realtimeService.subscribe(write);
    const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 20000);

    request.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }

  private async authenticate(request: Request): Promise<{ id: number; role: Role }> {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    let payload: { sub?: number };
    try {
      payload = await this.jwtService.verifyAsync(header.slice('Bearer '.length), {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: Number(payload.sub) },
      select: { id: true, role: true, isActive: true, deletedAt: true },
    });
    if (!employee || !employee.isActive || employee.deletedAt) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    return { id: employee.id, role: employee.role };
  }
}
