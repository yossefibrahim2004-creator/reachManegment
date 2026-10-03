import { IsString, IsNotEmpty, MinLength, MaxLength, IsEnum, IsOptional, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class CreateEmployeeDto {
  @ApiProperty({ example: 'Ahmed Hassan' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'ahmed' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(50)
  username: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(128)
  password: string;

  @ApiProperty({ enum: Role, example: Role.SALES })
  @IsEnum(Role)
  role: Role;

  @ApiPropertyOptional({ description: 'Workplace assignment (required for ATTENDANCE_KIOSK)' })
  @IsOptional()
  @IsInt()
  workplaceId?: number;
}
