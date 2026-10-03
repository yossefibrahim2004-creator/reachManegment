import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ExpenseCategoriesService } from './expense-categories.service';
import { CreateExpenseCategoryDto, UpdateExpenseCategoryDto } from './dto/expense-category.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Expense Categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ExpenseCategoriesController {
  constructor(private expenseCategoriesService: ExpenseCategoriesService) {}

  @Get('expense-categories')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List expense categories' })
  async findAll() {
    return this.expenseCategoriesService.findAll();
  }

  @Get('expense-categories/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get expense category by ID' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.expenseCategoriesService.findOne(id);
  }

  @Post('expense-categories')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create expense category' })
  async create(@Body() body: CreateExpenseCategoryDto) {
    return this.expenseCategoriesService.create(body);
  }

  @Patch('expense-categories/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update expense category' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateExpenseCategoryDto) {
    return this.expenseCategoriesService.update(id, body);
  }

  @Delete('expense-categories/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Deactivate expense category' })
  async deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.expenseCategoriesService.deactivate(id);
  }
}
