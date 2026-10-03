-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SALES', 'INVENTORY');

-- CreateEnum
CREATE TYPE "ProductUnitStatus" AS ENUM ('AVAILABLE', 'SOLD', 'DAMAGED');

-- CreateEnum
CREATE TYPE "StockReceiptStatus" AS ENUM ('FINALIZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- CreateEnum
CREATE TYPE "ChangeRequestType" AS ENUM ('EDIT', 'FULL_RETURN', 'PARTIAL_RETURN');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ChangeRequestItemAction" AS ENUM ('ADD_ITEM', 'REMOVE_ITEM', 'CHANGE_PRICE', 'RETURN_ITEM');

-- CreateEnum
CREATE TYPE "InvoiceAuditAction" AS ENUM ('CREATED', 'PRINTED', 'CHANGE_REQUEST_CREATED', 'CHANGE_REQUEST_APPROVED', 'CHANGE_REQUEST_REJECTED', 'PRICE_ADJUSTED', 'ITEM_ADDED', 'ITEM_RETURNED', 'FULL_RETURNED', 'PARTIAL_RETURNED');

-- CreateEnum
CREATE TYPE "ProductUnitAuditAction" AS ENUM ('RECEIVED', 'SOLD', 'RETURNED', 'MARKED_DAMAGED', 'RESTORED_AVAILABLE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LOW_STOCK', 'CHANGE_REQUEST', 'RETURN_APPROVED', 'RETURN_REJECTED', 'SYSTEM');

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductModel" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "minStockAlert" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductUnit" (
    "id" SERIAL NOT NULL,
    "productModelId" INTEGER NOT NULL,
    "barcode" TEXT NOT NULL,
    "status" "ProductUnitStatus" NOT NULL DEFAULT 'AVAILABLE',
    "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReceipt" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "status" "StockReceiptStatus" NOT NULL DEFAULT 'FINALIZED',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReceiptItem" (
    "id" SERIAL NOT NULL,
    "stockReceiptId" INTEGER NOT NULL,
    "productUnitId" INTEGER NOT NULL,

    CONSTRAINT "StockReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" SERIAL NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "originalTotal" DECIMAL(18,2) NOT NULL,
    "currentTotal" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "productUnitId" INTEGER NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicePriceAdjustment" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "invoiceItemId" INTEGER NOT NULL,
    "requestedById" INTEGER NOT NULL,
    "approvedById" INTEGER NOT NULL,
    "oldPrice" DECIMAL(18,2) NOT NULL,
    "newPrice" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" INTEGER,

    CONSTRAINT "InvoicePriceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceReturn" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "requestedById" INTEGER NOT NULL,
    "approvedById" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refundTotal" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" INTEGER,

    CONSTRAINT "InvoiceReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceReturnItem" (
    "id" SERIAL NOT NULL,
    "invoiceReturnId" INTEGER NOT NULL,
    "invoiceItemId" INTEGER NOT NULL,
    "productUnitId" INTEGER NOT NULL,
    "refundAmount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "InvoiceReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceChangeRequest" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "requestedByEmployeeId" INTEGER NOT NULL,
    "type" "ChangeRequestType" NOT NULL,
    "reason" TEXT NOT NULL,
    "proposedCustomerId" INTEGER,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByAdminId" INTEGER,
    "reviewDate" TIMESTAMP(3),
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceChangeRequestItem" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "action" "ChangeRequestItemAction" NOT NULL,
    "invoiceItemId" INTEGER,
    "productUnitId" INTEGER,
    "proposedPrice" DECIMAL(18,2),
    "notes" TEXT,

    CONSTRAINT "InvoiceChangeRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceAuditLog" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "action" "InvoiceAuditAction" NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB,

    CONSTRAINT "InvoiceAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductUnitAuditLog" (
    "id" SERIAL NOT NULL,
    "productUnitId" INTEGER NOT NULL,
    "action" "ProductUnitAuditAction" NOT NULL,
    "invoiceId" INTEGER,
    "employeeId" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "metadata" JSONB,

    CONSTRAINT "ProductUnitAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemAuditLog" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "SystemAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "refreshToken" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3),
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "dedupeKey" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceSequence" (
    "id" INTEGER NOT NULL,
    "currentNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "businessName" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "logoUrl" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Cairo',
    "invoicePrefix" TEXT NOT NULL DEFAULT 'INV',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Category_isActive_idx" ON "Category"("isActive");

-- CreateIndex
CREATE INDEX "ProductModel_categoryId_isActive_idx" ON "ProductModel"("categoryId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProductModel_categoryId_name_key" ON "ProductModel"("categoryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ProductUnit_barcode_key" ON "ProductUnit"("barcode");

-- CreateIndex
CREATE INDEX "ProductUnit_productModelId_status_idx" ON "ProductUnit"("productModelId", "status");

-- CreateIndex
CREATE INDEX "ProductUnit_status_idx" ON "ProductUnit"("status");

-- CreateIndex
CREATE INDEX "ProductUnit_barcode_idx" ON "ProductUnit"("barcode");

-- CreateIndex
CREATE INDEX "StockReceipt_date_idx" ON "StockReceipt"("date");

-- CreateIndex
CREATE INDEX "StockReceipt_employeeId_date_idx" ON "StockReceipt"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StockReceiptItem_productUnitId_key" ON "StockReceiptItem"("productUnitId");

-- CreateIndex
CREATE INDEX "StockReceiptItem_stockReceiptId_idx" ON "StockReceiptItem"("stockReceiptId");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_isActive_idx" ON "Customer"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_date_idx" ON "Invoice"("date");

-- CreateIndex
CREATE INDEX "Invoice_employeeId_date_idx" ON "Invoice"("employeeId", "date");

-- CreateIndex
CREATE INDEX "Invoice_customerId_date_idx" ON "Invoice"("customerId", "date");

-- CreateIndex
CREATE INDEX "Invoice_invoiceNumber_idx" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceItem_productUnitId_idx" ON "InvoiceItem"("productUnitId");

-- CreateIndex
CREATE INDEX "InvoicePriceAdjustment_invoiceId_idx" ON "InvoicePriceAdjustment"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoicePriceAdjustment_invoiceItemId_idx" ON "InvoicePriceAdjustment"("invoiceItemId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceReturn_requestId_key" ON "InvoiceReturn"("requestId");

-- CreateIndex
CREATE INDEX "InvoiceReturn_invoiceId_createdAt_idx" ON "InvoiceReturn"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceReturnItem_invoiceReturnId_idx" ON "InvoiceReturnItem"("invoiceReturnId");

-- CreateIndex
CREATE INDEX "InvoiceReturnItem_productUnitId_idx" ON "InvoiceReturnItem"("productUnitId");

-- CreateIndex
CREATE INDEX "InvoiceChangeRequest_invoiceId_status_idx" ON "InvoiceChangeRequest"("invoiceId", "status");

-- CreateIndex
CREATE INDEX "InvoiceChangeRequest_status_createdAt_idx" ON "InvoiceChangeRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceChangeRequest_requestedByEmployeeId_createdAt_idx" ON "InvoiceChangeRequest"("requestedByEmployeeId", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceChangeRequestItem_requestId_idx" ON "InvoiceChangeRequestItem"("requestId");

-- CreateIndex
CREATE INDEX "InvoiceChangeRequestItem_invoiceItemId_idx" ON "InvoiceChangeRequestItem"("invoiceItemId");

-- CreateIndex
CREATE INDEX "InvoiceChangeRequestItem_productUnitId_idx" ON "InvoiceChangeRequestItem"("productUnitId");

-- CreateIndex
CREATE INDEX "InvoiceAuditLog_invoiceId_timestamp_idx" ON "InvoiceAuditLog"("invoiceId", "timestamp");

-- CreateIndex
CREATE INDEX "ProductUnitAuditLog_productUnitId_timestamp_idx" ON "ProductUnitAuditLog"("productUnitId", "timestamp");

-- CreateIndex
CREATE INDEX "ProductUnitAuditLog_invoiceId_idx" ON "ProductUnitAuditLog"("invoiceId");

-- CreateIndex
CREATE INDEX "SystemAuditLog_entityType_entityId_timestamp_idx" ON "SystemAuditLog"("entityType", "entityId", "timestamp");

-- CreateIndex
CREATE INDEX "SystemAuditLog_employeeId_timestamp_idx" ON "SystemAuditLog"("employeeId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_username_key" ON "Employee"("username");

-- CreateIndex
CREATE INDEX "Employee_role_isActive_idx" ON "Employee"("role", "isActive");

-- CreateIndex
CREATE INDEX "Employee_username_idx" ON "Employee"("username");

-- CreateIndex
CREATE INDEX "Attendance_employeeId_date_idx" ON "Attendance"("employeeId", "date");

-- CreateIndex
CREATE INDEX "ExpenseCategory_isActive_idx" ON "ExpenseCategory"("isActive");

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");

-- CreateIndex
CREATE INDEX "Expense_categoryId_date_idx" ON "Expense"("categoryId", "date");

-- CreateIndex
CREATE INDEX "Expense_employeeId_date_idx" ON "Expense"("employeeId", "date");

-- CreateIndex
CREATE INDEX "Notification_employeeId_isRead_createdAt_idx" ON "Notification"("employeeId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_type_resolvedAt_idx" ON "Notification"("type", "resolvedAt");

-- CreateIndex
CREATE INDEX "Notification_dedupeKey_idx" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_employeeId_dedupeKey_key" ON "Notification"("employeeId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_key_key" ON "IdempotencyKey"("key");

-- CreateIndex
CREATE INDEX "IdempotencyKey_employeeId_operation_createdAt_idx" ON "IdempotencyKey"("employeeId", "operation", "createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- AddForeignKey
ALTER TABLE "ProductModel" ADD CONSTRAINT "ProductModel_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnit" ADD CONSTRAINT "ProductUnit_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceiptItem" ADD CONSTRAINT "StockReceiptItem_stockReceiptId_fkey" FOREIGN KEY ("stockReceiptId") REFERENCES "StockReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceiptItem" ADD CONSTRAINT "StockReceiptItem_productUnitId_fkey" FOREIGN KEY ("productUnitId") REFERENCES "ProductUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_productUnitId_fkey" FOREIGN KEY ("productUnitId") REFERENCES "ProductUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePriceAdjustment" ADD CONSTRAINT "InvoicePriceAdjustment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePriceAdjustment" ADD CONSTRAINT "InvoicePriceAdjustment_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "InvoiceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePriceAdjustment" ADD CONSTRAINT "InvoicePriceAdjustment_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePriceAdjustment" ADD CONSTRAINT "InvoicePriceAdjustment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePriceAdjustment" ADD CONSTRAINT "InvoicePriceAdjustment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "InvoiceChangeRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceReturn" ADD CONSTRAINT "InvoiceReturn_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceReturn" ADD CONSTRAINT "InvoiceReturn_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "InvoiceChangeRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceReturnItem" ADD CONSTRAINT "InvoiceReturnItem_invoiceReturnId_fkey" FOREIGN KEY ("invoiceReturnId") REFERENCES "InvoiceReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceReturnItem" ADD CONSTRAINT "InvoiceReturnItem_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "InvoiceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceReturnItem" ADD CONSTRAINT "InvoiceReturnItem_productUnitId_fkey" FOREIGN KEY ("productUnitId") REFERENCES "ProductUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceChangeRequest" ADD CONSTRAINT "InvoiceChangeRequest_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceChangeRequest" ADD CONSTRAINT "InvoiceChangeRequest_requestedByEmployeeId_fkey" FOREIGN KEY ("requestedByEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceChangeRequest" ADD CONSTRAINT "InvoiceChangeRequest_proposedCustomerId_fkey" FOREIGN KEY ("proposedCustomerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceChangeRequest" ADD CONSTRAINT "InvoiceChangeRequest_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceChangeRequestItem" ADD CONSTRAINT "InvoiceChangeRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "InvoiceChangeRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceChangeRequestItem" ADD CONSTRAINT "InvoiceChangeRequestItem_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "InvoiceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceChangeRequestItem" ADD CONSTRAINT "InvoiceChangeRequestItem_productUnitId_fkey" FOREIGN KEY ("productUnitId") REFERENCES "ProductUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAuditLog" ADD CONSTRAINT "InvoiceAuditLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAuditLog" ADD CONSTRAINT "InvoiceAuditLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnitAuditLog" ADD CONSTRAINT "ProductUnitAuditLog_productUnitId_fkey" FOREIGN KEY ("productUnitId") REFERENCES "ProductUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnitAuditLog" ADD CONSTRAINT "ProductUnitAuditLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnitAuditLog" ADD CONSTRAINT "ProductUnitAuditLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemAuditLog" ADD CONSTRAINT "SystemAuditLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
