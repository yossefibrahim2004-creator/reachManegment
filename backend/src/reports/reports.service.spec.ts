import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

describe('ReportsController', () => {
  it('exposes all-data detail endpoints without a row id', async () => {
    const service = {
      getCustomerReportDetails: jest.fn().mockResolvedValue({ items: [] }),
      getSupplierReportDetails: jest.fn().mockResolvedValue({ items: [] }),
      getEmployeeSalesReportDetails: jest.fn().mockResolvedValue({ items: [] }),
      getProductSalesReportDetails: jest.fn().mockResolvedValue({ items: [] }),
      getReturnsReportDetails: jest.fn().mockResolvedValue({ items: [] }),
      computeInventory: jest.fn().mockResolvedValue({ items: [], totals: {}, meta: {} }),
    } as any;

    const controller = new ReportsController(service);

    await controller.customerAllDetails('2026-09-01', '2026-09-30');
    await controller.supplierAllDetails('2026-09-01', '2026-09-30');
    await controller.employeeSalesAllDetails('2026-09-01', '2026-09-30');
    await controller.productSalesAllDetails('2026-09-01', '2026-09-30');
    await controller.returnsAllDetails('2026-09-01', '2026-09-30');
    await controller.inventory(undefined, undefined, undefined, '2', '50');

    expect(service.getCustomerReportDetails).toHaveBeenCalledWith('2026-09-01', '2026-09-30', undefined);
    expect(service.getSupplierReportDetails).toHaveBeenCalledWith('2026-09-01', '2026-09-30', undefined);
    expect(service.getEmployeeSalesReportDetails).toHaveBeenCalledWith('2026-09-01', '2026-09-30', undefined);
    expect(service.getProductSalesReportDetails).toHaveBeenCalledWith('2026-09-01', '2026-09-30', undefined, undefined);
    expect(service.getReturnsReportDetails).toHaveBeenCalledWith('2026-09-01', '2026-09-30', undefined, undefined, undefined);
    expect(service.computeInventory).toHaveBeenCalledWith(2, 50, undefined, undefined, undefined);
  });
});

describe('ReportsService', () => {
  describe('computeRevenue', () => {
    it('counts only delivered invoices in completed-sale revenue adjustments and returns', async () => {
      const prisma = {
        invoiceItem: {
          findMany: jest.fn().mockResolvedValue([{ price: 100, quantity: 2 }]),
        },
        invoicePriceAdjustment: {
          aggregate: jest.fn().mockResolvedValue({
            _sum: { newPrice: 150, oldPrice: 100 },
          }),
        },
        invoiceReturnItem: {
          aggregate: jest.fn().mockResolvedValue({
            _sum: { refundAmount: 50 },
          }),
        },
        invoice: {
          count: jest.fn().mockResolvedValue(1),
        },
        $queryRaw: jest.fn()
          .mockResolvedValueOnce([{ day: new Date('2026-09-01T00:00:00Z'), total: 200 }])
          .mockResolvedValueOnce([{ day: new Date('2026-09-01T00:00:00Z'), total: 50 }])
          .mockResolvedValueOnce([{ day: new Date('2026-09-01T00:00:00Z'), total: 25 }]),
      } as any;

      const service = new ReportsService(prisma);

      const result = await service.computeRevenue('2026-09-01', '2026-09-30');

      expect(result.originalSales).toBe(200);
      expect(result.approvedAdjustments).toBe(50);
      expect(result.approvedReturns).toBe(50);
      expect(result.netSales).toBe(200);
      expect(prisma.invoicePriceAdjustment.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            invoice: { status: 'DELIVERED' },
          }),
        }),
      );
      expect(prisma.invoiceReturnItem.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            invoiceReturn: expect.objectContaining({
              invoice: { status: 'DELIVERED' },
            }),
          }),
        }),
      );
    });
  });

  describe('computeInventory', () => {
    it('builds serialized and non-serialized rows with totals and low-stock flags', async () => {
      const prisma = {
        productModel: {
          findMany: jest.fn().mockResolvedValue([
            { id: 1, name: 'Phone', isSerialized: true, minStockAlert: 2, category: { name: 'Electronics' } },
            { id: 2, name: 'Cable', isSerialized: false, minStockAlert: 5, category: { name: 'Accessories' } },
          ]),
        },
        productUnit: {
          groupBy: jest.fn()
            .mockResolvedValueOnce([
              { productModelId: 1, status: 'AVAILABLE', _count: 1 },
              { productModelId: 1, status: 'RESERVED', _count: 1 },
              { productModelId: 1, status: 'SOLD', _count: 3 },
            ])
            .mockResolvedValueOnce([
              { productModelId: 1, _sum: { purchasePrice: 100 } },
            ]),
        },
        stockLot: {
          findMany: jest.fn().mockResolvedValue([
            { productModelId: 2, quantityReceived: 50, quantityRemaining: 10, quantityReserved: 3, purchasePrice: 4 },
          ]),
        },
        stockAdjustment: {
          groupBy: jest.fn().mockResolvedValue([]),
        },
      } as any;

      const service = new ReportsService(prisma);
      const result = await service.computeInventory(1, 25);

      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toMatchObject({
        productModelId: 1,
        isSerialized: true,
        available: 1,
        reserved: 1,
        sold: 3,
        totalReceived: 5,
        lowStock: true,
        stockValue: 100,
      });
      expect(result.items[1]).toMatchObject({
        productModelId: 2,
        isSerialized: false,
        available: 7,
        reserved: 3,
        totalReceived: 50,
        lowStock: false,
        stockValue: 40,
      });
      expect(result.totals).toEqual({
        productModels: 2,
        availableUnits: 8,
        reservedUnits: 4,
        lowStockCount: 1,
        stockValue: 140,
      });
      expect(result.meta).toEqual({ page: 1, limit: 25, total: 2, totalPages: 1 });
    });

    it('paginates rows and caps limit at 100', async () => {
      const models = Array.from({ length: 150 }, (_, i) => ({
        id: i + 1,
        name: `Model ${i + 1}`,
        isSerialized: false,
        minStockAlert: 0,
        category: { name: 'Bulk' },
      }));
      const prisma = {
        productModel: { findMany: jest.fn().mockResolvedValue(models) },
        productUnit: { groupBy: jest.fn().mockResolvedValue([]) },
        stockLot: { findMany: jest.fn().mockResolvedValue([]) },
        stockAdjustment: { groupBy: jest.fn().mockResolvedValue([]) },
      } as any;

      const service = new ReportsService(prisma);
      const result = await service.computeInventory(2, 999);

      expect(result.meta.limit).toBe(100);
      expect(result.meta.page).toBe(2);
      expect(result.meta.total).toBe(150);
      expect(result.meta.totalPages).toBe(2);
      expect(result.items).toHaveLength(50);
      expect(result.totals.productModels).toBe(150);
    });
  });

  describe('computeReturns', () => {
    it('applies the approval status filter when provided', async () => {
      const prisma = {
        invoiceReturn: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 1,
              invoiceId: 99,
              requestedById: 10,
              approvedById: 11,
              refundTotal: 150,
              reason: 'Damaged item',
              createdAt: new Date('2026-09-12T00:00:00Z'),
              invoice: { invoiceNumber: 'INV-1001' },
              items: [{ id: 1 }],
              request: { status: 'APPROVED' },
            },
          ]),
          aggregate: jest.fn().mockResolvedValue({
            _sum: { refundTotal: 150 },
            _count: 1,
          }),
        },
        employee: {
          findMany: jest.fn().mockResolvedValue([
            { id: 10, name: 'Alice' },
            { id: 11, name: 'Bob' },
          ]),
        },
      } as any;

      const service = new ReportsService(prisma);

      await service.computeReturns('2026-09-01', '2026-09-30', undefined, 'APPROVED');

      expect(prisma.invoiceReturn.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            request: { status: 'APPROVED' },
          }),
        }),
      );
    });
  });

  describe('customer and supplier detail reports', () => {
    it('includes invoice numbers and supplier detail data when customer and supplier filters are used', async () => {
      const prisma = {
        invoice: {
          groupBy: jest.fn().mockResolvedValue([
            { customerId: 7, _count: 2, _sum: { currentTotal: 500 } },
          ]),
          findMany: jest.fn().mockResolvedValue([
            { customerId: 7, date: new Date('2026-09-10T00:00:00Z'), invoiceNumber: 'INV-1001' },
            { customerId: 7, date: new Date('2026-09-15T00:00:00Z'), invoiceNumber: 'INV-1002' },
          ]),
        },
        invoiceReturn: {
          groupBy: jest.fn().mockResolvedValue([]),
        },
        customer: {
          findMany: jest.fn().mockResolvedValue([{ id: 7, name: 'Acme', type: 'COMPANY' }]),
        },
        stockReceipt: {
          groupBy: jest.fn().mockResolvedValue([{ supplierId: 4, _count: 3 }]),
          findUnique: jest.fn().mockImplementation(async ({ where }) => ({
            id: where.id,
            date: new Date('2026-09-15T00:00:00Z'),
          })),
        },
        supplier: {
          findMany: jest.fn().mockResolvedValue([{ id: 4, name: 'Alpha Supply' }]),
        },
        stockLot: {
          groupBy: jest.fn().mockResolvedValue([
            { supplierId: 4, _count: 3, _sum: { quantityReceived: 42 } },
          ]),
          findMany: jest.fn().mockResolvedValue([
            { supplierId: 4, quantityReceived: 20, purchasePrice: 10, receivedDate: new Date('2026-09-12T00:00:00Z'), stockReceiptId: 101 },
            { supplierId: 4, quantityReceived: 22, purchasePrice: 12, receivedDate: new Date('2026-09-14T00:00:00Z'), stockReceiptId: 102 },
          ]),
        },
      } as any;

      const service = new ReportsService(prisma);

      const customerResult = await service.computeCustomers('2026-09-01', '2026-09-30', 7);
      expect(customerResult.items[0].invoiceNumbers).toEqual(['INV-1001', 'INV-1002']);

      const supplierResult = await service.computeSuppliers('2026-09-01', '2026-09-30', 4);
      expect(supplierResult.items[0].receiptCount).toBe(3);
      expect(supplierResult.items[0].totalQuantityReceived).toBe(42);
    });

    it('exposes drill-down rows with line items for customer and supplier details', async () => {
      const prisma = {
        invoice: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 14,
              invoiceNumber: 'INV-1001',
              date: new Date('2026-09-10T00:00:00Z'),
              currentTotal: '450.00',
              customer: { id: 7, name: 'Acme' },
              items: [
                { id: 10, productModel: { name: 'Laptop' }, quantity: 2, price: '150.00', lineTotal: 300 },
              ],
            },
          ]),
        },
        stockReceipt: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 201,
              date: new Date('2026-09-12T00:00:00Z'),
              supplier: { id: 4, name: 'Alpha Supply' },
              stockLots: [
                { id: 301, productModel: { name: 'Mouse' }, quantityReceived: 6, purchasePrice: '25.00' },
              ],
            },
          ]),
        },
      } as any;

      const service = new ReportsService(prisma);

      const customerDetails = await service.getCustomerReportDetails('2026-09-01', '2026-09-30', 7);
      expect(customerDetails.items[0].invoiceNumber).toBe('INV-1001');
      expect(customerDetails.items[0].customerName).toBe('Acme');
      expect(customerDetails.items[0].items[0].productName).toBe('Laptop');

      const supplierDetails = await service.getSupplierReportDetails('2026-09-01', '2026-09-30', 4);
      expect(supplierDetails.items[0].receiptNumber).toBe('RCPT-000201');
      expect(supplierDetails.items[0].supplierName).toBe('Alpha Supply');
      expect(supplierDetails.items[0].items[0].productName).toBe('Mouse');
    });
  });
});
