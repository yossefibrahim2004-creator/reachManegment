import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestWithUser } from '../common/types/request-with-user.interface';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get()
  @Roles(Role.ADMIN, Role.ACCOUNTANT, Role.SALES, Role.INVENTORY)
  @ApiOperation({ summary: 'Dashboard summary' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getSummary(
    @Request() req: RequestWithUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.dashboardService.getSummary(from, to, req.user.sub);
  }

  @Get('activity')
  @Roles(Role.ADMIN, Role.ACCOUNTANT, Role.SALES, Role.INVENTORY)
  @ApiOperation({ summary: 'Recent activity' })
  async getRecentActivity() {
    return this.dashboardService.getRecentActivity();
  }
}
