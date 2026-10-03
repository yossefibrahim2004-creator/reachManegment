import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request, ParseIntPipe, BadRequestException, ForbiddenException, Headers } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ChangeRequestStatus, Role } from '@prisma/client';
import { InvoiceChangeRequestsService } from './invoice-change-requests.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestWithUser } from '../common/types/request-with-user.interface';
import {
  CreateInvoiceChangeRequestInput,
  ChangeRequestDecisionDto,
} from './dto/invoice-change-request.types';

@ApiTags('Invoice Change Requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class InvoiceChangeRequestsController {
  constructor(private invoiceChangeRequestsService: InvoiceChangeRequestsService) {}

  @Post('invoices/:id/change-requests')
  @Roles(Role.SALES, Role.INVENTORY)
  @ApiOperation({ summary: 'Create invoice change request' })
  async create(
    @Request() req: RequestWithUser,
    @Param('id', ParseIntPipe) invoiceId: number,
    @Body() body: CreateInvoiceChangeRequestInput,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    return this.invoiceChangeRequestsService.create(invoiceId, req.user.sub, body, idempotencyKey);
  }

  @Get('change-requests')
  @Roles(Role.ADMIN, Role.SALES, Role.INVENTORY)
  @ApiOperation({ summary: 'List change requests' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'scope', required: false, enum: ['mine', 'all'], description: 'mine = only own requests (default for non-admins), all = every request (admin only)' })
  async findAll(
    @Request() req: RequestWithUser,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('scope') scope?: string,
  ) {
    if (status && !Object.values(ChangeRequestStatus).includes(status as ChangeRequestStatus)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Invalid status filter. Allowed: ${Object.values(ChangeRequestStatus).join(', ')}`,
      });
    }
    if (scope !== undefined && scope !== 'mine' && scope !== 'all') {
      throw new BadRequestException({
        code: 'INVALID_SCOPE',
        message: "Invalid scope. Allowed: 'mine', 'all'",
      });
    }
    // Privilege is decided here, from the authenticated user — never from the caller.
    const resolvedScope: 'mine' | 'all' = scope === 'all' ? 'all' : scope === 'mine' ? 'mine' : req.user.role === Role.ADMIN ? 'all' : 'mine';
    if (resolvedScope === 'all' && req.user.role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: 'SCOPE_NOT_ALLOWED',
        message: "Only administrators may list all change requests; use scope='mine'",
      });
    }
    return this.invoiceChangeRequestsService.findAll({
      status: status ? (status as ChangeRequestStatus) : undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
      scope: resolvedScope,
      user: req.user,
    });
  }

  @Get('change-requests/:id')
  @Roles(Role.ADMIN, Role.SALES, Role.INVENTORY)
  @ApiOperation({ summary: 'Get change request details' })
  async findOne(@Param('id', ParseIntPipe) id: number, @Request() req: RequestWithUser) {
    return this.invoiceChangeRequestsService.findOne(id, req.user);
  }

  @Patch('change-requests/:id/approve')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Approve change request' })
  async approve(
    @Request() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body?: ChangeRequestDecisionDto,
  ) {
    return this.invoiceChangeRequestsService.approve(id, req.user.sub, body?.reason ?? body?.note);
  }

  @Patch('change-requests/:id/reject')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Reject change request' })
  async reject(
    @Request() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body?: ChangeRequestDecisionDto,
  ) {
    return this.invoiceChangeRequestsService.reject(id, req.user.sub, body?.reason ?? '');
  }
}
