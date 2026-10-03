import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { InvoiceDeliveryService } from './invoice-delivery.service';
import { ScanBarcodeDto } from './dto/scan-barcode.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestWithUser } from '../common/types/request-with-user.interface';

@ApiTags('Invoice Delivery')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('invoices')
export class InvoiceDeliveryController {
  constructor(private invoiceDeliveryService: InvoiceDeliveryService) {}

  @Get(':id/delivery')
  @Roles(Role.INVENTORY, Role.ADMIN)
  @ApiOperation({ summary: 'Get delivery details with scanned/required counts per serialized line' })
  async getDeliveryDetails(@Param('id', ParseIntPipe) id: number) {
    return this.invoiceDeliveryService.getDeliveryDetails(id);
  }

  @Post(':id/delivery/scan')
  @Roles(Role.INVENTORY)
  @ApiOperation({ summary: 'Scan a serialized unit barcode for delivery' })
  async scanBarcode(
    @Request() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ScanBarcodeDto,
  ) {
    return this.invoiceDeliveryService.scanBarcode(id, req.user.sub, dto.barcode);
  }

  @Delete(':id/delivery/scan/:productUnitId')
  @Roles(Role.INVENTORY)
  @ApiOperation({ summary: 'Unscan (reverse) a previously scanned unit before delivery' })
  async unscanBarcode(
    @Request() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('productUnitId', ParseIntPipe) productUnitId: number,
  ) {
    return this.invoiceDeliveryService.unscanBarcode(id, req.user.sub, productUnitId);
  }

  @Patch(':id/deliver')
  @Roles(Role.INVENTORY)
  @ApiOperation({ summary: 'Mark invoice as delivered (requires all serialized lines fully scanned)' })
  async deliverInvoice(
    @Request() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.invoiceDeliveryService.deliverInvoice(id, req.user.sub);
  }
}