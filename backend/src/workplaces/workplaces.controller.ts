import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { WorkplacesService } from './workplaces.service';
import { CreateWorkplaceDto, UpdateWorkplaceDto } from './dto/workplace.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Workplaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('workplaces')
export class WorkplacesController {
  constructor(private workplacesService: WorkplacesService) {}

  @Get()
  @ApiOperation({ summary: 'List workplaces (admin)' })
  findAll() {
    return this.workplacesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workplace (admin)' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.workplacesService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create workplace (admin)' })
  create(@Body() dto: CreateWorkplaceDto) {
    return this.workplacesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update workplace (admin)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateWorkplaceDto) {
    return this.workplacesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete workplace (admin)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.workplacesService.remove(id);
  }
}
