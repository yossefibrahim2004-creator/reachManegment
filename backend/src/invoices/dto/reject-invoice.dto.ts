import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectInvoiceDto {
  @ApiProperty({ example: 'Pricing does not match the agreement' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
