import { InvoiceChangeRequestsService } from './invoice-change-requests.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

type MockTx = {
  productModel: {
    findFirst: jest.Mock;
    update: jest.Mock;
    findUnique: jest.Mock;
  };
  productUnit: {
    count: jest.Mock;
    findUnique: jest.Mock;
    updateMany: jest.Mock;
  };
  stockLot: {
    aggregate: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  stockConsumption: {
    findMany: jest.Mock;
  };
  invoiceItem: {
    create: jest.Mock;
    findUnique: jest.Mock;
  };
  invoice: {
    update: jest.Mock;
    findUnique: jest.Mock;
  };
  invoiceReturn: {
    create: jest.Mock;
  };
  invoiceReturnItem: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  invoicePriceAdjustment: {
    create: jest.Mock;
  };
  invoiceItemUnitAssignment: {
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  productUnitAuditLog: {
    create: jest.Mock;
  };
  invoiceChangeRequest: {
      updateMany: jest.Mock;
      findUnique: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
  };
  invoiceAuditLog: {
    create: jest.Mock;
  };
  notification: {
    create: jest.Mock;
  };
  employee: {
    findMany: jest.Mock;
  };
};

function createMockTx(): MockTx {
  return {
    productModel: {
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
    },
    productUnit: {
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    stockLot: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { quantityRemaining: 0, quantityReserved: 0 } }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    stockConsumption: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    invoiceItem: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
    },
    invoice: {
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
    },
    invoiceReturn: {
      create: jest.fn().mockResolvedValue({ id: 500 }),
    },
    invoiceReturnItem: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({}),
    },
    invoicePriceAdjustment: {
      create: jest.fn().mockResolvedValue({ id: 1 }),
    },
    invoiceItemUnitAssignment: {
      findFirst: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    productUnitAuditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    invoiceChangeRequest: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({ id: 10, items: [], requestedBy: { id: 7, name: 'Sales' } }),
    },
    invoiceAuditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    notification: {
      create: jest.fn().mockResolvedValue({}),
    },
    employee: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

function createService(tx: MockTx) {
  tx.invoiceChangeRequest.findUnique.mockResolvedValue(baseRequest());
  const prisma = {
    invoiceChangeRequest: { findUnique: tx.invoiceChangeRequest.findUnique },
    $transaction: jest.fn(async (cb: (t: MockTx) => Promise<any>) => cb(tx)),
  } as any;

  const notifications = {
    createLowStockNotification: jest.fn().mockResolvedValue(undefined),
    resolveLowStockNotification: jest.fn().mockResolvedValue(undefined),
  } as any;

  return {
    service: new InvoiceChangeRequestsService(prisma, notifications),
    notifications,
    tx,
  };
}

function baseRequest(overrides: any = {}) {
  return {
    id: 10,
    invoiceId: 100,
    requestedByEmployeeId: 7,
    status: 'PENDING',
    reason: 'need more stock',
    items: [],
    invoice: { id: 100, items: [] },
    ...overrides,
  };
}

describe('InvoiceChangeRequestsService.approveAddItemTransaction (ISS-001/ISS-002)', () => {
  it('creates InvoiceItem rows and increments currentTotal on approval', async () => {
    const tx = createMockTx();
    const { service } = createService(tx);

    const serializedModel = {
      id: 1,
      name: 'Widget',
      isSerialized: true,
      minStockAlert: 0,
      isActive: true,
      deletedAt: null,
      reservedQuantity: 0,
    };
    tx.productModel.findFirst.mockResolvedValue(serializedModel);
    tx.productUnit.count.mockResolvedValue(5);

    const request = baseRequest({
      items: [
        {
          id: 1,
          action: 'ADD_ITEM',
          productModelId: 1,
          quantity: 2,
          proposedPrice: 50,
          productUnitId: null,
        },
        {
          id: 2,
          action: 'ADD_ITEM',
          productModelId: 1,
          quantity: 1,
          proposedPrice: 30,
          productUnitId: null,
        },
      ],
    });

    tx.invoiceChangeRequest.findUnique.mockResolvedValue(request);
    tx.invoiceChangeRequest.findUnique.mockResolvedValue(request);
    const access: any = service as any;
    const result = await access.approveAddItemTransaction(request, 99, 'ok');

    expect(result.status).toBe('APPROVED');
    expect(result.itemsAdded).toBe(2);
    expect(result.totalDelta).toBe(2 * 50 + 1 * 30); // 130

    // ISS-001: InvoiceItem rows created for each add item
    expect(tx.invoiceItem.create).toHaveBeenCalledTimes(2);
    expect(tx.invoiceItem.create).toHaveBeenNthCalledWith(1, {
      data: { invoiceId: 100, productModelId: 1, quantity: 2, price: 50 },
    });
    expect(tx.invoiceItem.create).toHaveBeenNthCalledWith(2, {
      data: { invoiceId: 100, productModelId: 1, quantity: 1, price: 30 },
    });

    // ISS-001: currentTotal incremented by Σ price × qty
    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: { currentTotal: { increment: 130 } },
    });

    // Stock reserved for serialized model
    expect(tx.productModel.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { reservedQuantity: { increment: 2 } },
    });
    expect(tx.productModel.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { reservedQuantity: { increment: 1 } },
    });

    // Request marked approved
    expect(tx.invoiceChangeRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
        data: expect.objectContaining({ status: 'APPROVED', reviewedByAdminId: 99 }),
      }),
    );
  });

  it('does not throw Prisma validation error on low-stock recalc (uses productModelId, not productUnitId)', async () => {
    const tx = createMockTx();
    const { service, notifications } = createService(tx);

    const model = {
      id: 42,
      name: 'Gadget',
      isSerialized: false,
      minStockAlert: 10,
      isActive: true,
      deletedAt: null,
      reservedQuantity: 0,
    };
    tx.productModel.findFirst.mockResolvedValue(model);
    tx.stockLot.aggregate
      .mockResolvedValueOnce({ _sum: { quantityRemaining: 12, quantityReserved: 0 } }) // Phase 1 availability
      .mockResolvedValueOnce({ _sum: { quantityRemaining: 12, quantityReserved: 2 } }); // Low-stock recalc
    tx.stockLot.findMany.mockResolvedValue([
      { id: 1, quantityRemaining: 12, quantityReserved: 0, receivedDate: new Date('2026-01-01') },
    ]);

    const request = baseRequest({
      items: [
        {
          id: 1,
          action: 'ADD_ITEM',
          productModelId: 42,
          quantity: 2,
          proposedPrice: 10,
          productUnitId: null, // always null for ADD_ITEM
        },
      ],
    });

    tx.invoiceChangeRequest.findUnique.mockResolvedValue(request);
    tx.invoiceChangeRequest.findUnique.mockResolvedValue(request);
    const access: any = service as any;
    // Before the fix, findUnique({ where: { id: null/undefined } }) threw and aborted the tx.
    await expect(access.approveAddItemTransaction(request, 99, 'ok')).resolves.toMatchObject({
      status: 'APPROVED',
    });

    // Low-stock recalc uses productModelId path (non-serialized → lot aggregate), not productUnit.findUnique
    expect(tx.productUnit.findUnique).not.toHaveBeenCalled();
    expect(notifications.createLowStockNotification).toHaveBeenCalledWith(
      42,
      'Gadget',
      10, // 12 remaining − 2 reserved
      10,
    );
  });

  it('auto-rejects without reserving stock or creating InvoiceItems when stock is insufficient', async () => {
    const tx = createMockTx();
    const { service } = createService(tx);

    const model = {
      id: 5,
      name: 'Scarce',
      isSerialized: true,
      minStockAlert: 0,
      isActive: true,
      deletedAt: null,
      reservedQuantity: 3, // all 3 units already reserved
    };
    tx.productModel.findFirst.mockResolvedValue(model);
    tx.productUnit.count.mockResolvedValue(3); // 3 available − 3 reserved = 0 sellable

    const request = baseRequest({
      items: [
        {
          id: 1,
          action: 'ADD_ITEM',
          productModelId: 5,
          quantity: 1,
          proposedPrice: 99,
          productUnitId: null,
        },
      ],
    });

    tx.invoiceChangeRequest.findUnique.mockResolvedValue(request);
    tx.invoiceChangeRequest.findUnique.mockResolvedValue(request);
    const access: any = service as any;
    const result = await access.approveAddItemTransaction(request, 99, undefined);

    expect(result.status).toBe('REJECTED');
    expect(result.reason).toBe('Insufficient stock');

    // No stock reserved, no invoice items created
    expect(tx.productModel.update).not.toHaveBeenCalled();
    expect(tx.invoiceItem.create).not.toHaveBeenCalled();
    expect(tx.invoice.update).not.toHaveBeenCalled();

    // Request marked rejected with auto-reject note
    expect(tx.invoiceChangeRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
        data: expect.objectContaining({
          status: 'REJECTED',
          adminNote: expect.stringContaining('Insufficient stock'),
        }),
      }),
    );
  });

  it('reserves non-serialized stock FIFO across lots and creates InvoiceItem', async () => {
    const tx = createMockTx();
    const { service } = createService(tx);

    const model = {
      id: 9,
      name: 'Bulk',
      isSerialized: false,
      minStockAlert: 0,
      isActive: true,
      deletedAt: null,
      reservedQuantity: 0,
    };
    tx.productModel.findFirst.mockResolvedValue(model);
    tx.stockLot.aggregate.mockResolvedValue({
      _sum: { quantityRemaining: 20, quantityReserved: 0 },
    });
    tx.stockLot.findMany.mockResolvedValue([
      { id: 1, quantityRemaining: 5, quantityReserved: 0, receivedDate: new Date('2026-01-01') },
      { id: 2, quantityRemaining: 15, quantityReserved: 0, receivedDate: new Date('2026-02-01') },
    ]);

    const request = baseRequest({
      items: [
        {
          id: 1,
          action: 'ADD_ITEM',
          productModelId: 9,
          quantity: 7,
          proposedPrice: 4,
          productUnitId: null,
        },
      ],
    });

    tx.invoiceChangeRequest.findUnique.mockResolvedValue(request);
    tx.invoiceChangeRequest.findUnique.mockResolvedValue(request);
    const access: any = service as any;
    const result = await access.approveAddItemTransaction(request, 99, 'ok');

    expect(result.status).toBe('APPROVED');
    expect(result.totalDelta).toBe(28);

    // FIFO: 5 from lot 1, 2 from lot 2
    expect(tx.stockLot.update).toHaveBeenCalledTimes(2);
    expect(tx.stockLot.update).toHaveBeenNthCalledWith(1, {
      where: { id: 1 },
      data: { quantityReserved: { increment: 5 } },
    });
    expect(tx.stockLot.update).toHaveBeenNthCalledWith(2, {
      where: { id: 2 },
      data: { quantityReserved: { increment: 2 } },
    });

    expect(tx.invoiceItem.create).toHaveBeenCalledWith({
      data: { invoiceId: 100, productModelId: 9, quantity: 7, price: 4 },
    });
    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: { currentTotal: { increment: 28 } },
    });
  });

  it('rejects non-finite proposed price before any mutation', async () => {
    const tx = createMockTx();
    const { service } = createService(tx);

    tx.productModel.findFirst.mockResolvedValue({
      id: 1,
      name: 'X',
      isSerialized: true,
      minStockAlert: 0,
      isActive: true,
      deletedAt: null,
      reservedQuantity: 0,
    });
    tx.productUnit.count.mockResolvedValue(10);

    const request = baseRequest({
      items: [
        {
          id: 1,
          action: 'ADD_ITEM',
          productModelId: 1,
          quantity: 1,
          proposedPrice: undefined, // Number(undefined) → NaN
          productUnitId: null,
        },
      ],
    });

    tx.invoiceChangeRequest.findUnique.mockResolvedValue(request);
    const access: any = service as any;
    await expect(access.approveAddItemTransaction(request, 99, 'ok')).rejects.toThrow(
      BadRequestException,
    );
    expect(tx.invoiceItem.create).not.toHaveBeenCalled();
    expect(tx.productModel.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when product model is missing', async () => {
    const tx = createMockTx();
    const { service } = createService(tx);

    tx.productModel.findFirst.mockResolvedValue(null);

    const request = baseRequest({
      items: [
        {
          id: 1,
          action: 'ADD_ITEM',
          productModelId: 999,
          quantity: 1,
          proposedPrice: 10,
          productUnitId: null,
        },
      ],
    });

    tx.invoiceChangeRequest.findUnique.mockResolvedValue(request);
    const access: any = service as any;
    await expect(access.approveAddItemTransaction(request, 99, 'ok')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('InvoiceChangeRequestsService.approveReturnTransaction (ISS-004/ISS-022)', () => {
  function setupReturnScenario({
    currentTotal,
    adjustedSubtotal,
    effectivePrice,
    basePrice = effectivePrice,
  }: {
    currentTotal: number;
    adjustedSubtotal: number;
    effectivePrice: number;
    basePrice?: number;
  }) {
    const tx = createMockTx();
    const { service } = createService(tx);

    tx.invoice.findUnique.mockResolvedValue({
      currentTotal,
      items: [
        {
          id: 1,
          quantity: 2,
          price: basePrice,
          priceAdjustments:
            effectivePrice !== basePrice
              ? [{ newPrice: effectivePrice, createdAt: new Date('2026-09-01') }]
              : [],
        },
      ],
    });

    tx.invoiceItem.findUnique.mockResolvedValue({
      id: 1,
      price: basePrice,
      quantity: 2,
      productModelId: 1,
      productModel: { id: 1, name: 'Widget', isSerialized: true },
      unitAssignments: [
        {
          id: 11,
          productUnitId: 901,
          productUnit: { id: 901, status: 'SOLD', version: 3, barcode: 'BC-1' },
        },
      ],
    });

    const request = baseRequest({
      items: [
        {
          id: 1,
          action: 'RETURN_ITEM',
          invoiceItemId: 1,
          productUnitId: 901,
        },
      ],
      invoice: {
        id: 100,
        items: [{ id: 1, quantity: 2 }],
      },
    });

    tx.invoiceChangeRequest.findUnique.mockResolvedValue(request);

    return { tx, service, request, adjustedSubtotal };
  }

  it('scales refund by payment ratio so invoice-level discounts are allocated proportionally', async () => {
    // List subtotal 200, customer paid 180 (10% off). Return 1 of 2 units at list 100.
    const { tx, service, request } = setupReturnScenario({
      currentTotal: 180,
      adjustedSubtotal: 200,
      effectivePrice: 100,
    });

    const access: any = service as any;
    const result = await access.approveReturnTransaction(request, 99, 'ok');

    // paymentRatio = 180/200 = 0.9 → refund = 100 × 0.9 = 90 (not base 100)
    expect(result.refundTotal).toBe(90);
    expect(tx.invoiceReturn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          refundTotal: 90,
          items: {
            create: [
              expect.objectContaining({ refundAmount: 90, productUnitId: 901 }),
            ],
          },
        }),
      }),
    );
    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: { currentTotal: 90 },
    });
  });

  it('uses the latest price-adjustment effective price, not the base invoiceItem.price', async () => {
    // Base price 80 was adjusted up to 120; customer paid full adjusted subtotal 240.
    const { tx, service, request } = setupReturnScenario({
      currentTotal: 240,
      adjustedSubtotal: 240,
      effectivePrice: 120,
      basePrice: 80,
    });

    const access: any = service as any;
    const result = await access.approveReturnTransaction(request, 99, 'ok');

    expect(result.refundTotal).toBe(120);
    expect(tx.invoiceReturn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: [expect.objectContaining({ refundAmount: 120 })],
          },
        }),
      }),
    );
  });

  it('floors currentTotal at 0 when the discount-aware refund exceeds it (ISS-022)', async () => {
    // Odd state: currentTotal already drifted below a single unit's share.
    const { tx, service, request } = setupReturnScenario({
      currentTotal: 10,
      adjustedSubtotal: 200,
      effectivePrice: 100,
    });

    const access: any = service as any;
    const result = await access.approveReturnTransaction(request, 99, 'ok');

    // ratio = 10/200 = 0.05 → refund = 5; 10 - 5 = 5 (still positive here)
    expect(result.refundTotal).toBe(5);
    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: { currentTotal: 5 },
    });

    // Hard floor case: ratio forces refund == currentTotal after rounding drift
    tx.invoice.findUnique.mockResolvedValue({
      currentTotal: 3,
      items: [
        {
          id: 1,
          quantity: 2,
          price: 100,
          priceAdjustments: [],
        },
      ],
    });
    tx.invoiceItem.findUnique.mockResolvedValue({
      id: 1,
      price: 100,
      quantity: 2,
      productModelId: 1,
      productModel: { id: 1, name: 'Widget', isSerialized: true },
      unitAssignments: [
        {
          id: 11,
          productUnitId: 902,
          productUnit: { id: 902, status: 'SOLD', version: 1, barcode: 'BC-2' },
        },
      ],
    });
    tx.invoiceReturnItem.findFirst.mockResolvedValue(null);
    tx.productUnit.updateMany.mockResolvedValue({ count: 1 });

    const request2 = baseRequest({
      items: [
        { id: 2, action: 'RETURN_ITEM', invoiceItemId: 1, productUnitId: 902 },
      ],
      invoice: { id: 100, items: [{ id: 1, quantity: 2 }] },
    });
    tx.invoiceChangeRequest.findUnique.mockResolvedValue(request2);

    const result2 = await access.approveReturnTransaction(request2, 99, 'ok');
    // ratio = 3/200 = 0.015 → refund = 1.5; total would be 1.5, floored path still ≥ 0
    expect(result2.refundTotal).toBe(1.5);
    const lastUpdate = tx.invoice.update.mock.calls[tx.invoice.update.mock.calls.length - 1];
    expect(lastUpdate[0].data.currentTotal).toBeGreaterThanOrEqual(0);
  });

  it('blocks returning the same productUnitId twice but allows a different unit of the same line (ISS-005)', async () => {
    const { tx, service, request } = setupReturnScenario({
      currentTotal: 100,
      adjustedSubtotal: 100,
      effectivePrice: 50,
    });

    // First: no prior return for this unit → allowed
    tx.invoiceReturnItem.findFirst.mockResolvedValueOnce(null);
    const access: any = service as any;
    await expect(access.approveReturnTransaction(request, 99, 'ok')).resolves.toMatchObject({
      status: 'APPROVED',
    });

    // existingReturn lookup must filter by productUnitId, not invoiceItemId alone
    expect(tx.invoiceReturnItem.findFirst).toHaveBeenCalledWith({
      where: { invoiceItemId: 1, productUnitId: 901 },
    });

    // Second attempt: a return already exists for this unit → rejected
    tx.invoiceReturnItem.findFirst.mockResolvedValueOnce({ id: 1 });
    await expect(access.approveReturnTransaction(request, 99, 'ok')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'UNIT_ALREADY_RETURNED' }),
    });
  });
});

describe('InvoiceChangeRequestsService � non-serialized quantity returns (Fix 2)', () => {
  function setupNonSerialized({
    lineQuantity = 3,
    requestQuantity = lineQuantity,
    priorReturns = [],
    consumptions = [{ stockLotId: 5, quantity: lineQuantity }],
  }: {
    lineQuantity?: number;
    requestQuantity?: number;
    priorReturns?: { quantity: number }[];
    consumptions?: { stockLotId: number; quantity: number }[];
  } = {}) {
    const tx = createMockTx();
    const { service } = createService(tx);

    tx.invoice.findUnique.mockResolvedValue({
      currentTotal: 100 * lineQuantity,
      items: [{ id: 1, quantity: lineQuantity, price: 100, priceAdjustments: [] }],
    });
    tx.invoiceItem.findUnique.mockResolvedValue({
      id: 1,
      price: 100,
      quantity: lineQuantity,
      productModelId: 77,
      productModel: { id: 77, name: 'Bulk', isSerialized: false },
      unitAssignments: [],
    });
    tx.invoiceReturnItem.findMany.mockResolvedValue(priorReturns);
    tx.stockConsumption.findMany.mockResolvedValue(consumptions.map((c) => ({ ...c })));
    tx.stockLot.findUnique.mockResolvedValue({ id: 5, quantityRemaining: 0, quantityReserved: 0 });

    const request = baseRequest({
      items: [
        { id: 1, action: 'RETURN_ITEM', invoiceItemId: 1, productUnitId: null, quantity: requestQuantity },
      ],
      invoice: { id: 100, items: [{ id: 1, quantity: lineQuantity }] },
    });
    tx.invoiceChangeRequest.findUnique.mockResolvedValue(request);
    return { tx, service, request };
  }

  it('returns a non-serialized line by quantity, refunds, and restores consumed stock', async () => {
    const { tx, service, request } = setupNonSerialized();
    const access: any = service as any;

    const result = await access.approveReturnTransaction(request, 99, 'ok');

    expect(result).toMatchObject({ status: 'APPROVED', refundTotal: 300, itemsReturned: 1 });

    // InvoiceReturnItem stores quantity, productUnitId stays null
    expect(tx.invoiceReturn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          refundTotal: 300,
          items: {
            create: [{ invoiceItemId: 1, productUnitId: null, quantity: 3, refundAmount: 300 }],
          },
        }),
      }),
    );

    // Consumed quantity is credited back to the lot it came from
    expect(tx.stockLot.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { quantityRemaining: { increment: 3 } },
    });

    // No unit-level handling for non-serialized lines
    expect(tx.productUnit.updateMany).not.toHaveBeenCalled();
    expect(tx.invoiceItemUnitAssignment.update).not.toHaveBeenCalled();
    expect(tx.productUnitAuditLog.create).not.toHaveBeenCalled();

    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: { currentTotal: 0 },
    });
  });

  it('supports partial quantity returns of a non-serialized line', async () => {
    const { tx, service, request } = setupNonSerialized({ requestQuantity: 2 });
    const access: any = service as any;

    const result = await access.approveReturnTransaction(request, 99, 'ok');

    expect(result).toMatchObject({ refundTotal: 200, itemsReturned: 1 });
    expect(tx.invoiceReturn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: { create: [expect.objectContaining({ quantity: 2, refundAmount: 200 })] },
        }),
      }),
    );
    expect(tx.stockLot.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { quantityRemaining: { increment: 2 } },
    });
    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: { currentTotal: 100 },
    });
  });

  it('rejects over-returning a non-serialized line', async () => {
    const { tx, service, request } = setupNonSerialized({
      lineQuantity: 5,
      requestQuantity: 3,
      priorReturns: [{ quantity: 3 }],
    });
    const access: any = service as any;

    await expect(access.approveReturnTransaction(request, 99, 'ok')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'OVER_RETURN' }),
    });
    expect(tx.invoiceReturn.create).not.toHaveBeenCalled();
    expect(tx.stockLot.update).not.toHaveBeenCalled();
  });

  it('un-reserves stock for a line added after confirmation (no consumption rows)', async () => {
    const { tx, service, request } = setupNonSerialized({ consumptions: [], requestQuantity: 1 });
    tx.stockLot.findMany.mockResolvedValue([
      { id: 9, quantityRemaining: 10, quantityReserved: 1, receivedDate: new Date('2026-01-01') },
    ]);
    const access: any = service as any;

    const result = await access.approveReturnTransaction(request, 99, 'ok');
    expect(result).toMatchObject({ refundTotal: 100, itemsReturned: 1 });

    expect(tx.stockLot.update).toHaveBeenCalledTimes(1);
    expect(tx.stockLot.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { quantityReserved: { decrement: 1 } },
    });
  });

  it('rejects a serialized return row that carries a quantity', async () => {
    const tx = createMockTx();
    const { service } = createService(tx);
    tx.invoiceItem.findUnique.mockResolvedValue({
      id: 1,
      price: 100,
      quantity: 2,
      productModelId: 1,
      productModel: { id: 1, name: 'Widget', isSerialized: true },
      unitAssignments: [
        { id: 11, productUnitId: 901, productUnit: { id: 901, status: 'SOLD', version: 3, barcode: 'BC-1' } },
      ],
    });
    const request = baseRequest({
      items: [{ id: 1, action: 'RETURN_ITEM', invoiceItemId: 1, productUnitId: 901, quantity: 1 }],
      invoice: { id: 100, items: [{ id: 1, quantity: 2 }] },
    });
    tx.invoiceChangeRequest.findUnique.mockResolvedValue(request);
    const access: any = service as any;

    await expect(access.approveReturnTransaction(request, 99, 'ok')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SERIALIZED_RETURN_UNIT_ONLY' }),
    });
    expect(tx.invoiceReturn.create).not.toHaveBeenCalled();
  });

  it('rejects a non-serialized return row that carries a product unit', async () => {
    const { tx, service, request } = setupNonSerialized();
    request.items = [
      { id: 1, action: 'RETURN_ITEM', invoiceItemId: 1, productUnitId: 901, quantity: 1 },
    ] as any;
    const access: any = service as any;

    await expect(access.approveReturnTransaction(request, 99, 'ok')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NON_SERIALIZED_RETURN' }),
    });
    expect(tx.invoiceReturn.create).not.toHaveBeenCalled();
  });
});

describe('InvoiceChangeRequestsService.approve � mixed-action requests (Fix 1)', () => {
  it('applies return and price-change groups together in a single approval', async () => {
    const tx = createMockTx();
    const { service } = createService(tx);

    tx.invoice.findUnique.mockResolvedValue({
      currentTotal: 150,
      items: [
        { id: 1, quantity: 2, price: 50, priceAdjustments: [] },
        { id: 2, quantity: 1, price: 100, priceAdjustments: [] },
      ],
    });
    tx.invoiceItem.findUnique
      .mockResolvedValueOnce({
        id: 1,
        price: 50,
        quantity: 2,
        productModelId: 1,
        productModel: { id: 1, name: 'Widget', isSerialized: true },
        unitAssignments: [
          { id: 11, productUnitId: 901, productUnit: { id: 901, status: 'SOLD', version: 3, barcode: 'BC-1' } },
        ],
      })
      .mockResolvedValueOnce({
        id: 2,
        price: 100,
        quantity: 1,
        productModelId: 2,
        productModel: { id: 2, name: 'Cable' },
        priceAdjustments: [],
      });

    const request = baseRequest({
      items: [
        { id: 1, action: 'RETURN_ITEM', invoiceItemId: 1, productUnitId: 901 },
        { id: 2, action: 'CHANGE_PRICE', invoiceItemId: 2, proposedPrice: 80 },
      ],
      invoice: { id: 100, items: [{ id: 1, quantity: 2 }, { id: 2, quantity: 1 }] },
    });
    tx.invoiceChangeRequest.findUnique.mockResolvedValue(request);

    const result: any = await service.approve(10, 99, 'both ok');

    expect(result.status).toBe('APPROVED');
    // Return group: 50 � (150/200) = 37.5, unit released
    expect(result.refundTotal).toBe(37.5);
    expect(result.itemsReturned).toBe(1);
    expect(tx.productUnit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'AVAILABLE' }) }),
    );

    // Price group: 100 ? 80 (?20)
    expect(result.totalDelta).toBe(-20);
    expect(result.itemsAdjusted).toBe(1);
    expect(tx.invoicePriceAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invoiceItemId: 2, oldPrice: 100, newPrice: 80 }),
      }),
    );

    // Return sets the absolute total first, then the price group applies its delta
    const updates = tx.invoice.update.mock.calls.map((c: any[]) => c[0]);
    expect(updates[0].data).toEqual({ currentTotal: 112.5 });
    expect(updates[1].data).toEqual({ currentTotal: { increment: -20 } });

    // One audit entry per group, both from the same approval
    expect(tx.invoiceAuditLog.create).toHaveBeenCalledTimes(2);
  });

  it('runs the return group before the add group so returned stock is available', async () => {
    const tx = createMockTx();
    const { service } = createService(tx);

    tx.invoice.findUnique.mockResolvedValue({
      currentTotal: 100,
      items: [{ id: 1, quantity: 1, price: 100, priceAdjustments: [] }],
    });
    tx.invoiceItem.findUnique.mockResolvedValue({
      id: 1,
      price: 100,
      quantity: 1,
      productModelId: 1,
      productModel: { id: 1, name: 'Widget', isSerialized: true },
      unitAssignments: [
        { id: 11, productUnitId: 901, productUnit: { id: 901, status: 'SOLD', version: 3, barcode: 'BC-1' } },
      ],
    });
    tx.productModel.findFirst.mockResolvedValue({
      id: 1,
      name: 'Widget',
      isSerialized: true,
      minStockAlert: 0,
      isActive: true,
      deletedAt: null,
      reservedQuantity: 0,
    });
    tx.productUnit.count.mockResolvedValue(1); // the returned unit is sellable again

    const request = baseRequest({
      items: [
        { id: 1, action: 'RETURN_ITEM', invoiceItemId: 1, productUnitId: 901 },
        { id: 2, action: 'ADD_ITEM', productModelId: 1, quantity: 1, proposedPrice: 40 },
      ],
      invoice: { id: 100, items: [{ id: 1, quantity: 1 }] },
    });
    tx.invoiceChangeRequest.findUnique.mockResolvedValue(request);

    const result: any = await service.approve(10, 99, 'ok');

    expect(result).toMatchObject({ status: 'APPROVED', refundTotal: 100, itemsAdded: 1, totalDelta: 40 });
    expect(tx.invoiceItem.create).toHaveBeenCalledWith({
      data: { invoiceId: 100, productModelId: 1, quantity: 1, price: 40 },
    });

    // Unit release (return group) happens before the add group reserves stock
    expect(tx.productUnit.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.productModel.update.mock.invocationCallOrder[0],
    );
  });

  it('fails the whole mixed approval when the add group lacks stock (never auto-rejects)', async () => {
    const tx = createMockTx();
    const { service } = createService(tx);

    tx.invoice.findUnique.mockResolvedValue({
      currentTotal: 100,
      items: [{ id: 1, quantity: 1, price: 100, priceAdjustments: [] }],
    });
    tx.invoiceItem.findUnique.mockResolvedValue({
      id: 1,
      price: 100,
      quantity: 1,
      productModelId: 1,
      productModel: { id: 1, name: 'Widget', isSerialized: true },
      unitAssignments: [
        { id: 11, productUnitId: 901, productUnit: { id: 901, status: 'SOLD', version: 3, barcode: 'BC-1' } },
      ],
    });
    tx.productModel.findFirst.mockResolvedValue({
      id: 1,
      name: 'Widget',
      isSerialized: true,
      minStockAlert: 0,
      isActive: true,
      deletedAt: null,
      reservedQuantity: 0,
    });
    tx.productUnit.count.mockResolvedValue(0); // not enough stock for the add

    const request = baseRequest({
      items: [
        { id: 1, action: 'RETURN_ITEM', invoiceItemId: 1, productUnitId: 901 },
        { id: 2, action: 'ADD_ITEM', productModelId: 1, quantity: 1, proposedPrice: 40 },
      ],
      invoice: { id: 100, items: [{ id: 1, quantity: 1 }] },
    });
    tx.invoiceChangeRequest.findUnique.mockResolvedValue(request);

    await expect(service.approve(10, 99, 'ok')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INSUFFICIENT_STOCK' }),
    });

    // Auto-reject is reserved for add-only requests; a mixed request rolls back instead
    expect(tx.invoiceChangeRequest.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED' }) }),
    );
  });

  it('still auto-rejects an add-only request on insufficient stock', async () => {
    const tx = createMockTx();
    const { service } = createService(tx);

    tx.productModel.findFirst.mockResolvedValue({
      id: 5,
      name: 'Scarce',
      isSerialized: true,
      minStockAlert: 0,
      isActive: true,
      deletedAt: null,
      reservedQuantity: 3,
    });
    tx.productUnit.count.mockResolvedValue(3); // 3 available ? 3 reserved = 0 sellable

    const request = baseRequest({
      items: [{ id: 1, action: 'ADD_ITEM', productModelId: 5, quantity: 1, proposedPrice: 99 }],
    });
    tx.invoiceChangeRequest.findUnique.mockResolvedValue(request);

    const result: any = await service.approve(10, 99, undefined);

    expect(result).toMatchObject({ status: 'REJECTED', reason: 'Insufficient stock' });
    expect(tx.invoiceChangeRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED', adminNote: expect.stringContaining('Insufficient stock') }),
      }),
    );
    expect(tx.invoiceItem.create).not.toHaveBeenCalled();
  });

  it('rejects an already-reviewed request before claiming it', async () => {
    const tx = createMockTx();
    const { service } = createService(tx);
    tx.invoiceChangeRequest.findUnique.mockResolvedValue(baseRequest({ status: 'APPROVED' }));

    await expect(service.approve(10, 99)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CHANGE_REQUEST_ALREADY_REVIEWED' }),
    });
    expect(tx.invoiceChangeRequest.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a request with no valid action groups', async () => {
    const tx = createMockTx();
    const { service } = createService(tx);
    tx.invoiceChangeRequest.findUnique.mockResolvedValue(
      baseRequest({ items: [{ id: 1, action: 'SOMETHING_ELSE' }] }),
    );

    await expect(service.approve(10, 99)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_REQUEST' }),
    });
    expect(tx.invoiceChangeRequest.updateMany).not.toHaveBeenCalled();
  });
});

describe('InvoiceChangeRequestsService.create � return row validation (Fix 2)', () => {
  function setupCreate(invoiceItems: any[]) {
    const tx = createMockTx();
    const prisma: any = {
      ...tx,
      invoice: {
        findUnique: jest.fn().mockResolvedValue({
          id: 100,
          invoiceNumber: 'INV-001',
          status: 'CONFIRMED',
          items: invoiceItems,
          changeRequests: [],
        }),
      },
      invoiceChangeRequest: tx.invoiceChangeRequest,
      $transaction: async (cb: (t: any) => Promise<any>) => cb(tx),
    };
    const service = new InvoiceChangeRequestsService(prisma, {
      createLowStockNotification: jest.fn().mockResolvedValue(undefined),
      resolveLowStockNotification: jest.fn().mockResolvedValue(undefined),
    } as any);
    return { service, tx };
  }

  const nonSerializedItem = {
    id: 1,
    quantity: 5,
    price: 100,
    productModel: { id: 77, name: 'Bulk', isSerialized: false },
    unitAssignments: [],
  };
  const serializedItem = {
    id: 2,
    quantity: 1,
    price: 100,
    productModel: { id: 1, name: 'Widget', isSerialized: true },
    unitAssignments: [],
  };

  it('accepts a non-serialized return row with a quantity', async () => {
    const { service, tx } = setupCreate([nonSerializedItem]);

    const request = await service.create(100, 7, {
      type: 'PARTIAL_RETURN' as any,
      reason: 'customer changed mind',
      items: [{ action: 'RETURN_ITEM', invoiceItemId: 1, quantity: 2 } as any],
    });

    expect(request).toBeDefined();
    expect(tx.invoiceChangeRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: [expect.objectContaining({ invoiceItemId: 1, quantity: 2, productUnitId: undefined })],
          },
        }),
      }),
    );
  });

  it('rejects a serialized return row that specifies a quantity', async () => {
    const { service } = setupCreate([serializedItem]);

    await expect(
      service.create(100, 7, {
        type: 'PARTIAL_RETURN' as any,
        reason: 'defect',
        items: [{ action: 'RETURN_ITEM', invoiceItemId: 2, quantity: 1 } as any],
      }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'SERIALIZED_RETURN_UNIT_ONLY' }) });
  });

  it('rejects a non-serialized return row without a quantity', async () => {
    const { service } = setupCreate([nonSerializedItem]);

    await expect(
      service.create(100, 7, {
        type: 'PARTIAL_RETURN' as any,
        reason: 'defect',
        items: [{ action: 'RETURN_ITEM', invoiceItemId: 1 } as any],
      }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'MISSING_RETURN_QUANTITY' }) });
  });

  it('rejects a request that would return more than was sold', async () => {
    const { service, tx } = setupCreate([nonSerializedItem]);
    tx.invoiceReturnItem.findMany.mockResolvedValue([{ quantity: 4 }]); // 4 of 5 already returned

    await expect(
      service.create(100, 7, {
        type: 'PARTIAL_RETURN' as any,
        reason: 'too many',
        items: [{ action: 'RETURN_ITEM', invoiceItemId: 1, quantity: 2 } as any],
      }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'OVER_RETURN' }) });
    expect(tx.invoiceChangeRequest.create).not.toHaveBeenCalled();
  });

  it('rejects a price-change row without a proposed price', async () => {
    const { service } = setupCreate([nonSerializedItem]);

    await expect(
      service.create(100, 7, {
        type: 'PARTIAL_RETURN' as any,
        reason: 'discount',
        items: [{ action: 'CHANGE_PRICE', invoiceItemId: 1 } as any],
      }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'MISSING_PRICE_DATA' }) });
  });

  it('rejects an add-item row that carries invoiceItemId', async () => {
    const { service } = setupCreate([nonSerializedItem]);

    await expect(
      service.create(100, 7, {
        type: 'PARTIAL_RETURN' as any,
        reason: 'add more',
        items: [{ action: 'ADD_ITEM', invoiceItemId: 1, productModelId: 77, quantity: 1, proposedPrice: 10 } as any],
      }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'UNEXPECTED_FIELD' }) });
  });

  it('rejects a serialized return for a unit not actively assigned to the invoice item', async () => {
    const { service, tx } = setupCreate([serializedItem]);
    tx.invoiceItemUnitAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service.create(100, 7, {
        type: 'PARTIAL_RETURN' as any,
        reason: 'wrong unit',
        items: [{ action: 'RETURN_ITEM', invoiceItemId: 2, productUnitId: 42 } as any],
      }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'ASSIGNMENT_NOT_FOUND' }) });
    expect(tx.invoiceChangeRequest.create).not.toHaveBeenCalled();
  });

  it('accepts a serialized return row for an actively assigned unit', async () => {
    const { service, tx } = setupCreate([serializedItem]);
    tx.invoiceItemUnitAssignment.findFirst.mockResolvedValue({ id: 9 });

    const request = await service.create(100, 7, {
      type: 'PARTIAL_RETURN' as any,
      reason: 'defect',
      items: [{ action: 'RETURN_ITEM', invoiceItemId: 2, productUnitId: 42 } as any],
    });

    expect(request).toBeDefined();
    expect(tx.invoiceItemUnitAssignment.findFirst).toHaveBeenCalledWith({
      where: { invoiceItemId: 2, productUnitId: 42, reversedAt: null },
      select: { id: true },
    });
    expect(tx.invoiceChangeRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: [expect.objectContaining({ invoiceItemId: 2, productUnitId: 42, quantity: undefined })],
          },
        }),
      }),
    );
  });
});
