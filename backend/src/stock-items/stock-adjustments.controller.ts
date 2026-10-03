  import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, Query, Request, UseGuards } from '@nestjs/common';
  import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
  import { AdjustmentReviewStatus, Role } from '@prisma/client';
  import { StockItemsService } from './stock-items.service';
  import { CreateStockAdjustmentDto } from './dto/create-stock-adjustment.dto';
  import { RejectStockAdjustmentDto } from './dto/reject-stock-adjustment.dto';
  import { JwtAuthGuard } from '../auth/jwt-auth.guard';
  import { RolesGuard } from '../auth/roles.guard';
  import { Roles } from '../auth/roles.decorator';
  import { RequestWithUser } from '../common/types/request-with-user.interface';

  const ADJUSTMENT_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

  @ApiTags('Stock Adjustments')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Controller('stock-adjustments')
  export class StockAdjustmentsController {
    constructor(private stockItemsService: StockItemsService) {}

    @Get()
    @Roles(Role.INVENTORY, Role.ADMIN)
    @ApiOperation({ summary: 'List stock adjustments' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    @ApiQuery({ name: 'productModelId', required: false })
    @ApiQuery({ name: 'status', required: false, enum: AdjustmentReviewStatus })
    async findAll(
      @Query('page') page?: string,
      @Query('limit') limit?: string,
      @Query('productModelId') productModelId?: string,
      @Query('status') status?: string,
    ) {
      if (status && !ADJUSTMENT_STATUSES.includes(status)) {
        throw new BadRequestException({ code: 'INVALID_STATUS', message: 'Invalid adjustment status' });
      }

      return this.stockItemsService.findAllAdjustments({
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
        productModelId: productModelId ? parseInt(productModelId, 10) : undefined,
        status: status as AdjustmentReviewStatus | undefined,
      });
    }

    @Post()
    @Roles(Role.INVENTORY, Role.ADMIN)
    @ApiOperation({ summary: 'Submit stock adjustment for review (Inventory/Admin)' })
    async create(
      @Request() req: RequestWithUser,
      @Body() body: CreateStockAdjustmentDto,
    ) {
      return this.stockItemsService.createAdjustment(req.user.sub, body);
    }

    @Post(':id/approve')
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Approve stock adjustment (Admin)' })
    async approve(@Param('id', ParseIntPipe) id: number, @Request() req: RequestWithUser) {
      return this.stockItemsService.approveAdjustment(id, req.user.sub);
    }

    @Post(':id/reject')
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Reject stock adjustment (Admin)' })
    async reject(
      @Param('id', ParseIntPipe) id: number,
      @Request() req: RequestWithUser,
      @Body() body: RejectStockAdjustmentDto,
    ) {
      return this.stockItemsService.rejectAdjustment(id, req.user.sub, body.reason.trim());
    }
  }
