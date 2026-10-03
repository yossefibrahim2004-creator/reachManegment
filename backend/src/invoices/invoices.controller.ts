import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request, ParseIntPipe, BadRequestException, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { InvoiceStatus, Role } from '@prisma/client';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RejectInvoiceDto } from './dto/reject-invoice.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestWithUser } from '../common/types/request-with-user.interface';

@ApiTags('Invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private invoicesService: InvoicesService) {}

  @Post()
  @Roles(Role.ADMIN, Role.SALES)
  @ApiOperation({ summary: 'Create invoice (Sales/Admin) — reserves stock' })
  async create(
    @Request() req: RequestWithUser,
    @Body() createInvoiceDto: CreateInvoiceDto,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    return this.invoicesService.createInvoice(req.user.sub, createInvoiceDto, idempotencyKey);
  }

  @Get()
  @Roles(Role.ADMIN, Role.ACCOUNTANT, Role.SALES, Role.INVENTORY)
  @ApiOperation({ summary: 'Search invoices by number or unit barcode' })
  @ApiQuery({ name: 'search', required: false, description: 'Invoice number or unit barcode' })
  @ApiQuery({ name: 'number', required: false })
  @ApiQuery({ name: 'barcode', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(
    @Request() req: RequestWithUser,
    @Query('search') search?: string,
    @Query('number') number?: string,
    @Query('barcode') barcode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('customerId') customerId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (status && !Object.values(InvoiceStatus).includes(status as InvoiceStatus)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Invalid status filter. Allowed: ${Object.values(InvoiceStatus).join(', ')}`,
      });
    }
    return this.invoicesService.findAll({
      search,
      number,
      barcode,
      from,
      to,
      dateFrom,
      dateTo,
      customerId: customerId ? parseInt(customerId, 10) : undefined,
      employeeId: employeeId ? parseInt(employeeId, 10) : undefined,
      requester: req.user,
      status: status as InvoiceStatus | undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
    });
  }

  @Get('pending-review')
  @Roles(Role.ACCOUNTANT, Role.ADMIN)
  @ApiOperation({ summary: 'Invoices pending accountant review' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findPendingReview(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.invoicesService.findPendingReview({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
    });
  }

  @Get('delivery-queue')
  @Roles(Role.INVENTORY, Role.ADMIN)
  @ApiOperation({ summary: 'Invoices awaiting delivery' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findDeliveryQueue(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.invoicesService.findDeliveryQueue({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
    });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.ACCOUNTANT, Role.SALES, Role.INVENTORY)
  @ApiOperation({ summary: 'Get invoice by ID' })
  async findOne(@Param('id', ParseIntPipe) id: number, @Request() req: RequestWithUser) {
    return this.invoicesService.findOne(id, req.user);
  }

  @Get(':id/audit-log')
  @Roles(Role.ADMIN, Role.ACCOUNTANT, Role.SALES, Role.INVENTORY)
  @ApiOperation({ summary: 'Get invoice audit log' })
  async getAuditLog(@Param('id', ParseIntPipe) id: number, @Request() req: RequestWithUser) {
    return this.invoicesService.getAuditLog(id, req.user);
  }

  @Patch(':id/confirm')
  @Roles(Role.ACCOUNTANT, Role.ADMIN)
  @ApiOperation({ summary: 'Confirm invoice (Accountant/Admin) — deducts stock' })
  async confirm(
    @Request() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.invoicesService.confirmInvoice(id, req.user.sub);
  }

  @Patch(':id/reject')
  @Roles(Role.ACCOUNTANT, Role.ADMIN)
  @ApiOperation({ summary: 'Reject invoice (Accountant/Admin) — releases reservations' })
  async reject(
    @Request() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RejectInvoiceDto,
  ) {
    return this.invoicesService.rejectInvoice(id, req.user.sub, body.reason);
  }
}
