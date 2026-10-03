import type { TranslationKey } from "../i18n";

export function getSuccessMessages(t: TranslationKey) {
  return {
    auth: t.success.auth,
    employee: t.success.employee,
    customer: t.success.customer,
    supplier: t.success.supplier,
    settings: t.success.settings,
    category: t.success.category,
    productModel: t.success.productModel,
    expense: t.success.expense,
    expenseCategory: t.success.expenseCategory,
    invoice: t.success.invoice,
    changeRequest: t.success.changeRequest,
    shipment: t.success.shipment,
    stockAdjustment: t.success.stockAdjustment,
    pricing: t.success.pricing,
    attendance: t.success.attendance,
    notification: t.success.notification,
  };
}

export type SuccessMessages = ReturnType<typeof getSuccessMessages>;
