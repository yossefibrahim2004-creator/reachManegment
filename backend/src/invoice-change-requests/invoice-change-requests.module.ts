import { Module } from '@nestjs/common';
import { InvoiceChangeRequestsService } from './invoice-change-requests.service';
import { InvoiceChangeRequestsController } from './invoice-change-requests.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [PrismaModule, NotificationsModule, RealtimeModule],
  controllers: [InvoiceChangeRequestsController],
  providers: [InvoiceChangeRequestsService],
  exports: [InvoiceChangeRequestsService],
})
export class InvoiceChangeRequestsModule {}
