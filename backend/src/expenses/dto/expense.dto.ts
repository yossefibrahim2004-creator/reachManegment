import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateExpenseDto {
  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  categoryId: number;

  @ApiProperty({ example: 250.5, minimum: 0.01 })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ example: '2026-09-23' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiProperty({ example: 'Office supplies' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description: string;
}

export class UpdateExpenseDto {
  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  categoryId?: number;

  @ApiPropertyOptional({ example: 250.5, minimum: 0.01 })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional({ example: '2026-09-23' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ example: 'Office supplies' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
