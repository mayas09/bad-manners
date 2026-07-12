import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Coffee,
  Image as ImageIcon,
  Settings,
  ShoppingBag,
  CalendarHeart,
  BarChart3,
  LayoutDashboard,
  Mail,
} from "lucide-react";

export const Route = createFileRoute("/admin/welcome")({
  component: Welcome,
});

function Welcome() {
  return (
    <div className="max-w-4xl space-y-8">
      <header>
        <p className="text-xs uppercase tracking-wide text-slate-500">Welcome</p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-900">
          مرحباً بك في لوحة تحكم Bad Manners Coffee
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          مركز إدارة المقهى — من هنا يمكنك تحديث القائمة، الصور، الطلبات، وحجوزات
          الفعاليات في مكان واحد.
        </p>
      </header>

      <section className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900">عن اللوحة</h2>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          لوحة إدارة مخصّصة لمقهى Bad Manners في West Asheville. صُمّمت لتكون بسيطة
          وسريعة — لا حاجة لخبرة تقنية لإدارة محتوى الموقع اليومي: القائمة الموسمية،
          صور المعرض، معلومات العمل، الطلبات القادمة، واستفسارات الحفلات والضيافة.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">ما يمكنك فعله</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            {
              to: "/admin",
              icon: LayoutDashboard,
              title: "نظرة عامة",
              desc: "إحصائيات سريعة عن القائمة والاستفسارات.",
            },
            {
              to: "/admin/analytics",
              icon: BarChart3,
              title: "التحليلات",
              desc: "متابعة الأداء والمبيعات.",
            },
            {
              to: "/admin/menu",
              icon: Coffee,
              title: "القائمة",
              desc: "إضافة أو تعديل المشروبات والأصناف.",
            },
            {
              to: "/admin/photos",
              icon: ImageIcon,
              title: "الصور",
              desc: "تحديث صور المعرض والغلاف.",
            },
            {
              to: "/admin/info",
              icon: Settings,
              title: "معلومات العمل",
              desc: "ساعات العمل، العنوان، وسائل التواصل.",
            },
            {
              to: "/admin/orders",
              icon: ShoppingBag,
              title: "الطلبات",
              desc: "مراجعة طلبات العملاء وحالتها.",
            },
            {
              to: "/admin/events",
              icon: CalendarHeart,
              title: "الفعاليات",
              desc: "استفسارات الضيافة والحفلات.",
            },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.to}
                to={c.to}
                className="group bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-900 hover:shadow-sm transition"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-9 place-items-center rounded-lg bg-slate-900 text-white">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{c.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{c.desc}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900">نصائح سريعة</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-600 list-disc pr-5">
          <li>حدّث القائمة الموسمية بانتظام لإبراز المشروبات الجديدة.</li>
          <li>أضف صوراً عالية الجودة تعكس أجواء المقهى.</li>
          <li>راجع استفسارات الفعاليات يومياً للرد بسرعة على العملاء.</li>
          <li>تأكد من صحّة ساعات العمل قبل العطلات والمناسبات.</li>
        </ul>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-6 flex items-start gap-3">
        <Mail className="size-5 text-slate-500 mt-0.5" />
        <div>
          <h2 className="text-sm font-semibold text-slate-900">هل تحتاج مساعدة؟</h2>
          <p className="mt-1 text-sm text-slate-600">
            إن واجهت أي مشكلة أو لديك اقتراح لتحسين اللوحة، تواصل مع فريق الدعم.
          </p>
        </div>
      </section>
    </div>
  );
}
