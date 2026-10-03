import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request, ParseIntPipe, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role, StockReceiptStatus } from '@prisma/client';
import { StockReceiptsService } from './stock-receipts.service';
import { CreateStockReceiptDto } from './dto/create-stock-receipt.dto';
import { PriceReceiptDto } from './dto/price-receipt.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestWithUser } from '../common/types/request-with-user.interface';

@ApiTags('Stock Receipts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('stock-receipts')
export class StockReceiptsController {
  constructor(private stockReceiptsService: StockReceiptsService) {}

  @Post()
  @Roles(Role.INVENTORY)
  @ApiOperation({ summary: 'Receive shipment (Inventory only)' })
  async receiveShipment(@Request() req: RequestWithUser, @Body() createStockReceiptDto: CreateStockReceiptDto) {
    return this.stockReceiptsService.receiveShipment(req.user.sub, createStockReceiptDto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.INVENTORY)
  @ApiOperation({ summary: 'List stock receipts' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (status && !Object.values(StockReceiptStatus).includes(status as StockReceiptStatus)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Invalid status filter. Allowed: ${Object.values(StockReceiptStatus).join(', ')}`,
      });
    }
    return this.stockReceiptsService.findAll({
      from,
      to,
      employeeId: employeeId ? parseInt(employeeId, 10) : undefined,
      status: status as StockReceiptStatus | undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
    });
  }

  @Get('pending-pricing')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List receipts pending pricing (Admin only)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findPendingPricing(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.stockReceiptsService.findPendingPricing(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 25,
    );
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.INVENTORY)
  @ApiOperation({ summary: 'Get receipt by ID' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.stockReceiptsService.findOne(id);
  }

  @Patch(':id/price')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Price a receipt (Admin only)' })
  async priceReceipt(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: RequestWithUser,
    @Body() body: PriceReceiptDto,
  ) {
    return this.stockReceiptsService.priceReceipt(id, req.user.sub, body.prices);
  }
}
