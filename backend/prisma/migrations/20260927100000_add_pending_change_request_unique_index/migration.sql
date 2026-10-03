-- Prevent two pending change requests from existing for one invoice.
-- This closes the create-time race; review transitions are also claimed in code.
CREATE UNIQUE INDEX "InvoiceChangeRequest_pending_invoice_unique"
ON "InvoiceChangeRequest" ("invoiceId")
WHERE "status" = 'PENDING';
