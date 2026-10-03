import { Controller, Get, Param, Query, UseGuards, ParseIntPipe, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestWithUser } from '../common/types/request-with-user.interface';

@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get('invoices/:invoiceId')
  @Roles(Role.ADMIN, Role.ACCOUNTANT, Role.SALES, Role.INVENTORY)
  @ApiOperation({ summary: 'Get invoice audit log (admin)' })
  async getInvoiceAuditLog(
      @Param('invoiceId', ParseIntPipe) invoiceId: number,
      @Request() req: RequestWithUser,
    ) {
    return this.auditService.getInvoiceAuditLog(invoiceId, req.user);
  }

  @Get('system')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'System-wide audit log (admin)' })
  async findAll(
    @Query('employeeId') employeeId?: number,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.auditService.findAll({
      employeeId: employeeId ? Number(employeeId) : undefined,
      action,
      startDate,
      endDate,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
  }
}
