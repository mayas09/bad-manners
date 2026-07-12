import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/lib/use-admin-auth";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import {
  LayoutDashboard,
  Coffee,
  Image as ImageIcon,
  Settings,
  ShoppingBag,
  CalendarHeart,
  LogOut,
  ExternalLink,
  BarChart3,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

const NAV = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/admin/welcome", label: "Welcome", icon: Sparkles, exact: false },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3, exact: false },
  { to: "/admin/menu", label: "Menu", icon: Coffee, exact: false },
  { to: "/admin/photos", label: "Photos", icon: ImageIcon, exact: false },
  { to: "/admin/info", label: "Business Info", icon: Settings, exact: false },
  { to: "/admin/orders", label: "Orders", icon: ShoppingBag, exact: false },
  { to: "/admin/events", label: "Events", icon: CalendarHeart, exact: false },
] as const;

function AdminLayout() {
  return <AdminChrome />;
}

function AdminChrome() {
  const auth = useAdminAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!auth.loading && !auth.user) navigate({ to: "/account/login", search: { next: path } as any });
  }, [auth.loading, auth.user, navigate, path]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/account/login" });
  }

  if (auth.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        Loading…
      </div>
    );
  }
  if (!auth.user) return null;
  if (!auth.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md text-center bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <h1 className="text-xl font-semibold text-slate-900">Not authorized</h1>
          <p className="mt-2 text-sm text-slate-500">
            Your account doesn't have admin access.
          </p>
          <div className="mt-6 flex gap-2 justify-center">
            <Button variant="outline" onClick={() => navigate({ to: "/account" })}>
              Go to my account
            </Button>
            <Button variant="ghost" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-5 border-b border-slate-200">
          <p className="text-sm font-semibold text-slate-900">Bad Manners</p>
          <p className="text-xs text-slate-500">Admin</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => {
            const active = item.exact ? path === item.to : path.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-200">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-slate-100"
          >
            <ExternalLink className="size-3.5" /> View public site
          </Link>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
          <div className="md:hidden">
            <p className="text-sm font-semibold text-slate-900">Bad Manners Admin</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-slate-400">Signed in as</p>
              <p className="text-xs font-medium text-slate-700">{auth.user.email}</p>
            </div>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="size-4 mr-1.5" /> Logout
            </Button>
          </div>
        </header>
        {/* Mobile nav */}
        <div className="md:hidden border-b border-slate-200 bg-white px-3 py-2 flex gap-1 overflow-x-auto">
          {NAV.map((item) => {
            const active = item.exact ? path === item.to : path.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`shrink-0 rounded-md px-3 py-1.5 text-xs ${active ? "bg-slate-900 text-white" : "text-slate-600"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
      <Toaster richColors position="top-center" />
    </div>
  );
}
