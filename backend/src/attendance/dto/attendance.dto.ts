import {
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceQrAction } from '../qr-token.service';

export class IssueKioskQrDto {
  @ApiProperty({ enum: ['CHECK_IN', 'CHECK_OUT'], example: 'CHECK_IN' })
  @IsEnum(['CHECK_IN', 'CHECK_OUT'] as const)
  action: AttendanceQrAction;
}

export class ScanAttendanceDto {
  @ApiProperty({
    description: 'Signed attendance QR token displayed by the workplace kiosk',
  })
  @IsString()
  @MinLength(20)
  token: string;
}

export class CorrectAttendanceDto {
  @ApiProperty({ description: 'Mandatory audit reason for the correction' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({ description: 'New check-in time (ISO string)' })
  @IsOptional()
  @IsString()
  checkIn?: string;

  @ApiPropertyOptional({ description: 'New check-out time (ISO string); empty string clears checkout' })
  @IsOptional()
  @IsString()
  checkOut?: string;
}
