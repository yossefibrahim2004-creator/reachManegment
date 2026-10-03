import { Controller, Get, Patch, Post, Param, Query, UseGuards, Request, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ProductUnitsService } from './product-units.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestWithUser } from '../common/types/request-with-user.interface';

@ApiTags('Product Units')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('product-units')
export class ProductUnitsController {
  constructor(private productUnitsService: ProductUnitsService) {}

  @Get('inventory-count')
  @Roles(Role.ADMIN, Role.INVENTORY)
  @ApiOperation({ summary: 'Get inventory counts by model' })
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
    return this.productUnitsService.getInventoryCount({
      categoryId: categoryId ? parseInt(categoryId, 10) : undefined,
      productModelId: productModelId ? parseInt(productModelId, 10) : undefined,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
    });
  }

  @Get('barcode/:barcode')
  @Roles(Role.ADMIN, Role.SALES, Role.INVENTORY)
  @ApiOperation({ summary: 'Lookup unit by barcode' })
  async findByBarcode(@Param('barcode') barcode: string) {
    return this.productUnitsService.findByBarcode(barcode);
  }

  @Get('barcode/:barcode/audit-log')
  @Roles(Role.ADMIN, Role.SALES, Role.INVENTORY)
  @ApiOperation({ summary: 'Get unit audit log by barcode' })
  async getAuditLog(@Param('barcode') barcode: string) {
    return this.productUnitsService.getAuditLog(barcode);
  }

  @Get(':id/audit')
  @Roles(Role.ADMIN, Role.SALES, Role.INVENTORY)
  @ApiOperation({ summary: 'Get unit audit log by ID (compatibility alias)' })
  async getAuditLogById(@Param('id', ParseIntPipe) id: number) {
    const unit = await this.productUnitsService.findById(id);
    return this.productUnitsService.getAuditLog(unit.barcode);
  }

  @Patch(':id/mark-damaged')
  @Post(':id/mark-damaged')
  @Roles(Role.INVENTORY)
  @ApiOperation({ summary: 'Mark unit as damaged (Inventory only)' })
  async markDamaged(@Param('id', ParseIntPipe) id: number, @Request() req: RequestWithUser) {
    return this.productUnitsService.markDamaged(id, req.user.sub);
  }

  @Patch(':id/restore-available')
  @Post(':id/restore-available')
  @Roles(Role.INVENTORY)
  @ApiOperation({ summary: 'Restore damaged unit to available (Inventory only)' })
  async restoreAvailable(@Param('id', ParseIntPipe) id: number, @Request() req: RequestWithUser) {
    return this.productUnitsService.restoreAvailable(id, req.user.sub);
  }
}
