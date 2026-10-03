import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(30000);

describe('Invoice Lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authTokens: Record<string, string> = {};

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    // Login all users (created in globalSetup)
    const login = async (username: string, password: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password })
        .expect(201);
      return res.body.accessToken;
    };

    authTokens.admin = await login('testadmin', 'admin123');
    authTokens.accountant = await login('testaccountant', 'accountant123');
    authTokens.sales = await login('testsales', 'sales123');
    authTokens.inventory = await login('testinventory', 'inventory123');

    // Create test data fresh for each test
    const category = await prisma.category.create({
      data: { name: 'Test Category', isActive: true },
    });

    const serializedModel = await prisma.productModel.create({
      data: {
        categoryId: category.id,
        name: 'Serialized Test Model',
        isSerialized: true,
        minStockAlert: 5,
        isActive: true,
      },
    });

    const nonSerializedModel = await prisma.productModel.create({
      data: {
        categoryId: category.id,
        name: 'Non-Serialized Test Model',
        isSerialized: false,
        minStockAlert: 5,
        isActive: true,
      },
    });

    const customer = await prisma.customer.create({
      data: {
        name: 'Test Customer',
        type: 'INDIVIDUAL',
        phone: '+201000000000',
        isActive: true,
      },
    });

    const supplier = await prisma.supplier.create({
      data: {
        name: 'Test Supplier',
        phone: '+202000000000',
        address: 'Test Address',
        isActive: true,
      },
    });

    // Create serialized units with a per-test unique prefix so parallel retries do not collide.
    const uniqueStamp = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const units = [];
    for (let i = 1; i <= 5; i++) {
      const unit = await prisma.productUnit.create({
        data: {
          productModelId: serializedModel.id,
          barcode: `SER-${uniqueStamp}-${String(i).padStart(3, '0')}`,
          status: 'AVAILABLE',
          receivedDate: new Date(),
          purchasePrice: 1000,
        },
      });
      units.push(unit);
    }

    // Create non-serialized lot
    const receipt = await prisma.stockReceipt.create({
      data: {
        employeeId: 1,
        supplierId: supplier.id,
        status: 'PRICED',
        pricedByEmployeeId: 1,
        pricedAt: new Date(),
        date: new Date(),
      },
    });

    const lot = await prisma.stockLot.create({
      data: {
        productModelId: nonSerializedModel.id,
        stockReceiptId: receipt.id,
        supplierId: supplier.id,
        quantityReceived: 20,
        quantityRemaining: 20,
        quantityReserved: 0,
        purchasePrice: 50,
        receivedDate: new Date(),
      },
    });

    // Store for test access
    (global as any).__testData = {
      category,
      serializedModel,
      nonSerializedModel,
      customer,
      supplier,
      units,
      lot,
    };
  });

  afterEach(async () => {
    // Clean up test data - using a simple truncate approach
    await prisma.stockConsumption.deleteMany();
    await prisma.stockAdjustment.deleteMany();
    await prisma.invoicePriceAdjustment.deleteMany();
    await prisma.invoiceReturnItem.deleteMany();
    await prisma.invoiceReturn.deleteMany();
    await prisma.invoiceChangeRequestItem.deleteMany();
    await prisma.invoiceChangeRequest.deleteMany();
    await prisma.invoiceItemUnitAssignment.deleteMany();
    await prisma.invoiceItem.deleteMany();
    await prisma.productUnitAuditLog.deleteMany();
    await prisma.invoiceAuditLog.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.stockReceiptItem.deleteMany();
    await prisma.stockLot.deleteMany();
    await prisma.stockReceipt.deleteMany();
    await prisma.productUnit.deleteMany();
    await prisma.productModel.deleteMany();
    await prisma.category.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.expense.deleteMany();
    await prisma.expenseCategory.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  const getTestData = () => (global as any).__testData;

  describe('Serialized Invoice Flow', () => {
    it('should create invoice with serialized items (PENDING_ACCOUNTANT)', async () => {
      const testData = getTestData();
      const res = await request(app.getHttpServer())
        .post('/api/invoices')
        .set('Authorization', `Bearer ${authTokens.sales}`)
        .send({
          customerId: testData.customer.id,
          paymentType: 'CASH',
          items: [
            { productModelId: testData.serializedModel.id, quantity: 1, price: 1500 },
            { productModelId: testData.serializedModel.id, quantity: 1, price: 1600 },
          ],
        })
        .expect(201);

      expect(res.body.invoiceNumber).toMatch(/^INV-\d{6}$/);
      expect(res.body.status).toBe('PENDING_ACCOUNTANT');

      // Serialized sales reserve quantity on the product pool; physical units
      // remain AVAILABLE until inventory scans them for delivery.
      const unit1 = await prisma.productUnit.findUnique({ where: { id: testData.units[0].id } });
      const unit2 = await prisma.productUnit.findUnique({ where: { id: testData.units[1].id } });
      expect(unit1!.status).toBe('AVAILABLE');
      expect(unit2!.status).toBe('AVAILABLE');
      const model = await prisma.productModel.findUnique({ where: { id: testData.serializedModel.id } });
      expect(model!.reservedQuantity).toBe(2);
    });

    it('should return the original invoice for a duplicate idempotency key', async () => {
      const testData = getTestData();
      const idempotencyKey = 'test-idempotency-key-123';

      // First request
      await request(app.getHttpServer())
        .post('/api/invoices')
        .set('Authorization', `Bearer ${authTokens.sales}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          customerId: testData.customer.id,
          paymentType: 'CASH',
          items: [{ productModelId: testData.serializedModel.id, quantity: 1, price: 1500 }],
        })
        .expect(201);

      // Second request with same key
      const res = await request(app.getHttpServer())
        .post('/api/invoices')
        .set('Authorization', `Bearer ${authTokens.sales}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          customerId: testData.customer.id,
          paymentType: 'CASH',
          items: [{ productModelId: testData.serializedModel.id, quantity: 1, price: 1500 }],
        })
        .expect(201);

      // Should return same invoice
      expect(res.body.invoiceNumber).toMatch(/^INV-\d{6}$/);

      // Verify only one invoice exists
      const invoices = await prisma.invoice.findMany();
      expect(invoices.length).toBe(1);
    });

    it('should confirm, scan, and deliver serialized invoice', async () => {
      const testData = getTestData();
      // Create invoice
      const createRes = await request(app.getHttpServer())
        .post('/api/invoices')
        .set('Authorization', `Bearer ${authTokens.sales}`)
        .send({
          customerId: testData.customer.id,
          paymentType: 'CASH',
          items: [{ productModelId: testData.serializedModel.id, quantity: 1, price: 1500 }],
        })
        .expect(201);

      const invoiceId = createRes.body.id;

      // Confirm as accountant
      await request(app.getHttpServer())
        .patch(`/api/invoices/${invoiceId}/confirm`)
        .set('Authorization', `Bearer ${authTokens.accountant}`)
        .expect(200);

      // Verify invoice is CONFIRMED
      const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
      expect(invoice!.status).toBe('CONFIRMED');

      // Confirmation keeps the unit pool reserved until inventory scans a unit.
      const unit = await prisma.productUnit.findUnique({ where: { id: testData.units[0].id } });
      expect(unit!.status).toBe('AVAILABLE');

      await request(app.getHttpServer())
        .post(`/api/invoices/${invoiceId}/delivery/scan`)
        .set('Authorization', `Bearer ${authTokens.inventory}`)
        .send({ barcode: testData.units[0].barcode })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/invoices/${invoiceId}/deliver`)
        .set('Authorization', `Bearer ${authTokens.inventory}`)
        .expect(200);

      const deliveredUnit = await prisma.productUnit.findUnique({ where: { id: testData.units[0].id } });
      expect(deliveredUnit!.status).toBe('SOLD');

      // Verify costAtSale is set
      const invoiceItem = await prisma.invoiceItem.findFirst({ where: { invoiceId } });
      expect(Number(invoiceItem!.costAtSale)).toBe(1000);
    });

    it('should reject invoice (Accountant) - releases reservation', async () => {
      const testData = getTestData();
      // Create invoice
      const createRes = await request(app.getHttpServer())
        .post('/api/invoices')
        .set('Authorization', `Bearer ${authTokens.sales}`)
        .send({
          customerId: testData.customer.id,
          paymentType: 'CASH',
          items: [{ productModelId: testData.serializedModel.id, quantity: 1, price: 1500 }],
        })
        .expect(201);

      const invoiceId = createRes.body.id;

      // Reject as accountant
      await request(app.getHttpServer())
        .patch(`/api/invoices/${invoiceId}/reject`)
        .set('Authorization', `Bearer ${authTokens.accountant}`)
        .send({ reason: 'Price mismatch' })
        .expect(200);

      // Verify invoice is CANCELLED
      const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
      expect(invoice!.status).toBe('CANCELLED');
      expect(invoice!.rejectionReason).toBe('Price mismatch');

      // Verify unit is back to AVAILABLE
      const unit = await prisma.productUnit.findUnique({ where: { id: testData.units[0].id } });
      expect(unit!.status).toBe('AVAILABLE');
    });

    it('should deliver invoice (Inventory) - only after confirmed', async () => {
      const testData = getTestData();
      // Create and confirm invoice
      const createRes = await request(app.getHttpServer())
        .post('/api/invoices')
        .set('Authorization', `Bearer ${authTokens.sales}`)
        .send({
          customerId: testData.customer.id,
          paymentType: 'CASH',
          items: [{ productModelId: testData.serializedModel.id, quantity: 1, price: 1500 }],
        })
        .expect(201);

      const invoiceId = createRes.body.id;

      await request(app.getHttpServer())
        .patch(`/api/invoices/${invoiceId}/confirm`)
        .set('Authorization', `Bearer ${authTokens.accountant}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/invoices/${invoiceId}/delivery/scan`)
        .set('Authorization', `Bearer ${authTokens.inventory}`)
        .send({ barcode: testData.units[0].barcode })
        .expect(201);

      // Deliver as inventory
      await request(app.getHttpServer())
        .patch(`/api/invoices/${invoiceId}/deliver`)
        .set('Authorization', `Bearer ${authTokens.inventory}`)
        .expect(200);

      const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
      expect(invoice!.status).toBe('DELIVERED');
      expect(invoice!.deliveredByEmployeeId).toBeTruthy();
    });

    it('should fail to deliver unconfirmed invoice', async () => {
      const testData = getTestData();
      const createRes = await request(app.getHttpServer())
        .post('/api/invoices')
        .set('Authorization', `Bearer ${authTokens.sales}`)
        .send({
          customerId: testData.customer.id,
          paymentType: 'CASH',
          items: [{ productModelId: testData.serializedModel.id, quantity: 1, price: 1500 }],
        })
        .expect(201);

      const invoiceId = createRes.body.id;

      // Try to deliver without confirming
      await request(app.getHttpServer())
        .patch(`/api/invoices/${invoiceId}/deliver`)
        .set('Authorization', `Bearer ${authTokens.inventory}`)
        .expect(400);
    });
  });

  describe('Non-Serialized Invoice Flow with FIFO', () => {
    it('should create invoice with non-serialized items', async () => {
      const testData = getTestData();
      const res = await request(app.getHttpServer())
        .post('/api/invoices')
        .set('Authorization', `Bearer ${authTokens.sales}`)
        .send({
          customerId: testData.customer.id,
          paymentType: 'CASH',
          items: [
            { productModelId: testData.nonSerializedModel.id, quantity: 5, price: 100 },
          ],
        })
        .expect(201);

      expect(res.body.status).toBe('PENDING_ACCOUNTANT');

      // Verify lot quantityReserved increased
      const lot = await prisma.stockLot.findUnique({ where: { id: testData.lot.id } });
      expect(lot!.quantityReserved).toBe(5);
      expect(lot!.quantityRemaining).toBe(20);
    });

    it('should confirm non-serialized invoice - FIFO consumption creates StockConsumption records', async () => {
      const testData = getTestData();
      // Create invoice
      const createRes = await request(app.getHttpServer())
        .post('/api/invoices')
        .set('Authorization', `Bearer ${authTokens.sales}`)
        .send({
          customerId: testData.customer.id,
          paymentType: 'CASH',
          items: [{ productModelId: testData.nonSerializedModel.id, quantity: 5, price: 100 }],
        })
        .expect(201);

      const invoiceId = createRes.body.id;

      // Confirm
      await request(app.getHttpServer())
        .patch(`/api/invoices/${invoiceId}/confirm`)
        .set('Authorization', `Bearer ${authTokens.accountant}`)
        .expect(200);

      // Verify lot quantities updated
      const lot = await prisma.stockLot.findUnique({ where: { id: testData.lot.id } });
      expect(lot!.quantityRemaining).toBe(15);
      expect(lot!.quantityReserved).toBe(0);

      // Verify StockConsumption records created
      const consumptions = await prisma.stockConsumption.findMany({
        where: { invoiceItem: { invoiceId } },
      });
      expect(consumptions.length).toBe(1);
      expect(consumptions[0].quantity).toBe(5);
      expect(Number(consumptions[0].unitCost)).toBe(50);
      expect(Number(consumptions[0].totalCost)).toBe(250);

      // Verify invoiceItem costAtSale
      const invoiceItem = await prisma.invoiceItem.findFirst({ where: { invoiceId } });
      expect(Number(invoiceItem!.costAtSale)).toBe(50);
    });

    it('should handle multi-lot FIFO consumption', async () => {
      const testData = getTestData();
      // Create second lot with different price
      const receipt2 = await prisma.stockReceipt.create({
        data: {
          employeeId: 1,
          supplierId: testData.supplier.id,
          status: 'PRICED',
          pricedByEmployeeId: 1,
          pricedAt: new Date(),
          date: new Date(),
        },
      });

      const lot2 = await prisma.stockLot.create({
        data: {
          productModelId: testData.nonSerializedModel.id,
          stockReceiptId: receipt2.id,
          supplierId: testData.supplier.id,
          quantityReceived: 10,
          quantityRemaining: 10,
          quantityReserved: 0,
          purchasePrice: 60,
          receivedDate: new Date(),
        },
      });

      // Create invoice consuming more than first lot (25 total - 20 from first, 5 from second)
      const createRes = await request(app.getHttpServer())
        .post('/api/invoices')
        .set('Authorization', `Bearer ${authTokens.sales}`)
        .send({
          customerId: testData.customer.id,
          paymentType: 'CASH',
          items: [{ productModelId: testData.nonSerializedModel.id, quantity: 25, price: 100 }],
        })
        .expect(201);

      const invoiceId = createRes.body.id;

      await request(app.getHttpServer())
        .patch(`/api/invoices/${invoiceId}/confirm`)
        .set('Authorization', `Bearer ${authTokens.accountant}`)
        .expect(200);

      // Verify consumptions from both lots
      const consumptions = await prisma.stockConsumption.findMany({
        where: { invoiceItem: { invoiceId } },
        orderBy: { stockLot: { receivedDate: 'asc' } },
      });
      expect(consumptions.length).toBe(2);
      expect(consumptions[0].quantity).toBe(20); // from first lot (all 20)
      expect(consumptions[0].stockLotId).toBe(testData.lot.id);
      expect(consumptions[1].stockLotId).toBe(lot2.id);
      expect(Number(consumptions[0].unitCost)).toBe(50);
      expect(Number(consumptions[1].unitCost)).toBe(60);
    });

    it('should reject non-serialized invoice - releases reservation', async () => {
      const testData = getTestData();
      const createRes = await request(app.getHttpServer())
        .post('/api/invoices')
        .set('Authorization', `Bearer ${authTokens.sales}`)
        .send({
          customerId: testData.customer.id,
          paymentType: 'CASH',
          items: [{ productModelId: testData.nonSerializedModel.id, quantity: 5, price: 100 }],
        })
        .expect(201);

      const invoiceId = createRes.body.id;

      await request(app.getHttpServer())
        .patch(`/api/invoices/${invoiceId}/reject`)
        .set('Authorization', `Bearer ${authTokens.accountant}`)
        .send({ reason: 'Customer cancelled' })
        .expect(200);

      const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
      expect(invoice!.status).toBe('CANCELLED');

      const lot = await prisma.stockLot.findUnique({ where: { id: testData.lot.id } });
      expect(lot!.quantityReserved).toBe(0);
      expect(lot!.quantityRemaining).toBe(20);
    });
  });

  describe('Authorization', () => {
    it('should deny invoice creation for non-SALES roles', async () => {
      const testData = getTestData();
      await request(app.getHttpServer())
        .post('/api/invoices')
        .set('Authorization', `Bearer ${authTokens.accountant}`)
        .send({
          customerId: testData.customer.id,
          paymentType: 'CASH',
          items: [{ productModelId: testData.serializedModel.id, quantity: 1, price: 1500 }],
        })
        .expect(403);

      await request(app.getHttpServer())
        .post('/api/invoices')
        .set('Authorization', `Bearer ${authTokens.inventory}`)
        .send({
          customerId: testData.customer.id,
          paymentType: 'CASH',
          items: [{ productModelId: testData.serializedModel.id, quantity: 1, price: 1500 }],
        })
        .expect(403);
    });

    it('should deny invoice confirm for non-ACCOUNTANT/ADMIN roles', async () => {
      const testData = getTestData();
      const createRes = await request(app.getHttpServer())
        .post('/api/invoices')
        .set('Authorization', `Bearer ${authTokens.sales}`)
        .send({
          customerId: testData.customer.id,
          paymentType: 'CASH',
          items: [{ productModelId: testData.serializedModel.id, quantity: 1, price: 1500 }],
        })
        .expect(201);

      const invoiceId = createRes.body.id;

      await request(app.getHttpServer())
        .patch(`/api/invoices/${invoiceId}/confirm`)
        .set('Authorization', `Bearer ${authTokens.sales}`)
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/api/invoices/${invoiceId}/confirm`)
        .set('Authorization', `Bearer ${authTokens.inventory}`)
        .expect(403);
    });

    it('should deny invoice deliver for non-INVENTORY roles', async () => {
      const testData = getTestData();
      const createRes = await request(app.getHttpServer())
        .post('/api/invoices')
        .set('Authorization', `Bearer ${authTokens.sales}`)
        .send({
          customerId: testData.customer.id,
          paymentType: 'CASH',
          items: [{ productModelId: testData.serializedModel.id, quantity: 1, price: 1500 }],
        })
        .expect(201);

      const invoiceId = createRes.body.id;

      await request(app.getHttpServer())
        .patch(`/api/invoices/${invoiceId}/confirm`)
        .set('Authorization', `Bearer ${authTokens.accountant}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/invoices/${invoiceId}/deliver`)
        .set('Authorization', `Bearer ${authTokens.sales}`)
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/api/invoices/${invoiceId}/deliver`)
        .set('Authorization', `Bearer ${authTokens.accountant}`)
        .expect(403);
    });
  });

  describe('Concurrency', () => {
    it('should reserve serialized stock quantities concurrently', async () => {
      const testData = getTestData();
      // Two sales reserve quantity from the serialized product pool.
      const promises = [
        request(app.getHttpServer())
          .post('/api/invoices')
          .set('Authorization', `Bearer ${authTokens.sales}`)
          .send({
            customerId: testData.customer.id,
            paymentType: 'CASH',
            items: [{ productModelId: testData.serializedModel.id, quantity: 1, price: 1500 }],
          }),
        request(app.getHttpServer())
          .post('/api/invoices')
          .set('Authorization', `Bearer ${authTokens.sales}`)
          .send({
            customerId: testData.customer.id,
            paymentType: 'CASH',
            items: [{ productModelId: testData.serializedModel.id, quantity: 1, price: 1500 }],
          }),
      ];

      const results = await Promise.all(promises);
      const successCount = results.filter(r => r.status === 201).length;
      expect(successCount).toBe(2);

      const model = await prisma.productModel.findUnique({ where: { id: testData.serializedModel.id } });
      expect(model!.reservedQuantity).toBe(2);
    });
  });

  describe('Business Flow: invoice → stock → expense → reports', () => {
    it('should create an invoice, consume serialized stock, record expense and surface report totals', async () => {
      const testData = getTestData();
      const today = new Date().toISOString().slice(0, 10);

      const categoryRes = await request(app.getHttpServer())
        .post('/api/expense-categories')
        .set('Authorization', `Bearer ${authTokens.admin}`)
        .send({ name: 'Operations' })
        .expect(201);

      const invoiceRes = await request(app.getHttpServer())
        .post('/api/invoices')
        .set('Authorization', `Bearer ${authTokens.sales}`)
        .send({
          customerId: testData.customer.id,
          paymentType: 'CASH',
          items: [{ productModelId: testData.serializedModel.id, quantity: 1, price: 1500 }],
        })
        .expect(201);

      const invoiceId = invoiceRes.body.id;

      await request(app.getHttpServer())
        .patch(`/api/invoices/${invoiceId}/confirm`)
        .set('Authorization', `Bearer ${authTokens.accountant}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/invoices/${invoiceId}/delivery/scan`)
        .set('Authorization', `Bearer ${authTokens.inventory}`)
        .send({ barcode: testData.units[0].barcode })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/invoices/${invoiceId}/deliver`)
        .set('Authorization', `Bearer ${authTokens.inventory}`)
        .expect(200);

      const deliveredInvoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
      expect(deliveredInvoice!.status).toBe('DELIVERED');

      const expenseRes = await request(app.getHttpServer())
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authTokens.admin}`)
        .send({
          categoryId: categoryRes.body.id,
          amount: 250,
          date: today,
          description: 'Delivery fuel',
        })
        .expect(201);

      expect(Number(expenseRes.body.amount)).toBe(250);

      const [revenueRes, netProfitRes, expensesRes] = await Promise.all([
        request(app.getHttpServer())
          .get('/api/reports/revenue')
          .query({ from: today, to: today })
          .set('Authorization', `Bearer ${authTokens.admin}`)
          .expect(200),
        request(app.getHttpServer())
          .get('/api/reports/net-profit')
          .query({ from: today, to: today })
          .set('Authorization', `Bearer ${authTokens.admin}`)
          .expect(200),
        request(app.getHttpServer())
          .get('/api/reports/expenses')
          .query({ from: today, to: today })
          .set('Authorization', `Bearer ${authTokens.admin}`)
          .expect(200),
      ]);

      expect(revenueRes.body.invoiceCount).toBeGreaterThanOrEqual(1);
      expect(Number(revenueRes.body.originalSales)).toBeGreaterThanOrEqual(1500);
      expect(Number(revenueRes.body.netSales)).toBeGreaterThanOrEqual(1500);

      expect(Number(netProfitRes.body.netSales)).toBeGreaterThanOrEqual(1500);
      expect(Number(expensesRes.body.totalExpenses)).toBeGreaterThanOrEqual(250);
      expect(expensesRes.body.items.some((item: any) => item.categoryName === 'Operations')).toBe(true);
    });
  });
});