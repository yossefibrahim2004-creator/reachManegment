import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ScanBarcodeDto {
  @ApiProperty({ example: 'IP15-001' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  barcode: string;
}