import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function cleanDatabase() {
  const tablenames = [
    'StockConsumption',
    'StockAdjustment',
    'InvoicePriceAdjustment',
    'InvoiceReturnItem',
    'InvoiceReturn',
    'InvoiceChangeRequestItem',
    'InvoiceChangeRequest',
    'InvoiceItemUnitAssignment',
    'InvoiceItem',
    'ProductUnitAuditLog',
    'InvoiceAuditLog',
    'Invoice',
    'StockReceiptItem',
    'StockLot',
    'StockReceipt',
    'ProductUnit',
    'ProductModel',
    'Category',
    'Supplier',
    'Customer',
    'Expense',
    'ExpenseCategory',
    'Attendance',
    'Notification',
    'IdempotencyKey',
    'SystemAuditLog',
    'Employee',
  ];

  for (const tablename of tablenames) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" RESTART IDENTITY CASCADE;`);
    } catch (e) {
      // Table might not exist or have different casing
    }
  }
}

async function createTestEmployees() {
  const adminHash = await argon2.hash('admin123');
  const accountantHash = await argon2.hash('accountant123');
  const salesHash = await argon2.hash('sales123');
  const inventoryHash = await argon2.hash('inventory123');

  await prisma.employee.createMany({
    data: [
      { name: 'Test Admin', username: 'testadmin', passwordHash: adminHash, role: 'ADMIN', isActive: true },
      { name: 'Test Accountant', username: 'testaccountant', passwordHash: accountantHash, role: 'ACCOUNTANT', isActive: true },
      { name: 'Test Sales', username: 'testsales', passwordHash: salesHash, role: 'SALES', isActive: true },
      { name: 'Test Inventory', username: 'testinventory', passwordHash: inventoryHash, role: 'INVENTORY', isActive: true },
    ],
  });
}

export default async function globalSetup() {
  await cleanDatabase();
  await createTestEmployees();
  await prisma.$disconnect();
}