import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const { user } = context.switchToHttp().getRequest();

    // Least privilege: kiosk accounts only reach endpoints that explicitly allow them.
    if (user?.role === Role.ATTENDANCE_KIOSK) {
      if (!requiredRoles || !requiredRoles.includes(Role.ATTENDANCE_KIOSK)) {
        throw new ForbiddenException({
          code: 'FORBIDDEN_ROLE',
          message: 'You do not have permission to perform this action',
        });
      }
      return true;
    }

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ROLE',
        message: 'You do not have permission to perform this action',
      });
    }

    return true;
  }
}
