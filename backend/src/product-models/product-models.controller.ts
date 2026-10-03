import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ProductModelsService } from './product-models.service';
import { CreateProductModelDto } from './dto/create-product-model.dto';
import { UpdateProductModelDto } from './dto/update-product-model.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Product Models')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('product-models')
export class ProductModelsController {
  constructor(private productModelsService: ProductModelsService) {}

  @Get()
  @ApiOperation({ summary: 'List product models' })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'includeInactive', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.productModelsService.findAll({
      categoryId: categoryId ? parseInt(categoryId, 10) : undefined,
      search,
      includeInactive: includeInactive === 'true',
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product model by ID' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productModelsService.findOne(id);
  }

  @Post()
  @Roles(Role.INVENTORY)
  @ApiOperation({ summary: 'Create product model (Inventory only)' })
  async create(@Body() createProductModelDto: CreateProductModelDto) {
    return this.productModelsService.create(createProductModelDto);
  }

  @Patch(':id')
  @Roles(Role.INVENTORY)
  @ApiOperation({ summary: 'Update product model (Inventory only)' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() updateProductModelDto: UpdateProductModelDto) {
    return this.productModelsService.update(id, updateProductModelDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Deactivate product model (Admin only)' })
  async deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.productModelsService.deactivate(id);
  }
}
