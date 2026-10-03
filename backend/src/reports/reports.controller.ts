import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('revenue')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Revenue report' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  async revenue(
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reportsService.computeRevenue(from, to);
  }

  @Get('net-profit')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Net profit report' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  async netProfit(
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reportsService.computeNetProfit(from, to);
  }

  @Get('expenses')
  @Roles(Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Expenses report by category' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async expenses(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('categoryId') categoryId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reportsService.computeExpenses(
      from, to,
      categoryId ? Number(categoryId) : undefined,
      page ? Number(page) : 1,
      limit ? Number(limit) : 25,
    );
  }

  @Get('employees-sales')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Per-employee sales report' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async employeesSales(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('employeeId') employeeId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reportsService.computeEmployeesSales(
      from, to,
      employeeId ? Number(employeeId) : undefined,
      page ? Number(page) : 1,
      limit ? Number(limit) : 25,
    );
  }

  @Get('products-sales')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Per-product sales report' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'productModelId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async productsSales(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('categoryId') categoryId?: string,
    @Query('productModelId') productModelId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reportsService.computeProductsSales(
      from, to,
      categoryId ? Number(categoryId) : undefined,
      productModelId ? Number(productModelId) : undefined,
      page ? Number(page) : 1,
      limit ? Number(limit) : 25,
    );
  }

  @Get('returns')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Returns report' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async returns(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reportsService.computeReturns(
      from, to,
      employeeId ? Number(employeeId) : undefined,
      status,
      page ? Number(page) : 1,
      limit ? Number(limit) : 25,
    );
  }

  @Get('customers')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Customer report' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async customers(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('customerId') customerId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reportsService.computeCustomers(
      from, to,
      customerId ? Number(customerId) : undefined,
      page ? Number(page) : 1,
      limit ? Number(limit) : 25,
    );
  }

  @Get('customers/details')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Customer report full drill-down details' })
  async customerAllDetails(
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reportsService.getCustomerReportDetails(from, to, undefined);
  }

  @Get('customers/:customerId/details')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Customer report drill-down details' })
  async customerDetails(
    @Param('customerId') customerIdParam: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reportsService.getCustomerReportDetails(
      from,
      to,
      Number(customerIdParam),
    );
  }

  @Get('suppliers')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Supplier report' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'supplierId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async suppliers(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('supplierId') supplierId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reportsService.computeSuppliers(
      from, to,
      supplierId ? Number(supplierId) : undefined,
      page ? Number(page) : 1,
      limit ? Number(limit) : 25,
    );
  }

  @Get('suppliers/details')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Supplier report full drill-down details' })
  async supplierAllDetails(
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reportsService.getSupplierReportDetails(from, to, undefined);
  }

  @Get('suppliers/:supplierId/details')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Supplier report drill-down details' })
  async supplierDetails(
    @Param('supplierId') supplierIdParam: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reportsService.getSupplierReportDetails(from, to, Number(supplierIdParam));
  }

  @Get('expenses/details')
  @Roles(Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'All expense entries for the selected period' })
  async expenseEntries(
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reportsService.getExpenseReportDetails(from, to);
  }

  @Get('expenses/:categoryId/details')
  @Roles(Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Expense drill-down details' })
  async expenseDetails(
    @Param('categoryId') categoryIdParam: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reportsService.getExpenseReportDetails(from, to, Number(categoryIdParam));
  }

  @Get('employees-sales/details')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Employee sales full drill-down details' })
  async employeeSalesAllDetails(
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reportsService.getEmployeeSalesReportDetails(from, to, undefined);
  }

  @Get('employees-sales/:employeeId/details')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Employee sales drill-down details' })
  async employeeSalesDetails(
    @Param('employeeId') employeeIdParam: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reportsService.getEmployeeSalesReportDetails(from, to, Number(employeeIdParam));
  }

  @Get('products-sales/details')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Product sales full drill-down details' })
  async productSalesAllDetails(
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reportsService.getProductSalesReportDetails(from, to, undefined, undefined);
  }

  @Get('products-sales/:productModelId/details')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Product sales drill-down details' })
  async productSalesDetails(
    @Param('productModelId') productModelIdParam: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reportsService.getProductSalesReportDetails(from, to, Number(productModelIdParam));
  }

  @Get('returns/details')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Returns full drill-down details' })
  async returnsAllDetails(
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reportsService.getReturnsReportDetails(from, to, undefined, undefined, undefined);
  }

  @Get('returns/:returnId/details')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Returns drill-down details' })
  async returnsDetails(
    @Param('returnId') returnIdParam: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reportsService.getReturnsReportDetails(from, to, undefined, undefined, Number(returnIdParam));
  }

  @Get('inventory')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Warehouse inventory stock report (point-in-time snapshot)' })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'productModelId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async inventory(
    @Query('categoryId') categoryId?: string,
    @Query('productModelId') productModelId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reportsService.computeInventory(
      page ? Number(page) : 1,
      limit ? Number(limit) : 25,
      categoryId ? Number(categoryId) : undefined,
      productModelId ? Number(productModelId) : undefined,
      search || undefined,
    );
  }
}
