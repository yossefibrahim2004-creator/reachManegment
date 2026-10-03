import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  employeeId?: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
