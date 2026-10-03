import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EmployeesModule } from './employees/employees.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductModelsModule } from './product-models/product-models.module';
import { ProductUnitsModule } from './product-units/product-units.module';
import { StockReceiptsModule } from './stock-receipts/stock-receipts.module';
import { CustomersModule } from './customers/customers.module';
import { InvoicesModule } from './invoices/invoices.module';
import { InvoiceDeliveryModule } from './invoice-delivery/invoice-delivery.module';
import { InvoiceChangeRequestsModule } from './invoice-change-requests/invoice-change-requests.module';
import { ExpensesModule } from './expenses/expenses.module';
import { ExpenseCategoriesModule } from './expense-categories/expense-categories.module';
import { AttendanceModule } from './attendance/attendance.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SettingsModule } from './settings/settings.module';
import { AuditModule } from './audit/audit.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { StockItemsModule } from './stock-items/stock-items.module';
import { WorkplacesModule } from './workplaces/workplaces.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    EmployeesModule,
    WorkplacesModule,
    RealtimeModule,
    CategoriesModule,
    ProductModelsModule,
    ProductUnitsModule,
    StockReceiptsModule,
    SuppliersModule,
    StockItemsModule,
    CustomersModule,
    InvoicesModule,
    InvoiceDeliveryModule,
    InvoiceChangeRequestsModule,
    ExpensesModule,
    ExpenseCategoriesModule,
    AttendanceModule,
    DashboardModule,
    ReportsModule,
    NotificationsModule,
    SettingsModule,
    AuditModule,
  ],
})
export class AppModule {}
