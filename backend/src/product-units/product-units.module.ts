import { Module } from '@nestjs/common';
import { ProductUnitsService } from './product-units.service';
import { ProductUnitsController } from './product-units.controller';

@Module({
  controllers: [ProductUnitsController],
  providers: [ProductUnitsService],
  exports: [ProductUnitsService],
})
export class ProductUnitsModule {}
