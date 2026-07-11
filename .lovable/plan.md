## سبب المشكلة الحقيقي

كلامك صحيح — المشكلة ليست في متغيرات البيئة فقط.

عندما كان المشروع يستعمل Lovable Cloud، عمليات الدفع كانت تمر عبر **Supabase Edge Functions** (تعمل على بنية Supabase نفسها)، فكان يكفي أن ينشر Vercel الملفات الثابتة في `dist/` فقط.

بعد التحويل، أصبح الدفع (`createCheckoutSession`, `finalizeOrder`, `cancelOrderWithRefund`) يستعمل **TanStack `createServerFn`**، وهذه تحتاج **خادم SSR شغّال** يستقبل `/_serverFn/*`.

المشروع مضبوط افتراضياً على هدف **Cloudflare Workers** (عبر `nitro` في `@lovable.dev/vite-tanstack-config`). حين تنفّذ `npm run build` وتنشر `dist/` على Vercel، الخادم لا يعمل أصلاً، فترجع أخطاء `Neither apiKey nor config.authenticator provided` وشبيهاتها لأن الـ handler لا يشتغل من الأصل (وأحياناً process.env يظهر فارغاً لنفس السبب).

## الخطة

### 1. بناء المشروع لهدف Vercel بدل Cloudflare
تعديل `vite.config.ts` لتمرير preset Vercel إلى nitro:

```ts
nitro: {
  noExternals: true,
  preset: "vercel",
} as any,
```

هذا يجعل البناء يُخرج دالة SSR على `.vercel/output/functions/` يفهمها Vercel، فتشتغل جميع `createServerFn` تلقائياً.

### 2. إلغاء `netlify.toml` من التأثير على Vercel
الملف يقول publish = "dist" وهو صالح لموقع static فقط. سنتركه للـ Netlify، لكن على Vercel:

- **Framework Preset**: Other
- **Build Command**: `npm run build`
- **Output Directory**: اتركه فارغاً (Vercel سيلتقط `.vercel/output` تلقائياً بعد الخطوة 1)

### 3. ضبط متغيرات البيئة في Vercel (Settings → Environment Variables)

مطلوبة على السيرفر (بدون `VITE_`):
```
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
```

مطلوبة للـ client أيضاً (تُحقن وقت البناء):
```
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

### 4. إعادة النشر
بعد حفظ المتغيرات، **Redeploy** ضروري (البناء القديم لا يلتقط المتغيرات).

## بعد موافقتك

سأعدّل فقط `vite.config.ts` (سطر واحد: `preset: "vercel"`). الباقي إعدادات في لوحة Vercel لا يمكنني تنفيذها عنك.
