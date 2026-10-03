import { Module } from '@nestjs/common';
import { StockItemsService } from './stock-items.service';
import { StockItemsController } from './stock-items.controller';
import { StockAdjustmentsController } from './stock-adjustments.controller';

@Module({
  controllers: [StockItemsController, StockAdjustmentsController],
  providers: [StockItemsService],
  exports: [StockItemsService],
})
export class StockItemsModule {}
