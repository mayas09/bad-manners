import { createFileRoute } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/admin/orders")({
  component: OrdersPage,
});

function OrdersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Orders</h1>
        <p className="text-sm text-slate-500">Coming soon — online ordering will live here.</p>
      </div>
      <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
        <ShoppingBag className="size-10 text-slate-300 mx-auto" />
        <p className="mt-4 text-sm font-medium text-slate-700">No orders yet</p>
        <p className="mt-1 text-xs text-slate-500">When online ordering ships, customer orders will appear in this list.</p>
      </div>
    </div>
  );
}
