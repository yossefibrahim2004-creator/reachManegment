
import {
  PrismaClient,
  Role,
  ProductModel,
  UnitOfMeasure,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

/* ------------------------------------------------------------------ */
/*  Product catalog — Stocktake 28/9/2026                             */
/* ------------------------------------------------------------------ */

type SeedProduct = {
  category: string;
  name: string;
  isSerialized: boolean;
  quantity: number;
  unit: UnitOfMeasure;
};

/*
 * Serialized:
 * quantity = physical stocktake count.
 *
 * No ProductUnit is created here because real manufacturer barcodes
 * are required for serialized inventory.
 */
const s = (
  category: string,
  name: string,
  quantity: number,
): SeedProduct => ({
  category,
  name,
  isSerialized: true,
  quantity,
  unit: UnitOfMeasure.PIECE,
});

/*
 * Non-serialized:
 * quantity = physical stocktake count (in the product's unit of measure).
 */
const n = (
  category: string,
  name: string,
  quantity: number,
  unit: UnitOfMeasure = UnitOfMeasure.PIECE,
): SeedProduct => ({
  category,
  name,
  isSerialized: false,
  quantity,
  unit,
});

/* ------------------------------------------------------------------ */
/*  Stocktake — 28/9/2026                                             */
/* ------------------------------------------------------------------ */

const PRODUCTS: SeedProduct[] = [
  // ───── HST — Serialized ─────
  s('HST', 'لوحة اطفاء hst', 8),
  s('HST', 'لوحة 2 زون hst', 10),
  s('HST', 'لوحة 4 زون الاقتصادية hst', 9),
  s('HST', 'لوحة 8 زون الاقتصادية hst', 0),
  s('HST', 'لوحة 12 زون الاقتصادية hst', 0),
  s('HST', 'لوحة 16 زون الاقتصادية hst', 3),
  s('HST', 'لوحة 4 زون السيلفر hst', 7),
  s('HST', 'لوحة 8 زون السيلفر hst', 4),
  s('HST', 'لوحة 16 زون السيلفر hst', 5),

  // ───── HST — Non-Serialized ─────
  n('HST', 'كاسر hst', 72),
  n('HST', 'سرينة hst', 64),
  n('HST', 'جرس hst', 4),
  n('HST', 'حساس دخان تقليدي hst', 214),
  n('HST', 'حساس حرارة تقليدي hst', 0),
  n('HST', 'حساس متعدد تقليدي hst', 32),
  n('HST', 'لمبة بيان hst', 139),
  n('HST', 'حساس لهب hst', 8),
  n('HST', 'حساس غاز تقليدي hst', 7),
  n('HST', 'بيم hst', 8),
  n('HST', 'كاسر معنون hst', 20),
  n('HST', 'حساس دخان معنون hst', 202),
  n('HST', 'حساس حرارة معنون hst', 10),
  n('HST', 'حساس متعدد معنون hst', 10),
  n('HST', 'مونتور hst', 8),
  n('HST', 'كنترول hst', 1),
  n('HST', 'انترفيس hst', 4),
  n('HST', 'قاعدة hst', 550),

  // ───── HST — Serialized ─────
  s('HST', 'لوحة 1loop الاقتصادية hst', 2),
  s('HST', 'لوحة 2loop القتصادية hst', 0),
  s('HST', 'لوحة 2loop الحمرة hst', 2),
  s('HST', 'لوحة 4loop الحمرة hst', 0),

  // ───── كونفوي — Serialized ─────
  s('كونفوي', 'لوحة اطفاء كونفوي', 5),

  // ───── اسنوير ─────
  n('اسنوير', 'لوحة 4 زون اسنوير', 8),
  n('اسنوير', 'لوحة 8 زون اسنوير', 4),
  n('اسنوير', 'حساس دخان اسنوير', 171),
  n('اسنوير', 'حساس حرارة اسنوير', 76),
  n('اسنوير', 'كاسر اسنوير', 11),
  n('اسنوير', 'سرينة اسنوير', 13),
  n('اسنوير', 'جرس اسنوير', 9),

  // ───── صيني ─────
  n('صيني', 'كاسر صيني', 59),
  n('صيني', 'سرينة صيني', 150),
  n('صيني', 'جرس صيني 24 فولت', 31),
  n('صيني', 'جرس صيني 220 فولت', 19),
  n('صيني', 'لوحة 4 زون صيني', 8),
  n('صيني', 'بيم صيني', 8),
  n('صيني', 'ابورت صيني', 20),
  n('صيني', 'طفاية فاير سيرش 6 كيلو صيني', 0),
  n('صيني', 'طفاية فاير سيرش 2 كيلو صيني', 0),

  // ───── عام ─────
  // الكابل يُخزَّن ويُباع بالمتر: الكمية = عدد اللفات × طول اللفة
  n('عام', 'كابلات الومنيوم 500 متر', 0, UnitOfMeasure.METER),
  n('عام', 'كابلات نحاس 500 متر', 1500, UnitOfMeasure.METER),
  n('عام', 'لفة كابل الومنيوم 410 متر', 410, UnitOfMeasure.METER),
  n('عام', 'لفة كابل الومنيوم 85 متر', 85, UnitOfMeasure.METER),
  n('عام', 'لفة كابل الومنيوم 60 متر', 60, UnitOfMeasure.METER),
  n('عام', 'بطارية 2.3 امبير', 8),
  n('عام', 'بطارية 7 امبير', 30),

  // ───── تاندا ─────
  n('تاندا', 'بيم تاندا', 1),

  // ───── ATS ─────
  n('ATS', 'حساس حرارة تقليدي ats', 195),
  n('ATS', 'قاعدة ats', 195),

  // ───── ابولو ─────
  s('ابولو', 'لوحة اطفاء ابولو', 18),
  n('ابولو', 'لوحة 2 زون ابولو', 8),
  n('ابولو', 'لوحة 8 زون ابولو', 1),
  s('ابولو', 'لوحة 1لوب ابولو', 2),
  s('ابولو', 'لوحة 2 لوب ابولو', 1),
  n('ابولو', 'كاسر ابولو تقليدي', 13),
  n('ابولو', 'حساس دخان ابولو تقليدي', 111),
  n('ابولو', 'حساس حرارة ابولو تقليدي', 1),
  n('ابولو', 'قاعدة ابولو', 112),

  // ───── HLT ─────
  n('HLT', 'حساس دخان تقليدي hlt', 500),
];

/* ------------------------------------------------------------------ */
/*  Clean database                                                     */
/* ------------------------------------------------------------------ */

async function cleanDatabase() {
  await prisma.$transaction([
    prisma.stockConsumption.deleteMany(),
    prisma.stockAdjustment.deleteMany(),

    prisma.invoicePriceAdjustment.deleteMany(),

    prisma.invoiceReturnItem.deleteMany(),
    prisma.invoiceReturn.deleteMany(),

    prisma.invoiceChangeRequestItem.deleteMany(),
    prisma.invoiceChangeRequest.deleteMany(),

    prisma.invoiceItemUnitAssignment.deleteMany(),
    prisma.invoiceItem.deleteMany(),

    prisma.productUnitAuditLog.deleteMany(),
    prisma.invoiceAuditLog.deleteMany(),

    prisma.invoice.deleteMany(),

    prisma.stockReceiptItem.deleteMany(),
    prisma.stockLot.deleteMany(),
    prisma.stockReceipt.deleteMany(),

    prisma.productUnit.deleteMany(),
    prisma.productModel.deleteMany(),
    prisma.category.deleteMany(),

    prisma.supplier.deleteMany(),
    prisma.customer.deleteMany(),

    prisma.expense.deleteMany(),
    prisma.expenseCategory.deleteMany(),

    prisma.attendance.deleteMany(),
    prisma.notification.deleteMany(),

    prisma.idempotencyKey.deleteMany(),
    prisma.systemAuditLog.deleteMany(),

    prisma.employee.deleteMany(),
    prisma.workplace.deleteMany(),

    prisma.appSetting.deleteMany(),
    prisma.invoiceSequence.deleteMany(),
  ]);
}

/* ------------------------------------------------------------------ */
/*  Employees                                                          */
/* ------------------------------------------------------------------ */

async function seedEmployees() {
  console.log('  • Creating employees');

  const create = async (
    name: string,
    username: string,
    password: string,
    role: Role,
  ) =>
    prisma.employee.create({
      data: {
        name,
        username,
        passwordHash: await argon2.hash(password),
        role,
        isActive: true,
      },
    });

  const admin = await create(
    'System Admin',
    'admin',
    'admin123',
    Role.ADMIN,
  );

  const accountant = await create(
    'Accountant User',
    'accountant',
    'accountant123',
    Role.ACCOUNTANT,
  );

  const sales = await create(
    'Sales Representative',
    'sales',
    'sales123',
    Role.SALES,
  );

  const inventory = await create(
    'Inventory Manager',
    'inventory',
    'inventory123',
    Role.INVENTORY,
  );

  return {
    admin,
    accountant,
    sales,
    inventory,
  };
}

/* ------------------------------------------------------------------ */
/*  Attendance kiosk                                                   */
/* ------------------------------------------------------------------ */

async function createKiosk(workplaceId: number) {
  console.log('  • Creating attendance kiosk');

  const existing = await prisma.employee.findUnique({
    where: {
      username: 'kiosk1',
    },
  });

  if (existing) {
    return prisma.employee.update({
      where: {
        id: existing.id,
      },
      data: {
        workplaceId,
        role: Role.ATTENDANCE_KIOSK,
        isActive: true,
      },
    });
  }

  return prisma.employee.create({
    data: {
      name: 'Attendance Kiosk 1',
      username: 'kiosk1',
      passwordHash: await argon2.hash('kiosk123'),
      role: Role.ATTENDANCE_KIOSK,
      workplaceId,
      isActive: true,
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Categories                                                         */
/* ------------------------------------------------------------------ */

async function seedCategories() {
  console.log('  • Creating product categories');

  const names = [...new Set(PRODUCTS.map((p) => p.category))];

  return Promise.all(
    names.map((name) =>
      prisma.category.create({
        data: {
          name,
          isActive: true,
        },
      }),
    ),
  );
}

/* ------------------------------------------------------------------ */
/*  Product Models                                                     */
/* ------------------------------------------------------------------ */

type SeededProduct = {
  model: ProductModel;
  quantity: number;
};

async function seedProductModels(
  categories: Awaited<ReturnType<typeof seedCategories>>,
): Promise<SeededProduct[]> {
  console.log('  • Creating product models');

  const categoryMap = new Map(
    categories.map((category) => [category.name, category.id]),
  );

  const result: SeededProduct[] = [];

  for (const product of PRODUCTS) {
    const categoryId = categoryMap.get(product.category);

    if (!categoryId) {
      throw new Error(
        `Category "${product.category}" not found for "${product.name}"`,
      );
    }

    const model = await prisma.productModel.create({
      data: {
        categoryId,
        name: product.name,
        isSerialized: product.isSerialized,
        unit: product.unit,
        reservedQuantity: 0,
        minStockAlert: 0,
        isActive: true,
      },
    });

    result.push({
      model,
      quantity: product.quantity,
    });
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  console.log('========================================');
  console.log(' PALLET DATABASE SEED');
  console.log(' Stocktake: 28/9/2026');
  console.log('========================================\n');

  /* -------------------------------------------------------------- */
  /* Clean                                                            */
  /* -------------------------------------------------------------- */

  console.log('  • Cleaning existing database');

  await cleanDatabase();

  /* -------------------------------------------------------------- */
  /* Invoice sequence                                                  */
  /* -------------------------------------------------------------- */

  await prisma.invoiceSequence.upsert({
    where: {
      id: 1,
    },
    update: {},
    create: {
      id: 1,
      currentNumber: 0,
    },
  });

  /* -------------------------------------------------------------- */
  /* Workplace                                                         */
  /* -------------------------------------------------------------- */

  console.log('  • Creating workplace');

  const workplace = await prisma.workplace.upsert({
    where: {
      id: 1,
    },
    update: {},
    create: {
      id: 1,
      name: 'Main Branch',
      radiusMeters: 100,
      isActive: true,
    },
  });

  /* -------------------------------------------------------------- */
  /* Employees                                                         */
  /* -------------------------------------------------------------- */

  const staff = await seedEmployees();

  /* -------------------------------------------------------------- */
  /* Attendance kiosk                                                  */
  /* -------------------------------------------------------------- */

  await createKiosk(workplace.id);

  /* -------------------------------------------------------------- */
  /* Categories                                                        */
  /* -------------------------------------------------------------- */

  const categories = await seedCategories();

  /* -------------------------------------------------------------- */
  /* Products                                                          */
  /* -------------------------------------------------------------- */

  const products = await seedProductModels(categories);

  /* -------------------------------------------------------------- */
  /* Statistics                                                        */
  /* -------------------------------------------------------------- */

  const serializedProducts = products.filter(
    ({ model }) => model.isSerialized,
  );

  const nonSerializedProducts = products.filter(
    ({ model }) => !model.isSerialized,
  );

  const serializedPhysicalCount = serializedProducts.reduce(
    (total, product) => total + product.quantity,
    0,
  );

  const nonSerializedPhysicalCount = nonSerializedProducts.reduce(
    (total, product) => total + product.quantity,
    0,
  );

  /* -------------------------------------------------------------- */
  /* Result                                                            */
  /* -------------------------------------------------------------- */

  console.log('\n✔ Seed completed successfully\n');

  console.log('========================================');
  console.log('LOGIN ACCOUNTS');
  console.log('========================================');
  console.log('admin      / admin123');
  console.log('accountant / accountant123');
  console.log('sales      / sales123');
  console.log('inventory  / inventory123');
  console.log('kiosk1     / kiosk123');
  console.log('========================================\n');

  console.log('SEED DATA');
  console.log('========================================');
  console.log(
    `Employees:                 ${Object.keys(staff).length + 1}`,
  );
  console.log(`Categories:                ${categories.length}`);
  console.log(`Products:                  ${products.length}`);
  console.log(
    `Serialized models:         ${serializedProducts.length}`,
  );
  console.log(
    `Non-serialized models:     ${nonSerializedProducts.length}`,
  );
  console.log(
    `Serialized stock count:    ${serializedPhysicalCount}`,
  );
  console.log(
    `Non-serialized stock count: ${nonSerializedPhysicalCount}`,
  );
  console.log('Customers:                 0');
  console.log('Suppliers:                 0');
  console.log('========================================\n');

  console.log('Serialized stocktake:');

  for (const { model, quantity } of serializedProducts) {
    console.log(
      `  • ${model.name}: ${quantity}`,
    );
  }

  console.log('\nNon-serialized stocktake:');

  for (const { model, quantity } of nonSerializedProducts) {
    if (quantity > 0) {
      console.log(
        `  • ${model.name}: ${quantity}`,
      );
    }
  }

  console.log('\n========================================');
  console.log('NOTE');
  console.log('========================================');
  console.log(
    'Only employees and products/categories were seeded.',
  );
  console.log(
    'No customers were created.',
  );
  console.log(
    'No suppliers were created.',
  );
  console.log(
    'No opening StockLots were created.',
  );
  console.log(
    'Serialized quantities are stocktake reference counts.',
  );
  console.log(
    'ProductUnit records require real barcodes.',
  );
  console.log('========================================\n');
}

/* ------------------------------------------------------------------ */
/*  Execute                                                            */
/* ------------------------------------------------------------------ */

main()
  .catch((error) => {
    console.error('\n✖ Seed failed:\n');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

