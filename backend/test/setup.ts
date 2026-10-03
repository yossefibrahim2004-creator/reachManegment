import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

export const testPrisma = prisma;

export async function cleanDatabase() {
  const tablenames = [
    'StockConsumption',
    'StockAdjustment',
    'InvoicePriceAdjustment',
    'InvoiceReturnItem',
    'InvoiceReturn',
    'InvoiceChangeRequestItem',
    'InvoiceChangeRequest',
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

export async function createTestEmployees() {
  const adminHash = await argon2.hash('admin123');
  const accountantHash = await argon2.hash('accountant123');
  const salesHash = await argon2.hash('sales123');
  const inventoryHash = await argon2.hash('inventory123');

  const admin = await prisma.employee.create({
    data: { name: 'Test Admin', username: 'testadmin', passwordHash: adminHash, role: 'ADMIN', isActive: true },
  });

  const accountant = await prisma.employee.create({
    data: { name: 'Test Accountant', username: 'testaccountant', passwordHash: accountantHash, role: 'ACCOUNTANT', isActive: true },
  });

  const sales = await prisma.employee.create({
    data: { name: 'Test Sales', username: 'testsales', passwordHash: salesHash, role: 'SALES', isActive: true },
  });

  const inventory = await prisma.employee.create({
    data: { name: 'Test Inventory', username: 'testinventory', passwordHash: inventoryHash, role: 'INVENTORY', isActive: true },
  });

  return { admin, accountant, sales, inventory };
}

export async function createTestCategory() {
  return prisma.category.create({
    data: { name: 'Test Category', isActive: true },
  });
}

export async function createTestProductModel(categoryId: number, isSerialized = true) {
  return prisma.productModel.create({
    data: {
      categoryId,
      name: isSerialized ? 'Serialized Test Model' : 'Non-Serialized Test Model',
      isSerialized,
      minStockAlert: 5,
      isActive: true,
    },
  });
}

export async function createTestCustomer() {
  return prisma.customer.create({
    data: {
      name: 'Test Customer',
      type: 'INDIVIDUAL',
      phone: '+201000000000',
      isActive: true,
    },
  });
}

export async function createTestSupplier() {
  return prisma.supplier.create({
    data: {
      name: 'Test Supplier',
      phone: '+202000000000',
      address: 'Test Address',
      isActive: true,
    },
  });
}

export async function createSerializedUnits(modelId: number, count: number, prefix = 'TEST') {
  const units = [];
  for (let i = 1; i <= count; i++) {
    const unit = await prisma.productUnit.create({
      data: {
        productModelId: modelId,
        barcode: `${prefix}-${String(i).padStart(3, '0')}`,
        status: 'AVAILABLE',
        receivedDate: new Date(),
        purchasePrice: 1000,
      },
    });
    units.push(unit);
  }
  return units;
}

export async function createNonSerializedLot(modelId: number, supplierId: number, quantity: number, purchasePrice = 50) {
  const receipt = await prisma.stockReceipt.create({
    data: {
      employeeId: 1,
      supplierId,
      status: 'PRICED',
      pricedByEmployeeId: 1,
      pricedAt: new Date(),
      date: new Date(),
    },
  });

  const lot = await prisma.stockLot.create({
    data: {
      productModelId: modelId,
      stockReceiptId: receipt.id,
      supplierId,
      quantityReceived: quantity,
      quantityRemaining: quantity,
      quantityReserved: 0,
      purchasePrice,
      receivedDate: new Date(),
    },
  });

  return { receipt, lot };
}