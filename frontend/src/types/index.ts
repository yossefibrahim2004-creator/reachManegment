export type Role = "ADMIN" | "SALES" | "INVENTORY" | "ACCOUNTANT" | "ATTENDANCE_KIOSK";

export type AttendanceAction = "CHECK_IN" | "CHECK_OUT";

export type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT" | "EARLY_LEAVE" | "OVERTIME";

export interface Workplace {
  id: number;
  name: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  _count?: { employees: number };
}

export interface Employee {
  id: number;
  name: string;
  role: Role;
  username: string;
  isActive: boolean;
  workplaceId?: number | null;
  workplace?: { id: number; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  role: Role;
  accessToken: string;
  refreshToken: string;
  workplaceId?: number | null;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  employee: {
    id: number;
    name?: string;
    firstName?: string;
    lastName?: string;
    username: string;
    role: Role;
    workplaceId?: number | null;
  };
}

export interface Category {
  id: number;
  name: string;
  isActive: boolean;
  deletedAt: string | null;
  createdAt: string;
}

export type UnitOfMeasure = "PIECE" | "METER";

export interface ProductModel {
  id: number;
  name: string;
  categoryId: number;
  category?: Category;
  minStockAlert: number;
  isSerialized: boolean;
  unit?: UnitOfMeasure;
  isActive: boolean;
  deletedAt: string | null;
  createdAt: string;
}

export type ProductUnitStatus = "AVAILABLE" | "SOLD" | "DAMAGED" | "RESERVED";

export type InvoiceStatus = "PENDING_ACCOUNTANT" | "CONFIRMED" | "CANCELLED" | "DELIVERED";

export type StockAdjustmentType = "DAMAGE" | "LOSS" | "FOUND" | "COUNT_CORRECTION" | "RECEIVING_CORRECTION" | "OTHER";

export interface ProductUnit {
  id: number;
  barcode: string;
  productModelId: number;
  productModel?: ProductModel;
  status: ProductUnitStatus;
  purchasePrice?: number;
  version: number;
  createdAt: string;
  unitAssignments?: {
    id: number;
    invoiceItem?: {
      id: number;
      price?: number;
      invoice?: {
        id: number;
        invoiceNumber?: string;
        status?: InvoiceStatus;
        date?: string;
        customer?: { id: number; name: string } | null;
      } | null;
    } | null;
  }[];
}
export interface ProductUnitAuditEntry {
  id: number;
  productUnitId: number;
  action: string;
  invoiceId: number | null;
  employeeId: number;
  employee?: Employee;
  invoice?: Invoice;
  notes: string | null;
  timestamp: string;
}

export interface InvoiceItem {
  id: number;
  invoiceId: number;
  productUnitId: number;
  productUnit?: ProductUnit;
  productModelId?: number;
  productModel?: ProductModel;
  quantity?: number;
  costAtSale?: number;
  price: number;
  createdAt: string;
}

export interface Invoice {
  id: number;
  invoiceNumber: string;
  customerId: number;
  customer?: Customer;
  employeeId: number;
  employee?: Employee;
  status: InvoiceStatus;
  paymentType?: string;
  discountPercentage?: number;
  discountAmount?: number;
  date: string;
  originalTotal: number;
  currentTotal: number;
  items: InvoiceItem[];
  confirmedByEmployeeId?: number;
  confirmedBy?: Employee;
  confirmedAt?: string;
  rejectedByEmployeeId?: number;
  rejectedBy?: Employee;
  rejectedAt?: string;
  rejectionReason?: string;
  deliveredByEmployeeId?: number;
  deliveredBy?: Employee;
  deliveredAt?: string;
  createdAt?: string;
  itemCount?: number;
}

export interface Customer {
  id: number;
  name: string;
  phone?: string;
  type: "INDIVIDUAL" | "COMPANY";
  isActive: boolean;
  deletedAt: string | null;
  createdAt: string;
}

export interface InvoiceAuditLog {
  id: number;
  invoiceId: number;
  action: string;
  employeeId: number;
  employee?: Employee;
  details: Record<string, unknown> | null;
  timestamp: string;
}

export interface InvoiceChangeRequest {
  id: number;
  invoiceId: number;
  invoice?: Invoice;
  requestedByEmployeeId: number;
  requestedBy?: Employee;
  type: string;
  reason: string;
  proposedCustomerId: number | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedByAdminId: number | null;
  reviewedBy?: Employee;
  reviewDate: string | null;
  adminNote: string | null;
  createdAt: string;
  items: InvoiceChangeRequestItem[];
}

export interface InvoiceChangeRequestItem {
  id: number;
  requestId: number;
  action: string;
  invoiceItemId: number | null;
  invoiceItem?: InvoiceItem;
  productUnitId: number | null;
  productUnit?: ProductUnit;
  proposedPrice: number | null;
  notes: string | null;
}

export interface Attendance {
  id: number;
  employeeId: number;
  employee?: Employee;
  workplaceId?: number | null;
  workplace?: Workplace | null;
  kioskId?: number | null;
  kiosk?: Employee | null;
  status?: AttendanceStatus;
  checkIn: string;
  checkOut: string | null;
  date: string;
  checkInLatitude?: number | null;
  checkInLongitude?: number | null;
  checkOutLatitude?: number | null;
  checkOutLongitude?: number | null;
}

export interface KioskQrResponse {
  token: string;
  action: AttendanceAction;
  expiresAt: string;
  ttlSeconds: number;
  workplace: { id: number; name: string };
  kiosk: { id: number; name: string };
}

export interface KioskContext {
  id: number;
  name: string;
  workplace: {
    id: number;
    name: string;
  };
}

export interface ExpenseCategory {
  id: number;
  name: string;
  isActive: boolean;
}

export interface Expense {
  id: number;
  categoryId: number;
  category?: ExpenseCategory;
  employeeId: number;
  employee?: Employee;
  amount: number;
  date: string;
  description: string | null;
  createdAt: string;
}

export interface Notification {
  id: number;
  employeeId: number;
  type: string;
  title: string;
  message: string;
  payload?: Record<string, unknown> | null;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

export interface AppSetting {
  id: number;
  businessName: string;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
  currency: string;
  timezone: string;
  invoicePrefix: string;
}

export interface InvoiceReturn {
  id: number;
  invoiceId: number;
  invoice?: Invoice;
  requestedById: number;
  approvedById: number;
  reason: string;
  refundTotal: number;
  createdAt: string;
  items: InvoiceReturnItem[];
}

export interface InvoiceReturnItem {
  id: number;
  invoiceReturnId: number;
  invoiceItemId: number;
  productUnitId: number;
  productUnit?: ProductUnit;
  refundAmount: number;
}

export interface StockReceipt {
  id: number;
  employeeId: number;
  employee?: Employee;
  productModelId: number;
  productModel?: ProductModel;
  supplierId?: number;
  supplier?: Supplier;
  quantity?: number;
  status?: string;
  createdAt: string;
  date?: string;
  pricedAt?: string | null;
  items: StockReceiptItem[];
  stockLots?: StockLot[];
  itemCount?: number;
  totalQuantity?: number;
}

export interface StockReceiptItem {
  id: number;
  productUnitId: number;
  productUnit: ProductUnit;
}

export interface Supplier {
  id: number;
  name: string;
  phone?: string;
  address?: string;
  isActive: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockLot {
  id: number;
  productModelId: number;
  productModel?: ProductModel;
  supplierId?: number;
  supplier?: Supplier;
  quantityTotal?: number;
  quantityReceived: number;
  quantityReserved: number;
  quantityRemaining: number;
  purchasePrice: number;
  createdAt: string;
}

export interface StockAdjustment {
  id: number;
  productModelId: number;
  productModel?: ProductModel;
  type: StockAdjustmentType;
  quantity: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedByEmployeeId?: number | null;
  reviewedBy?: Employee;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  employeeId: number;
  employee?: Employee;
  createdAt: string;
}

export interface StockConsumption {
  id: number;
  invoiceId: number;
  invoice?: Invoice;
  productModelId: number;
  productModel?: ProductModel;
  quantity: number;
  createdAt: string;
}

export interface DashboardSummary {
  employees: { total: number; active: number };
  products: { models: number; units: number };
  inventory: { available: number; sold: number; damaged: number };
  today: { invoices: number; revenue: number; attendance: number };
  pendingApprovals: number;
  pendingInvoiceReviewsCount?: number;
  pendingDeliveriesCount?: number;
  pendingCogsInvoicesCount?: number;
  unreadNotifications: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hint?: "UNIT_NOT_FOUND" | "UNIT_NOT_IN_ANY_INVOICE";
  };
}

export * from "./reports";
