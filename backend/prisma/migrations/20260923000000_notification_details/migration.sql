-- Add structured payload to notifications so the frontend can render rich,
-- localized details instead of re-parsing the English message with regexes.
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "payload" JSONB;

-- New notification types so price-change / add-item results no longer reuse
-- the return templates (which rendered "تمت الموافقة على المرتجع" wrongly).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PRICE_CHANGE_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ADD_ITEM_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ADD_ITEM_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CHANGE_REQUEST_REJECTED';
