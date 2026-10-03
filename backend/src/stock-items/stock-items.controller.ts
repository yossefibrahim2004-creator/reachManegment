import { Controller, Get, Post, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { StockItemsService } from './stock-items.service';
import { CreateStockAdjustmentDto } from './dto/create-stock-adjustment.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestWithUser } from '../common/types/request-with-user.interface';

@ApiTags('Stock Items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('stock-items')
export class StockItemsController {
  constructor(private stockItemsService: StockItemsService) {}

  @Get('inventory-count')
  @ApiOperation({ summary: 'Inventory count (all roles)' })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'productModelId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getInventoryCount(
    @Query('categoryId') categoryId?: string,
    @Query('productModelId') productModelId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.stockItemsService.getInventoryCount({
      categoryId: categoryId ? parseInt(categoryId, 10) : undefined,
      productModelId: productModelId ? parseInt(productModelId, 10) : undefined,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
    });
  }

  @Post('adjustments')
  @Roles(Role.INVENTORY)
  @ApiOperation({ summary: 'Create stock adjustment (Inventory only)' })
  async createAdjustment(
    @Request() req: RequestWithUser,
    @Body() body: CreateStockAdjustmentDto,
  ) {
    return this.stockItemsService.createAdjustment(req.user.sub, body);
  }
}
