import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PriceReceiptItemDto {
  @ApiPropertyOptional({ example: 42 })
  @IsOptional()
  @IsInt()
  @Min(1)
  productUnitId?: number;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  stockLotId?: number;

  @ApiProperty({ example: 320.5, minimum: 0 })
  @IsNumber()
  @Min(0)
  purchasePrice: number;
}

export class PriceReceiptDto {
  @ApiProperty({
    type: [PriceReceiptItemDto],
    example: [{ productUnitId: 42, purchasePrice: 320.5 }],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10000)
  @ValidateNested({ each: true })
  @Type(() => PriceReceiptItemDto)
  prices: PriceReceiptItemDto[];
}
