# خطة: اسم الشركة واللوجو من الإعدادات في كل البرنامج

## Goal
اسم الشركة (`businessName`) واللوجو (`logoUrl`) المُدخلَين في صفحة الإعدادات يظهران في كل واجهات البرنامج (Sidebar، شاشة الدخول، شريط الفواتير، معاينة الفاتورة، ترويسة الطباعة، عنوان نافذة المتصفح، بيانات ملف Excel)، مع إمكانية **رفع لوجو كملف فعلي** من الإعدادات.

## Current State (verified)
- Backend `AppSetting` يملك `businessName` و `logoUrl` بالفعل: `backend/prisma/schema.prisma:626-637`
- endpoints: `GET/PATCH /api/settings` فقط — لا يوجد رفع ملفات: `backend/src/settings/settings.controller.ts`
- `logoUrl` يُخزَّن كنص URL فقط ولا يُعرض في أي مكان في الواجهة
- لا يوجد Settings context/hook عام — `Settings.tsx:38` و `PrintHeader.tsx:36` يجلبان `/settings` بشكل ad-hoc
- أماكن الاسم الثابت (hardcoded):
  - `frontend/src/components/Sidebar.tsx:96,103` → حرف `P` + `t.appName`
  - `frontend/src/pages/Login.tsx:48,55` → حرف `P` + `t.appName`
  - `frontend/src/pages/admin/InvoiceDetail.tsx:143,146` → `P` + `Pallet POS`
  - `frontend/src/pages/sales/NewInvoice.tsx:724-725` → `P` + `Pallet POS`
  - `frontend/src/features/reports/components/PrintHeader.tsx:70-75` → `P` + fallback `"Pallet POS"`
  - `frontend/src/features/reports/components/ExcelExportButton.tsx:56` → `workbook.creator = "Pallet POS"`
- `GET /api/settings` محمي بـ JWT — شاشة Login لا تستطيع جلبه قبل تسجيل الدخول
- `multer` متوفر (عبر `@nestjs/platform-express`) لكن `@types/multer` غير مثبَّت
- لا يوجد `serve-static` ولا أي FileInterceptor في الباكند
- Vite proxy يمرر `/api` فقط على `localhost:3001`

---

## Plan

### Phase 1 — Backend: رفع اللوجو + خدمة الملفات الثابتة

1. **تثبيت الأنواع** (multer نفسه موجود بالفعل عبر platform-express):
   - `npm i -D @types/multer` في `backend/`

2. **`backend/src/settings/settings.controller.ts`**:
   - إضافة endpoint جديد:
     ```
     @Post('logo')
     @Roles(Role.ADMIN)
     @UseInterceptors(FileInterceptor('file', {
       storage: diskStorage({ destination: uploadsDir, filename: uuid + ext }),
       limits: { fileSize: 2MB },
       fileFilter: only image/* (png, jpg, jpeg, webp, svg),
     }))
     ```
   - يستدعي `settingsService.setLogo('/uploads/<filename>')` ويحذف اللوجو القديم إن وُجد
   - يرجع settings محدَّثة
   - (يجب أن يكون المسار خارج `GET` العام — الحفاظ على `@Roles(ADMIN)`)

3. **`backend/src/settings/settings.service.ts`**:
   - إضافة `setLogo(url: string)` يحدّث `logoUrl` ويعيد السجل
   - عند الحذف: حذف الملف القديم من disk (best-effort، لا يُسقط الطلب)

4. **`backend/src/main.ts`** — تقديم الملفات الثابتة:
   - `app.use('/uploads', express.static(join(process.cwd(), 'uploads')))` **قبل** `setGlobalPrefix` ليس مهمًا لأن prefix للـ controllers فقط؛ استخدام `NestApplication` → `app.useStaticAssets(...)` عبر `app.get(HttpAdapterHost)` أو الأسهل: `app.use('/uploads', express.static(...))` بعد `NestFactory.create`
   - ملاحظة: prefix `api` لا يُطبَّق على `app.use` اليدوي → المسار يكون `/uploads/...`
   - إضافة proxy في `frontend/vite.config.ts`: `'/uploads': { target: 'http://localhost:3001', changeOrigin: true }`
   - إنشاء مجلد `backend/uploads/` مع `.gitignore` يتجاهله (أو التأكد من وجوده عند الإقلاع: `mkdirSync recursive`)

5. **`backend/src/settings/settings.controller.ts` — قراءة عامة لشاشة Login**:
   - إما: جعل `GET /settings` متاح بدون auth (الإعدادات ليست حساسة — الاسم والعنوان والهاتف تُطبع على الفواتير anyway)، **أو**
   - إضافة `GET /settings/public` يرجع `{ businessName, logoUrl }` فقط بدون JWT
   - **التوصية**: endpoint عام `GET /settings/brand` يرجع `{ businessName, logoUrl }` فقط — يُستخدم في Login + يبقى الباقي محميًا

### Phase 2 — Frontend: سياق إعدادات عام + مكوّن Brand

6. **إنشاء `frontend/src/lib/settings.tsx`** (نفس نمط `auth.tsx` / `i18n/context.tsx`):
   - `SettingsProvider` + `useSettings()`
   - fetch واحد لـ `GET /settings` عند الإقلاع (بديل PrintHeader/Settings المكرر)
   - يوفّر: `settings`, `businessName` (مع fallback `"Pallet POS"`), `logoUrl`, `refresh()`
   - تغليف في `main.tsx` (داخل `I18nProvider`) أو `App.tsx`
   - **شاشة Login**: استخدام `GET /settings/brand` (endpoint العام) — أو جعل الـ Provider يجلب العام دائمًا ثم الكامل بعد تسجيل الدخول. **التوصية**: Provider يجلب `GET /settings`؛ إذا 401 → يجلب `GET /settings/brand`

7. **إنشاء مكوّن موحد `frontend/src/components/BrandMark.tsx`**:
   - إذا يوجد `logoUrl` → `<img src={logoUrl} alt={businessName} />` داخل المربع الملوّن الحالي (object-fit: contain، خلفية بيضاء/شفافة)
   - وإلا → الحرف `P` كما هو الآن (fallback)
   - props: `size` (لأن المقاسات مختلفة: 32/40/56/39px)

### Phase 3 — استبدال الأماكن الثابتة (كل الأماكن)

8. **`Sidebar.tsx:92-111`**: `P` → `<BrandMark size={32} />`، `t.appName` → `businessName` من settings (إبقار `t.appSubtitle` كما هو)
9. **`Login.tsx:44-56`**: `P` → `<BrandMark size={56} />`، `t.appName` → `businessName`
10. **`admin/InvoiceDetail.tsx:141-148`**: `P` + `Pallet POS` → BrandMark + businessName
11. **`sales/NewInvoice.tsx:722-728`**: `P` + `Pallet POS` → BrandMark + businessName
12. **`PrintHeader.tsx:69-75`**: حذف fetch الـ settings المحلي (يستخدم `useSettings`)، `P` → `<BrandMark>` مع print-color-adjust، fallback يبقى `"Pallet POS"`
13. **`ExcelExportButton.tsx:56`**: `workbook.creator = businessName` من `useSettings()`
14. **عنوان نافذة المتصفح**: في `SettingsProvider` (أو `Layout.tsx`) — `document.title = businessName`، وتحديثه عند تغيّر الإعدادات. also `frontend/index.html:7` يبقى fallback
15. **`Layout.tsx:37`**: fallback `t.appName` → `businessName` (اختياري — العنوان النسبي للصفحة أهم، الـ fallback نادر)

### Phase 4 — صفحة الإعدادات: رفع ملف فعلي

16. **`frontend/src/pages/admin/Settings.tsx`**:
    - استبدال حقل "Logo URL" النصي (سطر 127) بـ:
      - `<input type="file" accept="image/*">` + معاينة (`URL.createObjectURL` أو عرض `logoUrl` الحالي)
      - زر "Remove logo" اختياري (PATCH `logoUrl: null`)
    - عند الحفظ: رفع الملف أولاً `api.post('/settings/logo', formData, { headers: { 'Content-Type': 'multipart/form-data' } })` ثم `PATCH /settings` لبقية الحقول — أو دمج الرفع في نفس عملية الحفظ
    - بعد الحفظ: استدعاء `refresh()` من `useSettings()` لتحديث كل البرنامج فورًا
    - ملاحظة: `api.ts` يفرض `Content-Type: application/json` افتراضيًا — يجب تجاوزه في طلب الرفع (axios يسمح بـ `headers: {'Content-Type': 'multipart/form-data'}` مع boundary تلقائي إذا تُرك FormData)
17. **i18n**: إضافة مفاتيح عند الحاجة في `en.ts`/`ar.ts` (مثل `settings.uploadLogo`, `settings.removeLogo`, `settings.logoPreview`) — والتأكد من مفتاحي `settings.currency`/`settings.timezone` المفقودين في `ar.ts:570-584`

### Phase 5 — مراجعة نظام طباعة الفواتير (الطلب الأصلي) وضبطه

18. مراجعة سلامة الطباعة بعد التعديلات:
    - `PrintHeader` يعمل مع `useSettings` (لا ازدواج fetch)
    - اللوجو يظهر في الطباعة (`print-color-adjust: exact` موجود بالفعل للـ brand-mark)
    - `PrintButton.tsx:81` — ترجمة `"Preparing..."` إلى i18n (اختياري صغير)
    - التأكد من أن `index.css` print rules لا تخفي العناصر الجديدة
    - اختبار: فاتورة Admin + فاتورة Sales + تقرير → Print → التحقق من الاسم/اللوجو/التاريخ

### Phase 6 — Verification

19. Typecheck/build:
    - `frontend`: `npm run build` (أو `tsc -b` حسب package.json)
    - `backend`: `npm run build`
20. تشغيل يدوي:
    - رفع لوجو من `/admin/settings` → يظهر في Sidebar + Login (بعد logout) + InvoiceDetail + NewInvoice preview + عند طباعة فاتورة + title المتصفح
    - تغيير `businessName` → ينتشر فورًا بعد الحفظ (refresh)
    - التحقق من أن `POST /settings/logo` يرفض non-admin وملفات غير صور و >2MB

---

## Files to touch

| File | Change |
|---|---|
| `backend/package.json` | + `@types/multer` |
| `backend/src/settings/settings.controller.ts` | + `POST logo` (FileInterceptor), + `GET settings/brand` عام |
| `backend/src/settings/settings.service.ts` | + `setLogo()`, حذف ملف قديم |
| `backend/src/main.ts` | static `/uploads` |
| `backend/uploads/` | مجلد + gitignore |
| `frontend/vite.config.ts` | proxy `/uploads` |
| `frontend/src/lib/settings.tsx` | **جديد** — SettingsProvider/useSettings |
| `frontend/src/components/BrandMark.tsx` | **جديد** — مكوّن اللوجو/الحرف |
| `frontend/src/main.tsx` | تغليف SettingsProvider |
| `frontend/src/components/Sidebar.tsx:92-111` | اسم + لوجو من settings |
| `frontend/src/pages/Login.tsx:44-56` | اسم + لوجو من settings |
| `frontend/src/pages/admin/InvoiceDetail.tsx:141-148` | اسم + لوجو |
| `frontend/src/pages/sales/NewInvoice.tsx:722-728` | اسم + لوجو |
| `frontend/src/features/reports/components/PrintHeader.tsx` | useSettings + لوجو |
| `frontend/src/features/reports/components/ExcelExportButton.tsx:56` | creator = businessName |
| `frontend/src/pages/admin/Settings.tsx:127` | رفع ملف + معاينة |
| `frontend/src/components/Layout.tsx` (opt) | document.title |
| `frontend/src/i18n/en.ts` / `ar.ts` | مفاتيح جديدة + ثغرات ar |

## Decisions locked with user
- ✅ رفع ملف فعلي (وليس رابط فقط)
- ✅ النطاق: كل الأماكن (Sidebar، Login، الفواتير، المعاينة، الطباعة، عنوان النافذة، Excel)

## Out of scope (ملاحظات، لا تُنفَّذ الآن)
- فحص `invoicePrefix` غير المستخدم في `invoices.service.ts:141`
- Swagger/console "Pallet" في backend
- إصلاح تعارض الـ print CSS في `index.css` (visibility vs display) — يُفحص فقط إن ظهرت مشكلة
- رفع favicon dinamically (قد يُضاف لاحقًا)
