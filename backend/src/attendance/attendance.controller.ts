import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import { IssueKioskQrDto, ScanAttendanceDto, CorrectAttendanceDto } from './dto/attendance.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestWithUser } from '../common/types/request-with-user.interface';

const EMPLOYEE_ROLES = [Role.ADMIN, Role.ACCOUNTANT, Role.SALES, Role.INVENTORY];

@ApiTags('Attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private attendanceService: AttendanceService) {}

  @Post('kiosk/qr')
  @Roles(Role.ATTENDANCE_KIOSK)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Issue short-lived attendance QR token (kiosk only)' })
  async issueKioskQr(@Req() req: RequestWithUser, @Body() dto: IssueKioskQrDto) {
    return this.attendanceService.issueKioskQr(req.user.sub, dto.action);
  }

  @Get('kiosk/me')
  @Roles(Role.ATTENDANCE_KIOSK)
  @ApiOperation({ summary: 'Kiosk workplace context (kiosk only)' })
  async getKioskContext(@Req() req: RequestWithUser) {
    return this.attendanceService.getKioskContext(req.user.sub);
  }

  @Post('scan')
  @Roles(...EMPLOYEE_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record attendance by scanning a kiosk QR token' })
  async scan(@Req() req: RequestWithUser, @Body() dto: ScanAttendanceDto) {
    return this.attendanceService.scan({
      employeeId: req.user.sub,
      employeeRole: req.user.role,
      token: dto.token,
    });
  }

  @Get('me/today')
  @Roles(...EMPLOYEE_ROLES)
  @ApiOperation({ summary: "Get current employee's attendance state" })
  async getMyTodayAttendance(@Req() req: RequestWithUser) {
    return this.attendanceService.getMyTodayAttendance(req.user.sub);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List all attendance records (admin)' })
  async findAll(
    @Query('employeeId') employeeId?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.attendanceService.findAll({
      employeeId: employeeId ? Number(employeeId) : undefined,
      startDate,
      endDate,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 25,
    });
  }

  @Get('stats/:employeeId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get employee attendance stats' })
  async getEmployeeStats(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.attendanceService.getEmployeeStats(employeeId, startDate, endDate);
  }

  @Patch(':id/correct')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin correction with mandatory reason (audited)' })
  async correctAttendance(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CorrectAttendanceDto,
  ) {
    return this.attendanceService.correctAttendance(req.user.sub, id, dto);
  }
}
