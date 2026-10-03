import { IsNumber, IsArray, ArrayMinSize, ValidateNested, Min, Max, IsOptional, IsString, IsInt, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class InvoiceItemDto {
  @ApiProperty({ example: 11 })
  @IsInt()
  @Min(1)
  productModelId: number;

  @ApiProperty({ example: 5, description: 'Whole number for piece-counted products, up to 2 decimals for meter-counted products' })
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @ApiProperty({ example: 500.00 })
  @IsNumber()
  @Min(0)
  price: number;
}

export class CreateInvoiceDto {
  @ApiProperty({ example: 15 })
  @IsNumber()
  @Min(1)
  customerId: number;

  @ApiPropertyOptional({ example: 'CASH', enum: ['CASH', 'CARD', 'TRANSFER', 'CREDIT'] })
  @IsOptional()
  @IsString()
  @IsIn(['CASH', 'CARD', 'TRANSFER', 'CREDIT'])
  paymentType?: string;

  @ApiPropertyOptional({ example: 10, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercentage?: number;

  @ApiPropertyOptional({ example: 25, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @ApiProperty({
    description: 'Invoice items: productModelId + quantity + price (unified for both serialized and non-serialized)',
    example: [
      { productModelId: 11, quantity: 2, price: 500.00 },
      { productModelId: 12, quantity: 1, price: 12500.00 },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];
}
