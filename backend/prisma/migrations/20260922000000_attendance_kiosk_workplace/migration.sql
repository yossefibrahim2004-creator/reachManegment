-- AlterEnum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ATTENDANCE_KIOSK';

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT', 'EARLY_LEAVE', 'OVERTIME');

-- CreateTable
CREATE TABLE "Workplace" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "radiusMeters" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workplace_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "workplaceId" INTEGER;

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN "workplaceId" INTEGER,
ADD COLUMN "kioskId" INTEGER,
ADD COLUMN "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
ADD COLUMN "checkInLatitude" DOUBLE PRECISION,
ADD COLUMN "checkInLongitude" DOUBLE PRECISION,
ADD COLUMN "checkOutLatitude" DOUBLE PRECISION,
ADD COLUMN "checkOutLongitude" DOUBLE PRECISION,
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Workplace_isActive_idx" ON "Workplace"("isActive");

-- CreateIndex
CREATE INDEX "Workplace_name_idx" ON "Workplace"("name");

-- CreateIndex
CREATE INDEX "Attendance_workplaceId_date_idx" ON "Attendance"("workplaceId", "date");

-- CreateIndex
CREATE INDEX "Attendance_kioskId_date_idx" ON "Attendance"("kioskId", "date");

-- CreateIndex
CREATE INDEX "Attendance_status_idx" ON "Attendance"("status");

-- Partial unique index: at most one open attendance record per employee
CREATE UNIQUE INDEX "Attendance_employeeId_open_key" ON "Attendance"("employeeId") WHERE "checkOut" IS NULL;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_workplaceId_fkey" FOREIGN KEY ("workplaceId") REFERENCES "Workplace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_workplaceId_fkey" FOREIGN KEY ("workplaceId") REFERENCES "Workplace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_kioskId_fkey" FOREIGN KEY ("kioskId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
