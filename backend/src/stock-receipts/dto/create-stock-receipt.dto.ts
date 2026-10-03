import { IsNumber, IsArray, ArrayMinSize, ArrayMaxSize, IsString, MinLength, IsOptional, ValidateNested, Min, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class SerializedItemDto {
  @ApiProperty({ example: '629000001' })
  @IsString()
  @MinLength(1)
  barcode: string;
}

class NonSerializedItemDto {
  @ApiProperty({ example: 10.5, description: 'Whole number for piece-counted products, up to 2 decimals for meter-counted products' })
  @IsNumber()
  @Min(0.01)
  quantity: number;
}

export class CreateStockReceiptDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  categoryId: number;

  @ApiProperty({ example: 11 })
  @IsNumber()
  productModelId: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  supplierId?: number;

  @ApiPropertyOptional({ example: 'Quick Supplier Name' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  newSupplierName?: string;

  @ApiPropertyOptional({
    example: ['629000001', '629000002'],
    description: 'Barcodes for serialized items. Required when product model is serialized.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  barcodes?: string[];

  @ApiPropertyOptional({
    example: { quantity: 50 },
    description: 'Quantity for non-serialized items. Required when product model is not serialized.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NonSerializedItemDto)
  nonSerialized?: NonSerializedItemDto;
}
