import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: { sub: number; username: string; role: string }) {
    // Section 14.2.1: Verify isActive and role freshness on every request
    const employee = await this.prisma.employee.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, role: true, username: true, name: true },
    });

    if (!employee) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
    }

    if (!employee.isActive) {
      throw new ForbiddenException({ code: 'ACCOUNT_INACTIVE', message: 'Account is inactive' });
    }

    // Return the current DB role, not the token role (role freshness)
    return {
      sub: employee.id,
      username: employee.username,
      name: employee.name,
      role: employee.role,
    };
  }
}
