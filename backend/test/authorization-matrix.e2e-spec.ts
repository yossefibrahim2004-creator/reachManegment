import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(30000);

describe('Authorization and IDOR matrix', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};
  let foreignSalesId: number;
  let foreignInvoiceId: number;
  let foreignChangeRequestId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash('sales123');
    const foreignSales = await prisma.employee.create({
      data: {
        name: 'Foreign Sales',
        username: `foreign-sales-${Date.now()}`,
        passwordHash,
        role: 'SALES',
        isActive: true,
      },
    });
    foreignSalesId = foreignSales.id;

    const customer = await prisma.customer.create({
      data: { name: 'Authorization Customer', type: 'INDIVIDUAL', isActive: true },
    });
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `AUTH-${Date.now()}`,
        customerId: customer.id,
        employeeId: foreignSalesId,
        status: 'CONFIRMED',
        originalTotal: 100,
        currentTotal: 100,
      },
    });
    foreignInvoiceId = invoice.id;
    const changeRequest = await prisma.invoiceChangeRequest.create({
      data: {
        invoiceId: foreignInvoiceId,
        requestedByEmployeeId: foreignSalesId,
        type: 'EDIT',
        reason: 'Authorization test request',
      },
    });
    foreignChangeRequestId = changeRequest.id;

    const login = async (username: string, password: string) => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password })
        .expect(201);
      return response.body.accessToken as string;
    };

    tokens.sales = await login('testsales', 'sales123');
    tokens.accountant = await login('testaccountant', 'accountant123');
    tokens.inventory = await login('testinventory', 'inventory123');
    tokens.admin = await login('testadmin', 'admin123');
  });

  afterAll(async () => {
    await prisma.invoiceChangeRequest.deleteMany({ where: { id: foreignChangeRequestId } });
    await prisma.invoice.deleteMany({ where: { id: foreignInvoiceId } });
    await prisma.customer.deleteMany({ where: { name: 'Authorization Customer' } });
    await prisma.employee.deleteMany({ where: { id: foreignSalesId } });
    await app.close();
  });

  it('enforces explicit role matrix for sensitive resource reads', async () => {
    await request(app.getHttpServer())
      .get('/api/product-units/inventory-count')
      .set('Authorization', `Bearer ${tokens.sales}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/stock-receipts')
      .set('Authorization', `Bearer ${tokens.accountant}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/change-requests')
      .set('Authorization', `Bearer ${tokens.accountant}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/invoices')
      .set('Authorization', `Bearer ${tokens.accountant}`)
      .expect(200);
  });

  it('prevents Sales from reading another Sales employee invoice and change request', async () => {
    await request(app.getHttpServer())
      .get(`/api/invoices/${foreignInvoiceId}`)
      .set('Authorization', `Bearer ${tokens.sales}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/invoices/${foreignInvoiceId}/audit-log`)
      .set('Authorization', `Bearer ${tokens.sales}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/change-requests/${foreignChangeRequestId}`)
      .set('Authorization', `Bearer ${tokens.sales}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/invoices')
      .set('Authorization', `Bearer ${tokens.sales}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.every((invoice: { employeeId: number }) => invoice.employeeId !== foreignSalesId)).toBe(true);
      });
  });

  it('allows the owning admin and authorized inventory workflow to read the foreign records', async () => {
    await request(app.getHttpServer())
      .get(`/api/invoices/${foreignInvoiceId}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/change-requests/${foreignChangeRequestId}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/invoices/${foreignInvoiceId}`)
      .set('Authorization', `Bearer ${tokens.inventory}`)
      .expect(200);
  });
});
