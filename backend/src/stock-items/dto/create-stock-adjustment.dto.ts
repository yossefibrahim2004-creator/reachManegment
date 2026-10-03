import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StockAdjustmentType } from '@prisma/client';

const ADJUSTMENT_DIRECTIONS = ['INCREASE', 'DECREASE'] as const;
export type AdjustmentDirection = (typeof ADJUSTMENT_DIRECTIONS)[number];

export class CreateStockAdjustmentDto {
  @ApiProperty({ example: 11 })
  @IsInt()
  @Min(1)
  productModelId: number;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  stockLotId?: number;

  @ApiProperty({ enum: StockAdjustmentType, example: StockAdjustmentType.DAMAGE })
  @IsEnum(StockAdjustmentType)
  type: StockAdjustmentType;

  // IMPORTANT: this is the *magnitude* only (how many units), never the
  // direction. For DAMAGE/LOSS the service always subtracts it; for FOUND
  // the service always adds it. The sign is decided server-side in
  // StockItemsService.resolveSignedQuantity — this DTO intentionally has
  // no way to express a negative number, so a client can no longer send
  // "DAMAGE" with a positive quantity and have it silently add stock.
  @ApiProperty({ example: 5, description: 'Positive quantity — the amount being adjusted, not signed. Whole number for pieces, up to 2 decimals for meters.' })
  @IsNumber()
  @Min(0.01)
  quantity: number;

  // Required only for ambiguous types (COUNT_CORRECTION, RECEIVING_CORRECTION,
  // OTHER), where the service can't infer direction from the type alone.
  // Ignored by the service for DAMAGE/LOSS/FOUND. Left optional at the DTO
  // level because the requirement is conditional on `type`; the service
  // throws DIRECTION_REQUIRED if it's missing when needed.
  @ApiPropertyOptional({ enum: ADJUSTMENT_DIRECTIONS, example: 'DECREASE' })
  @IsOptional()
  @IsIn(ADJUSTMENT_DIRECTIONS)
  direction?: AdjustmentDirection;

  @ApiProperty({ example: 'Broken units found during count' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}