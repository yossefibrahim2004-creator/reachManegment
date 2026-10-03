# Pallet Authorization Policy

## Role Matrix

| Resource / operation | ADMIN | ACCOUNTANT | SALES | INVENTORY | ATTENDANCE_KIOSK |
|---|---:|---:|---:|---:|---:|
| Invoice create | No | No | Own sales workflow | No | No |
| Invoice list/detail/audit | All | Accounting scope | Own invoices only | Confirmed/delivered delivery scope | No |
| Invoice confirm/reject | Yes | Yes | No | No |
| Invoice delivery queue/detail | Yes | No | No | Yes |
| Change-request create | No | No | Own request workflow | Own request workflow | No |
| Change-request list/detail | All | No | Own requests only | Own requests only | No |
| Change-request approve/reject | Yes | No | No | No |
| Stock receipt list/detail | Yes | No | No | Inventory-wide stock scope | No |
| Stock receipt receive | No | No | No | Yes |
| Stock receipt pricing | Yes | No | No | No |
| Product-unit inventory count | Yes | No | No | Yes |
| Product-unit barcode/audit lookup | Yes | No | Yes | Yes | No |
| Stock adjustment list/create | Yes | No | No | Yes | No |
| Stock adjustment approve/reject | Yes | No | No | No | No |
| Notifications | Yes | Yes | Yes | Yes | No |
| Dashboard | Yes | Yes | Yes | Yes | No |
| System audit | Yes | No | No | No | No |
| Invoice audit | All allowed invoice visibility | Allowed invoice visibility | Own invoices | Confirmed/delivered scope | No |
| Settings read | Yes | Yes | Yes | Yes | No |
| Settings mutation/logo | Yes | No | No | No | No |
| Auth self-service | Yes | Yes | Yes | Yes | Yes |

`settings/brand` and login/refresh are intentionally public authentication/bootstrap
endpoints. All other authenticated endpoints must declare explicit roles; an
omitted `@Roles` is not a valid policy.

## Visibility Rules

- Admin has global visibility for administrative resources.
- Sales invoice and change-request reads are filtered by `employeeId` or
  `requestedByEmployeeId` equal to the authenticated employee.
- Inventory invoice reads are limited to `CONFIRMED` and `DELIVERED` records for
  delivery work; stock receipts and stock counts are operationally inventory-wide.
- Accountant can read invoice workflows but cannot read inventory receipts,
  change requests, or product-unit inventory internals.
- Kiosk accounts are limited to kiosk attendance endpoints and auth self-service.
