import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectStockAdjustmentDto {
  @ApiProperty({ example: 'Quantity does not match the physical count' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
