Pallet — Product Design Specification
System: Point of Sale, Invoicing & Serialized Inventory Management
Selected direction: Refined Clay Operations
Document status: Implementation-ready
Primary device: Desktop retail workstation
Secondary devices: Tablet and compact laptop

1. Design intent
Pallet is a friendly, precise operations workspace for a single-location retail or wholesale business. Every physical item has a permanent manufacturer barcode, so the interface must make scanning, unit identity, status, and transaction safety immediately understandable.

The visual direction combines restrained, tactile surfaces with strict operational hierarchy. It should feel composed and trustworthy during long shifts—professional without becoming cold, playful, vague, or slow.

Design principles
Scan first. Barcode entry is the fastest and most visually prominent control in sales, receiving, invoice search, and unit search.
One unit, one identity. Always show the barcode next to the product model and status. Never present serialized inventory as anonymous quantity-only stock.
Temporary means temporary. Unsaved sales and receiving lists are clearly labeled as drafts held on this device. Scanning does not imply that inventory changed.
Safe before fast. Duplicate, sold, damaged, and unknown units receive immediate, specific feedback before they can enter a transaction.
Role clarity. Navigation and actions change by role. Forbidden actions are absent rather than merely disabled.
History stays visible. Saved invoice changes, returns, and unit transitions appear as events in timelines; the interface never suggests historical records were overwritten.
Friendly density. Rounded surfaces and soft colors reduce fatigue, while tables, numbers, and controls remain compact enough for daily operations.
No decorative ambiguity. Color supports state and hierarchy; it never replaces text labels.
2. Visual direction
2.1 Professional refinement
The chosen concept is retained, but its consumer-style softness is reduced for a production business system:

Replace playful 3D styling with restrained tactile depth.
Use muted, businesslike accents instead of candy pastels.
Reduce corner radii and shadows in transactional areas.
Favor structured tables and aligned fields over decorative tiles.
Reserve colorful summary tiles for dashboards; sales and receiving stay neutral.
Use a precise geometric heading face rather than a rounded display face.
Keep surfaces bright and calm for long daytime shifts.
Treat data, barcode identity, and transaction status as the visual priority.
2.2 Character
Tactile, low-gloss surfaces
Warm neutral application background
Crisp white elevated work panels
Moderately rounded, controlled geometry
Precise headings paired with highly readable body text
Muted navy-blue, burgundy, teal, and amber accents
Minimal illustration; product thumbnails are optional and secondary to barcode data
Gentle depth rather than glass, gradients, or dramatic shadows
2.3 Avoid
Dark, cinematic terminal styling
Glassmorphism and blurred translucent panels
Purple gradients
Oversized marketing-style headings
Decorative dashboards that hide workflows
Nested cards
Pill-shaped treatment for every control
Color-only status communication
Motion on totals, prices, or critical confirmation messages
3. Design tokens
All implementation colors must be semantic tokens. The values below are source colors; production CSS should convert them to the project’s token format while retaining their appearance.

3.1 Core palette
Token	Value	Purpose
brand	#4169A1	Primary actions, active navigation, focus, selected states
accent	#A95364	Alerts, pending approvals, unread notifications
mint	#3F8069	Success, available stock, completed state
peach	#B98238	Warnings, low stock, attention without failure
surface	#F5F3F0	Main application background
card	#FFFFFF	Work panels, dialogs, menus
ink	#292D38	Primary text and strong icons
soft	#69707D	Secondary text and metadata
3.2 Extended semantic roles
Role	Suggested source	Usage
success	Mint, darkened for text	Saved, available, checked in, approved
warning	Peach, darkened for text	Low stock, unsaved work, attention
danger	Coral/red derived from accent	Invalid scan, damaged unit, rejected request
info	Brand blue	Scanner focus, selected record, informational state
border	Ink at 8–12% opacity	Dividers and input outlines
overlay	Ink at 32% opacity	Dialog backdrop
row-hover	Brand at 5% opacity	Table and list hover
row-selected	Brand at 10% opacity	Selected unit or invoice
disabled	Soft at 45% opacity	Disabled control and unavailable text
3.3 Status mapping
Domain status	Color	Label
AVAILABLE	Mint	Available
SOLD	Brand blue	Sold
DAMAGED	Coral/red	Damaged
Pending request	Peach	Pending approval
Approved request	Mint	Approved
Rejected request	Coral/red	Rejected
Unread notification	Accent	Unread
Temporary draft	Peach	Not saved
Every status indicator combines color with a visible text label and, where useful, an icon.

4. Typography
4.1 Families
Display and headings: Sora, weights 500–700
Body and interface: Manrope, weights 400–700
Barcode, invoice number, currency, timestamps: a tabular numeral/monospace fallback when exact alignment is needed
4.2 Scale
Style	Size	Weight	Use
Page title	30 px	600	One per screen
Section title	20 px	600	Major work areas
Panel title	16 px	700	Tables and grouped controls
Body	14 px	500	Default interface text
Supporting	12 px	600	Metadata and helper text
Label	12 px	700	Inputs and table headers
KPI	36 px	600	Dashboard totals only
Transaction total	28 px	600	Invoice and payment totals
Barcode	14–16 px	600	Scanned identity
Letter spacing is zero except short uppercase metadata labels, which may use modest positive tracking. Never use negative tracking.

4.3 Numeric rules
Use tabular numerals for money, counts, invoice numbers, and dates.
Align monetary table columns to the right.
Keep currency formatting consistent with business settings.
Show invoice numbers in full and never truncate them.
Barcode values can wrap only on narrow screens; they must never be ellipsized on detail pages.
5. Shape, spacing, and depth
5.1 Radius
The selected concept uses controlled geometry refined for a professional operational product:

Inputs and buttons: 8 px
Navigation items and compact panels: 8 px
Main cards and dialogs: 12 px
Avatars and icon tiles: 8 px
Status chips: 999 px only for compact statuses
Avoid oversized radii on dense tables and transactional forms. Professional work areas should read as structured surfaces, not bubbles.

5.2 Spacing
Use a 4 px base grid.

4 px: icon/label micro-gap
8 px: compact control gap
12 px: row padding and related fields
16 px: standard panel padding on compact screens
20–24 px: desktop card padding
32 px: separation between major page sections
5.3 Shadows
Work panel: extremely subtle neutral shadow with a visible border
Active navigation: tinted background and slim brand indicator; no floating effect
Primary action: subtle neutral shadow only
Dialog: medium neutral shadow
No shadow on every row, badge, or input
Borders remain visible at 8–12% ink opacity so surfaces are distinguishable without relying on shadow alone.

6. Application shell
6.1 Desktop
A persistent 256 px left sidebar and flexible main workspace.

Sidebar order:

Brand: Pallet / Serialized Stock OS
Role-specific primary navigation
Secondary/admin navigation
Signed-in employee block with role and attendance state
Top bar:

Page title and current business date
Global scan/search command
Notification button with unread count
Employee menu where appropriate
6.2 Role navigation
Sales

Home
New Invoice
Invoice Search
Unit Search
Customers
My Requests
Attendance
Inventory

Home
Receive Shipment
Inventory
Categories & Models
Unit Search
Unit History
Admin

Dashboard
Notifications
Change Requests
Invoices
Employees
Attendance
Expenses
Reports
Audit History
Settings
Admin navigation must not show New Invoice or Receive Shipment. Sales and Inventory views must not expose approval or financial administration actions.

6.3 Tablet and compact layouts
Sidebar becomes a slide-in navigation drawer.
Top bar keeps page title, scan/search, and notifications.
Two-column workspaces stack into one column.
The primary save action becomes a sticky bottom action area.
Tables switch to horizontal scrolling only when a compact row layout cannot preserve all required values.
The application targets desktop operations first; mobile supports lookup and light management, not high-volume checkout.

7. Core reusable components
7.1 Buttons
Variant	Use
Primary	Save Invoice, Receive Shipment, Approve
Secondary	Print, Add customer, Apply filters
Quiet	Clear filters, close, secondary navigation
Danger	Reject, mark damaged, deactivate
Icon	Notifications, print, remove line, overflow menu
Rules:

Use icon-only buttons for familiar actions such as print, close, remove, and navigation; include tooltips and accessible names.
Destructive actions require a confirmation dialog with the affected record named.
Primary buttons use brand blue; success green is reserved for completed state, not default actions.
Button labels state the business result: “Save Invoice,” not “Submit.”
7.2 Inputs
Labels remain visible above fields.
Required state is indicated in text, not color alone.
Validation appears directly below the field.
Focus uses a 2 px brand ring with sufficient contrast.
Scanner fields are taller and visually distinct from ordinary text inputs.
Price fields are right-aligned and display the configured currency.
7.3 Tables
Sticky table header on long collections.
44–48 px minimum row height.
Left align names and identities; right align numeric values.
Barcode and invoice number are visually distinct and selectable.
Row actions live in a final fixed-width column.
Pagination is always server-backed and shows range, total, page size, previous, and next.
Empty states remain inside the table region and explain the next useful action.
7.4 Status chips
Compact rounded chips may show status, but not actions. Examples: Available, Sold, Damaged, Pending, Approved, Rejected, Active, Inactive.

7.5 Work panels
Use cards only for distinct tools or repeated records. Do not place cards inside cards. Large page sections remain unframed; the scanner, transaction lines, totals, and print preview may each be a separate work panel.

7.6 Dialogs
Use dialogs for:

Confirmation of destructive or irreversible actions
Approval/rejection with reason
Unsaved-work warning
Compact inline customer creation
Status transitions such as Mark Damaged
Long multi-step business flows use full pages, not large dialogs.

8. Scanner interaction specification
8.1 Scanner control
The scanner input is a keyboard-wedge text field with:

Default focus when the workflow opens
A barcode icon and “Scan barcode” label
Visible readiness state
Safe handling of Enter and Tab suffixes
Keyboard fallback for manual entry
Immediate return of focus after successful or rejected scan
8.2 Feedback
Successful scan

Short positive sound when enabled
Mint confirmation strip
Scanned row briefly highlights in brand blue at low opacity
Product model, barcode, and current status are announced visually
Duplicate in temporary list

Peach warning strip
Existing row pulses once and scrolls into view
Message: “This barcode is already in the current list.”
Existing barcode during receiving

Coral error strip
Message: “This barcode already belongs to an inventory unit.”
Sold unit during sale

Coral error strip
Show current status and invoice reference when allowed
Message: “This unit is already sold and cannot be added.”
Damaged unit during sale

Coral error strip
Message: “This unit is marked damaged and cannot be sold.”
Concurrency conflict at save

Keep the unsaved invoice visible
Highlight affected rows
Message: “This item was just sold or is no longer available.”
Offer Remove affected items and Review invoice; do not silently retry
8.3 Temporary-state banner
New Invoice and Receive Shipment display a persistent peach-tinted banner:

Not saved — scans are stored only on this device until you save.

A count of temporary units appears beside the banner. Navigating away with items present triggers an unsaved-work confirmation.

9. Screen specifications
9.1 Login
Centered white panel on the warm surface background.

Pallet brand mark
Username
Password with reveal control
Sign in button
Inline invalid-credentials message
Loading state preserves button width
No role selector
Do not disclose whether username or password was incorrect. Inactive accounts receive a controlled account-unavailable message.

9.2 Sales home
Greeting and attendance state
Primary action: New Invoice
Secondary actions: Search Invoice, Scan/Search Unit, Customers, My Requests
Recent invoices table with server pagination
Small summary for today’s completed invoices; avoid admin-only financial KPIs
9.3 New invoice
Desktop uses the required split workspace.

Left: Invoice Entry

Temporary-state banner
Customer selector with inline create action
Scanner field, focused by default
Serialized item lines
Editable per-line selling price
Running item count and total
Save Invoice action
Right: Live Invoice Preview

Company header
Customer details
Draft items and prices
Current total
Footer
“Preview — not an invoice number” label before save
Rules:

The first entered price for a model pre-fills later units of that model in this temporary invoice.
Each line remains independently editable.
Repeated models remain separate serialized lines.
Save is disabled until customer and at least one valid unit with a valid price exist.
Do not show a permanent invoice number before a successful save.
9.4 Invoice confirmation
A success header shows the permanent invoice number, save timestamp, employee, and customer. The official invoice preview occupies the main area.

Actions:

Print
Download PDF
View Invoice
Start New Invoice
Only indicate “Printed” after the print/export request succeeds.

9.5 Invoice search
One prominent search field accepts invoice number or barcode
Expandable filters: date range, customer, employee, current state
Paginated result table
Search term remains visible when opening and returning from a result
9.6 Invoice detail
Header: invoice number, current state, date, employee, customer, print action.

Content:

Original invoice lines
Approved price/add-item adjustments
Returns/refunds
Original total and effective current total
Change request history
Append-only audit timeline
Primary contextual action for Sales: Request Edit / Return. Never offer direct edit.

9.7 Change request
A structured page, not free-form only.

Request type
Affected item(s)
Requested values or return amount
Required reason
Impact summary
Submit request
After submission, show Pending approval and the immutable request details. Sales cannot approve their own request.

9.8 Receive shipment
A simple scan-first workspace.

Category selector
Product model selector
Temporary-state banner
Large scanner field
Scanned count
Temporary barcode list with per-row remove
Clear List secondary action
Save / Receive Shipment primary action
The save confirmation states the exact model and number of serialized units. Any invalid barcode prevents the entire receipt from saving; show all detected problems together when possible.

9.9 Inventory
Summary table columns:

Category
Product Model
Available
Sold
Damaged
Total units
Filters: category, model, search, status. Counts use status-colored numerals plus labels and remain readable without color.

9.10 Unit details
The barcode is the page title’s strongest identifier.

Product model
Current status
Received date and receipt reference
Current or last invoice reference
Version/conflict metadata only when useful to support staff
Vertical lifecycle timeline: Received, Sold, Returned, Available, Damaged, Restored
Inventory actions appear only when valid:

Available → Mark Damaged
Damaged → Restore Available
Sold → no direct restoration action
9.11 Admin dashboard
Use four compact KPI tiles at the top:

Monthly net sales
Monthly expenses
Monthly net profit
Pending change requests
Below:

Low-stock models
Recent invoices
Recent returns
Unread notifications
Show the formula “Net profit = Net sales − expenses” near the net-profit figure. Never label this accounting gross profit or margin.

9.12 Approval queue
Split view on wide screens:

Left: filterable request list
Right: selected request comparison and audit context
Comparison shows original value, requested value, financial impact, reason, requester, and time. Approve and Reject are visually separated. Rejection requires a reason.

9.13 Employees
Search and role/status filters
Employee table
Create/Edit employee form
Role assignment
Activate/deactivate
Admin-triggered password reset
Role is a controlled single selection. Deactivation confirmation clearly states that access ends immediately.

9.14 Attendance
Employee: large Check In or Check Out action, current open session, today’s elapsed time.
Admin: employee/date filters, attendance table, total hours, open-session indicator.

9.15 Expenses
Date-range summary
Expense list with category, amount, date, description, creator
Add/Edit expense form
Expense category management
Audit history link for changed records
9.16 Notifications
Tabs or segmented filter: Unread, All, Resolved
Mark as read
Mark all as read
Open related record
Low-stock notification includes model, available count, threshold, and resolved state
9.17 Customers
Search/filter table
Create and edit forms: name, type, phone
Active/inactive state
Compact inline version during invoice creation
9.18 Reports
Persistent date-range filter
KPI summary: Gross Sales, Returns, Net Sales, Expenses, Net Profit
Employee-sales table
Product-sales table: sold events, returned events, net sold units
Export/print action
Reports must distinguish sale events from unique physical units because one returned unit can be sold again.

9.19 Settings
Grouped sections:

Business identity: name, address, phone, logo URL
Financial: currency
Localization: timezone, direction/language readiness
Invoices: prefix, footer
Save each coherent section independently and show last-saved feedback.

10. Dashboard composition reference
The chosen dashboard composition should be preserved, with its visual treatment refined from playful clay styling into a restrained professional operations workspace:

Persistent left sidebar
Greeting/search/notifications top row
Four summary tiles
Primary two-thirds operational panel
Secondary one-third alert panel
Full-width completion or activity strip
For Sales, the primary panel becomes the scanner-first POS and the secondary panel can show attendance or recent invoices. For Inventory, it becomes receiving activity and low-stock models. For Admin, it becomes reports and approvals. Do not force the same data onto every role.

11. Empty, loading, and error states
Empty
State what is empty
Explain the next valid action
Include one relevant action at most
Do not use decorative illustrations in dense work areas
Examples:

“No units scanned yet. Scan the first manufacturer barcode.”
“No pending requests.”
“No invoices match these filters.”
Loading
Use stable skeleton rows matching final dimensions
Keep scanner controls visible when background lookups load
Prevent double submission while saving
For transaction saves, show a clear full-action progress state without clearing temporary data
Error
Place field errors next to fields
Place scan errors next to the scanner and affected row
Use a page-level error panel only when the screen cannot continue
Always preserve recoverable temporary work
Never show raw server, database, or stack errors
12. Motion and sound
Motion
120–180 ms for hover and focus changes
180–240 ms for drawer and dialog transitions
One brief row highlight after a scan
One subtle pulse on the duplicate row
No entrance animation on every card
No animated counters for financial totals
Respect prefers-reduced-motion
Sound
Optional and controlled in workstation preferences:

Short high confirmation tone for accepted scan
Short low tone for rejected scan
Never use long sounds or spoken feedback
Visual feedback remains complete when sound is off
13. Accessibility and localization
Target WCAG 2.2 AA contrast.
All workflows are usable by keyboard.
Scanner focus never traps the user.
Visible focus appears on every interactive element.
Icon-only controls have accessible names and tooltips.
Status never relies on color alone.
Touch targets are at least 44 × 44 px on tablet.
Error summaries link to invalid fields on long forms.
Use semantic headings, tables, labels, and live regions for scan feedback.
Support English and Arabic content.
Layout mirrors for RTL while numbers, barcodes, and invoice identifiers preserve readable direction.
The invoice preview and official PDF share the same hierarchy for A4 and future thermal formats.
14. Responsive behavior
≥1280 px
Full sidebar
Split invoice entry/preview
Split approval queue
Four KPI tiles in one row
768–1279 px
Collapsible sidebar
Invoice preview below entry or available as a preview tab
Two KPI tiles per row
Tables retain essential columns and horizontal scrolling where necessary
<768 px
Navigation drawer
Single-column flow
Sticky primary action area
List rows replace wide tables where possible
Barcode, status, price, and row action remain visible
Intended for lookup and light management, not sustained high-volume scanning
15. Content language
Use direct business language.

Preferred

Save Invoice
Save / Receive Shipment
Scan barcode
Available
Pending approval
Mark Damaged
Restore Available
Effective total
Not saved
Avoid

Submit
Process data
Item processed
Success!
Something went wrong
Draft saved, when no persistent draft exists
Messages must state what happened and what the user can do next.

16. Implementation checklist
Before a screen is considered complete:

 Correct role can access it; forbidden roles cannot
 One clear page title
 Primary action matches the business result
 Keyboard navigation works
 Scanner focus and suffix handling work where required
 Loading, empty, success, validation, and server-error states exist
 Unsaved transaction state is clearly labeled
 Barcode and unit status are visible together
 Pagination exists for large collections
 Status includes text, not color alone
 Destructive actions require confirmation
 Temporary work survives recoverable errors
 Desktop and tablet layouts do not overlap or truncate critical data
 RTL layout and Arabic text are supported
 Reduced-motion behavior is respected
 Print/PDF preview preserves invoice hierarchy and totals
17. Direction options considered
Option A — Refined Clay Operations — Selected
Warm, tactile, and businesslike, with disciplined density for long employee shifts. It retains the approachable composition of the selected concept while replacing playful typography, candy colors, oversized radii, and floating effects with a more credible operations aesthetic.

Option B — Frosted Scan Console
Cool, technical, translucent command-center aesthetic with compact data grids. Strong for expert operators but less warm and more visually fragile on lower-quality retail displays.

Option C — Cinematic Scanner One-Sheet
Dark, high-contrast scanner environment with industrial typography and orange highlights. Excellent barcode emphasis but less appropriate for reports, settings, print previews, and long daytime use.

18. Final design decision
Build Pallet using Refined Clay Operations as the visual foundation. Preserve the selected concept’s warm neutral surface, role-based left navigation, summary tiles, and subtle tactile depth. Use the more professional muted blue/burgundy/teal/amber palette, Sora/Manrope typography, disciplined 8–12 px radii, visible borders, and compact transactional density so scanner workflows remain fast, credible, readable, and safe.