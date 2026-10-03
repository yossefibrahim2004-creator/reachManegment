import { InvoicesService } from './invoices.service';

describe('InvoicesService', () => {
  it('calculates subtotal, percentage discount, fixed discount, and final total', () => {
    const service = new InvoicesService({} as any, {} as any);

    const totals = service.calculateInvoiceTotals(
      [
        { price: 100, quantity: 2 },
        { price: 50, quantity: 1 },
      ],
      10,
      15,
    );

    expect(totals.subtotal).toBe(250);
    expect(totals.percentageDiscount).toBe(25);
    expect(totals.fixedDiscount).toBe(15);
    expect(totals.total).toBe(210);
  });

  it('treats the end date filter as the end of the selected day', async () => {
    const prisma = {
      invoice: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      productUnit: { findUnique: jest.fn() },
      invoiceItemUnitAssignment: { findMany: jest.fn() },
    } as any;

    const service = new InvoicesService(prisma, {} as any);

    await service.findAll({ from: '2026-09-20', to: '2026-09-21', page: 1, limit: 25 });

    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      }),
    );

    const where = prisma.invoice.findMany.mock.calls[0][0].where;
    const expectedFrom = new Date('2026-09-20T00:00:00');
    const expectedTo = new Date('2026-09-21T23:59:59.999');

    expect(where.date.gte.getTime()).toBe(expectedFrom.getTime());
    expect(where.date.lte.getTime()).toBe(expectedTo.getTime());
  });

  it('creates the initial invoice sequence when it is missing', async () => {
    const productModel = {
      id: 1,
      name: 'Test Model',
      isSerialized: true,
      reservedQuantity: 0,
      minStockAlert: 0,
      isActive: true,
      deletedAt: null,
    };

    let tx: any;
    const prisma = {
      customer: { findFirst: jest.fn().mockResolvedValue({ id: 1, name: 'Test Customer' }) },
      productModel: {
        findFirst: jest.fn().mockResolvedValue(productModel),
        findUnique: jest.fn().mockResolvedValue(productModel),
        update: jest.fn().mockResolvedValue(productModel),
      },
      productUnit: { count: jest.fn().mockResolvedValue(1) },
      $transaction: jest.fn(async (cb) => {
        tx = {
          invoiceSequence: {
            upsert: jest.fn().mockResolvedValue({ id: 1, currentNumber: 1 }),
          },
          productUnit: { count: jest.fn().mockResolvedValue(1) },
          productModel: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            update: jest.fn().mockResolvedValue(productModel),
            findUnique: jest.fn().mockResolvedValue(productModel),
          },
          invoice: {
            create: jest.fn().mockResolvedValue({
              id: 101,
              invoiceNumber: 'INV-000001',
              date: new Date('2026-09-21T00:00:00Z'),
              status: 'PENDING_ACCOUNTANT',
              originalTotal: 100,
              currentTotal: 100,
              paymentType: 'CASH',
              discountPercentage: 0,
              discountAmount: 0,
            }),
          },
          invoiceItem: { create: jest.fn().mockResolvedValue({}) },
          invoiceAuditLog: { create: jest.fn().mockResolvedValue({}) },
        };
        return cb(tx);
      }),
    } as any;

    const notifications = {
      createLowStockNotification: jest.fn(),
      resolveLowStockNotification: jest.fn(),
      notifyInvoicePendingReview: jest.fn().mockResolvedValue(undefined),
    };

    const service = new InvoicesService(prisma, notifications as any);

    await service.createInvoice(7, {
      customerId: 1,
      paymentType: 'CASH',
      items: [{ productModelId: 1, quantity: 1, price: 100 }],
    });

    expect(tx.invoiceSequence.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        update: { currentNumber: { increment: 1 } },
        create: { id: 1, currentNumber: 1 },
      }),
    );
  });

  it('rejects serialized reservation inside the transaction when conditional update finds no headroom (ISS-007)', async () => {
    // Outer pre-check sees headroom (available 10, reserved 0) so the race is only lost inside the tx.
    const productModel = {
      id: 1,
      name: 'Race Model',
      isSerialized: true,
      reservedQuantity: 0,
      minStockAlert: 0,
      isActive: true,
      deletedAt: null,
    };

    const prisma = {
      customer: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
      productModel: { findFirst: jest.fn().mockResolvedValue(productModel) },
      productUnit: { count: jest.fn().mockResolvedValue(10) },
      $transaction: jest.fn(async (cb) => {
        const tx = {
          invoiceSequence: {
            upsert: jest.fn().mockResolvedValue({ id: 1, currentNumber: 1 }),
          },
          productUnit: { count: jest.fn().mockResolvedValue(5) },
          productModel: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            findUnique: jest.fn().mockResolvedValue({ reservedQuantity: 5 }),
          },
          invoice: { create: jest.fn() },
          invoiceItem: { create: jest.fn() },
          invoiceAuditLog: { create: jest.fn() },
        };
        return cb(tx);
      }),
    } as any;

    const notifications = {
      createLowStockNotification: jest.fn(),
      resolveLowStockNotification: jest.fn(),
      notifyInvoicePendingReview: jest.fn(),
    };

    const service = new InvoicesService(prisma, notifications as any);

    await expect(
      service.createInvoice(7, {
        customerId: 1,
        items: [{ productModelId: 1, quantity: 3, price: 100 }],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INSUFFICIENT_STOCK' }),
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0][0]).toEqual(expect.any(Function));
  });

  it('reserves non-serialized stock with conditional lot updates and skips a lot that lost the race (ISS-007)', async () => {
    const bulkModel = {
      id: 2,
      name: 'Bulk Cable',
      isSerialized: false,
      reservedQuantity: 0,
      minStockAlert: 0,
      isActive: true,
      deletedAt: null,
    };

    const prisma = {
      customer: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
      productModel: { findFirst: jest.fn().mockResolvedValue(bulkModel) },
      stockLot: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantityRemaining: 13, quantityReserved: 0 } }),
      },
      $transaction: jest.fn(async (cb) => {
        const tx = {
          invoiceSequence: {
            upsert: jest.fn().mockResolvedValue({ id: 1, currentNumber: 1 }),
          },
          stockLot: {
            findMany: jest.fn().mockResolvedValue([
              { id: 10, quantityRemaining: 5, quantityReserved: 0, receivedDate: new Date('2026-01-01') },
              { id: 11, quantityRemaining: 8, quantityReserved: 0, receivedDate: new Date('2026-02-01') },
            ]),
            updateMany: jest.fn()
              .mockResolvedValueOnce({ count: 0 })
              .mockResolvedValueOnce({ count: 1 }),
          },
          invoice: {
            create: jest.fn().mockResolvedValue({
              id: 201,
              invoiceNumber: 'INV-000002',
              date: new Date(),
              status: 'PENDING_ACCOUNTANT',
              originalTotal: 50,
              currentTotal: 50,
              paymentType: 'CASH',
              discountPercentage: 0,
              discountAmount: 0,
            }),
          },
          invoiceItem: { create: jest.fn().mockResolvedValue({}) },
          invoiceAuditLog: { create: jest.fn().mockResolvedValue({}) },
          productModel: { findUnique: jest.fn().mockResolvedValue(bulkModel) },
        };
        return cb(tx);
      }),
    } as any;

    const notifications = {
      createLowStockNotification: jest.fn(),
      resolveLowStockNotification: jest.fn(),
      notifyInvoicePendingReview: jest.fn().mockResolvedValue(undefined),
    };

    const service = new InvoicesService(prisma, notifications as any);

    await service.createInvoice(7, {
      customerId: 1,
      items: [{ productModelId: 2, quantity: 4, price: 12.5 }],
    });

    // First lot lost the race (count 0) → skipped; second lot reserved 4 atomically
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('throws ConflictException when non-serialized lots cannot cover the request inside the tx (ISS-007)', async () => {
    const bulkModel = {
      id: 3,
      name: 'Bulk Paper',
      isSerialized: false,
      reservedQuantity: 0,
      minStockAlert: 0,
      isActive: true,
      deletedAt: null,
    };

    const prisma = {
      customer: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
      productModel: { findFirst: jest.fn().mockResolvedValue(bulkModel) },
      stockLot: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantityRemaining: 2, quantityReserved: 0 } }),
      },
      $transaction: jest.fn(async (cb) => {
        const tx = {
          invoiceSequence: {
            upsert: jest.fn().mockResolvedValue({ id: 1, currentNumber: 1 }),
          },
          stockLot: {
            findMany: jest.fn().mockResolvedValue([
              { id: 20, quantityRemaining: 2, quantityReserved: 2, receivedDate: new Date('2026-01-01') },
            ]),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
          invoice: { create: jest.fn() },
          invoiceItem: { create: jest.fn() },
          invoiceAuditLog: { create: jest.fn() },
        };
        return cb(tx);
      }),
    } as any;

    const notifications = {
      createLowStockNotification: jest.fn(),
      resolveLowStockNotification: jest.fn(),
      notifyInvoicePendingReview: jest.fn(),
    };

    const service = new InvoicesService(prisma, notifications as any);

    await expect(
      service.createInvoice(7, {
        customerId: 1,
        items: [{ productModelId: 3, quantity: 5, price: 10 }],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INSUFFICIENT_STOCK' }),
    });
  });
});
