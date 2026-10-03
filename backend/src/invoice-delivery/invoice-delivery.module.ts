import { Module } from '@nestjs/common';
import { InvoiceDeliveryService } from './invoice-delivery.service';
import { InvoiceDeliveryController } from './invoice-delivery.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [NotificationsModule, RealtimeModule],
  controllers: [InvoiceDeliveryController],
  providers: [InvoiceDeliveryService],
  exports: [InvoiceDeliveryService],
})
export class InvoiceDeliveryModule {}