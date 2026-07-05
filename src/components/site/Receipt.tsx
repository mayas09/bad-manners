import { forwardRef } from "react";
import logo from "@/assets/logo.jpg";
import { formatCents } from "@/lib/price-utils";
import { formatInSiteTime } from "@/lib/time-utils";

export type ReceiptOrder = {
  id: string;
  order_number: number;
  status: string;
  payment_status: string;
  subtotal_cents: number | null;
  total_cents: number;
  discount_cents: number | null;
  pickup_time: string;
  created_at: string;
  customer_name: string;
  order_notes?: string | null;
  items: {
    name: string;
    quantity: number;
    unit_price_cents: number;
    special_notes?: string | null;
  }[];
};

function receiptNumber(orderNumber: number) {
  return `BMC-${String(orderNumber).padStart(6, "0")}`;
}

export const Receipt = forwardRef<HTMLDivElement, { order: ReceiptOrder }>(
  function Receipt({ order }, ref) {
    const subtotal =
      order.subtotal_cents ??
      order.items.reduce((s, it) => s + it.quantity * it.unit_price_cents, 0);
    const discount = order.discount_cents ?? 0;
    const paidLabel =
      order.payment_status === "paid"
        ? "Paid via Card"
        : order.payment_status === "pay_on_pickup"
          ? "Pay on Pickup"
          : order.payment_status === "refunded"
            ? "Refunded"
            : "Unpaid";

    return (
      <div
        ref={ref}
        className="mx-auto max-w-[560px] bg-[#0f0710] text-[#fce7f3] p-8 font-sans"
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        <div className="text-center">
          <img
            src={logo}
            alt="Bad Manners Coffee"
            className="mx-auto size-20 rounded-full border-2 border-[#ec4899]"
          />
          <h1
            className="mt-3 text-3xl tracking-widest"
            style={{ fontFamily: "'UnifrakturCook', 'Cinzel', serif", color: "#ec4899" }}
          >
            Bad Manners
          </h1>
          <p className="text-xs uppercase tracking-[0.3em] text-[#f9a8d4]">Coffee · Receipt</p>
        </div>

        <div className="my-5 h-[2px] w-full bg-gradient-to-r from-transparent via-[#ec4899] to-transparent" />

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#f9a8d4]">Receipt #</p>
            <p className="font-mono text-white">{receiptNumber(order.order_number)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-[#f9a8d4]">Date</p>
            <p className="text-white">
              {formatInSiteTime(order.created_at, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#f9a8d4]">Customer</p>
            <p className="text-white">{order.customer_name}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-[#f9a8d4]">Pickup</p>
            <p className="text-white">
              {formatInSiteTime(order.pickup_time, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>

        <div className="my-5 h-px w-full bg-[#ec4899]/40" />

        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-[#f9a8d4]">
              <th className="py-1 text-left">Item</th>
              <th className="py-1 text-center">Qty</th>
              <th className="py-1 text-right">Price</th>
              <th className="py-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => (
              <tr key={i} className="align-top border-t border-[#ec4899]/20">
                <td className="py-2 pr-2 text-white">
                  {it.name}
                  {it.special_notes && (
                    <div className="text-[11px] italic text-[#f9a8d4]">
                      Note: {it.special_notes}
                    </div>
                  )}
                </td>
                <td className="py-2 text-center text-white">{it.quantity}</td>
                <td className="py-2 text-right text-white">
                  {formatCents(it.unit_price_cents)}
                </td>
                <td className="py-2 text-right text-[#ec4899] font-semibold">
                  {formatCents(it.quantity * it.unit_price_cents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {order.order_notes && (
          <p className="mt-3 text-xs italic text-[#f9a8d4]">Order note: {order.order_notes}</p>
        )}

        <div className="my-4 h-px w-full bg-[#ec4899]/40" />

        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-[#f9a8d4]">Subtotal</span>
            <span className="text-white">{formatCents(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between">
              <span className="text-[#f9a8d4]">Free drink redemption</span>
              <span className="text-emerald-300">-{formatCents(discount)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 mt-2 border-t border-[#ec4899]/40 text-lg font-semibold">
            <span className="text-white">Total</span>
            <span className="text-[#ec4899]">{formatCents(order.total_cents)}</span>
          </div>
          <div className="flex justify-between pt-2 text-xs uppercase tracking-widest">
            <span className="text-[#f9a8d4]">Payment</span>
            <span className="text-white">{paidLabel}</span>
          </div>
        </div>

        <div className="my-5 h-[2px] w-full bg-gradient-to-r from-transparent via-[#ec4899] to-transparent" />

        <div className="text-center text-[11px] leading-relaxed text-[#f9a8d4]">
          <p>697 Haywood Rd, Suite G, Asheville NC 28806</p>
          <p className="mt-1">Thank you for your bad manners 🖤</p>
          <p className="mt-2">Instagram: @badmannerscoffee</p>
          <p>Facebook: @badmannerscoffee</p>
        </div>
      </div>
    );
  },
);
