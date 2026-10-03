import { Controller, Get, Patch, Param, Query, UseGuards, Request, ParseIntPipe, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestWithUser } from '../common/types/request-with-user.interface';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.ACCOUNTANT, Role.SALES, Role.INVENTORY)
  @ApiOperation({ summary: 'List notifications' })
  @ApiQuery({ name: 'unreadOnly', required: false })
  @ApiQuery({ name: 'unread', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(
    @Request() req: RequestWithUser,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('unread') unread?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const unreadFilter = unreadOnly ?? unread;
    return this.notificationsService.findAll(req.user.sub, {
      unreadOnly: unreadFilter === 'true',
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
    });
  }

  @Get('unread-count')
  @Roles(Role.ADMIN, Role.ACCOUNTANT, Role.SALES, Role.INVENTORY)
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount(@Request() req: RequestWithUser) {
    return this.notificationsService.getUnreadCount(req.user.sub);
  }

  @Patch(':id/read')
  @Roles(Role.ADMIN, Role.ACCOUNTANT, Role.SALES, Role.INVENTORY)
  @ApiOperation({ summary: 'Mark notification as read' })
  async markAsRead(@Param('id', ParseIntPipe) id: number, @Request() req: RequestWithUser) {
    return this.notificationsService.markAsRead(id, req.user.sub);
  }

  @Patch('read-all')
  @Post('read-all')
  @Roles(Role.ADMIN, Role.ACCOUNTANT, Role.SALES, Role.INVENTORY)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@Request() req: RequestWithUser) {
    return this.notificationsService.markAllAsRead(req.user.sub);
  }
}
