import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { QrTokenService } from './qr-token.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('ATTENDANCE_QR_SECRET') || config.get<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('ATTENDANCE_QR_TTL', '20s'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService, QrTokenService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
