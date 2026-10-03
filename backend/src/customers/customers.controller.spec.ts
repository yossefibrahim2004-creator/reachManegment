import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { CustomersController } from './customers.controller';
import { Roles } from '../auth/roles.decorator';

describe('CustomersController', () => {
  it('allows admin to create, update and deactivate customers', () => {
    const controller = new CustomersController({} as any);
    const createMetadata = Reflect.getMetadata('roles', controller.create);
    const updateMetadata = Reflect.getMetadata('roles', controller.update);
    const deactivateMetadata = Reflect.getMetadata('roles', controller.deactivate);

    expect(createMetadata).toEqual(expect.arrayContaining([Role.SALES, Role.ADMIN]));
    expect(updateMetadata).toEqual(expect.arrayContaining([Role.SALES, Role.ADMIN]));
    expect(deactivateMetadata).toEqual(expect.arrayContaining([Role.SALES, Role.ADMIN]));
  });
});
