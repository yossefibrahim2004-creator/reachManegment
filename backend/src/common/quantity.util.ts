import { BadRequestException } from '@nestjs/common';
import { UnitOfMeasure } from '@prisma/client';

export const QUANTITY_DECIMAL_PLACES = 2;

export const roundQuantity = (value: number): number => {
  const factor = 10 ** QUANTITY_DECIMAL_PLACES;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export function normalizeQuantity(quantity: number, unit: UnitOfMeasure = UnitOfMeasure.PIECE): number {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new BadRequestException({
      code: 'INVALID_QUANTITY',
      message: 'Quantity must be a positive number.',
    });
  }

  if (unit === UnitOfMeasure.METER) {
    const rounded = roundQuantity(quantity);
    if (rounded <= 0) {
      throw new BadRequestException({
        code: 'INVALID_QUANTITY',
        message: 'Quantity must be a positive number.',
      });
    }
    return rounded;
  }

  if (!Number.isInteger(quantity)) {
    throw new BadRequestException({
      code: 'FRACTIONAL_QUANTITY_NOT_ALLOWED',
      message: 'This product is counted in pieces, so the quantity must be a whole number.',
    });
  }

  return quantity;
}
