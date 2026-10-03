import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { Role } from '@prisma/client';

function createContext(user: unknown, roles: Role[] | undefined) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(roles),
  } as unknown as Reflector;

  const guard = new RolesGuard(reflector);
  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({ user }),
    }),
  } as unknown as ReturnType<Reflector['getAllAndOverride']> as never;

  return { guard, context: context as never };
}

describe('RolesGuard kiosk least-privilege', () => {
  it('denies kiosk on endpoints without explicit kiosk role', () => {
    const { guard, context } = createContext(
      { role: Role.ATTENDANCE_KIOSK },
      undefined,
    );
    expect(() => guard.canActivate(context as never)).toThrow(ForbiddenException);
  });

  it('denies kiosk on admin-only endpoints', () => {
    const { guard, context } = createContext(
      { role: Role.ATTENDANCE_KIOSK },
      [Role.ADMIN],
    );
    expect(() => guard.canActivate(context as never)).toThrow(ForbiddenException);
  });

  it('allows kiosk when explicitly permitted', () => {
    const { guard, context } = createContext(
      { role: Role.ATTENDANCE_KIOSK },
      [Role.ATTENDANCE_KIOSK],
    );
    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('still enforces classic roles for non-kiosk users', () => {
    const { guard, context } = createContext({ role: Role.SALES }, [Role.ADMIN]);
    expect(() => guard.canActivate(context as never)).toThrow(ForbiddenException);
  });

  it('allows non-kiosk when no roles required', () => {
    const { guard, context } = createContext({ role: Role.SALES }, undefined);
    expect(guard.canActivate(context as never)).toBe(true);
  });
});
