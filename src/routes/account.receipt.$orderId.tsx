import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Receipt, type ReceiptOrder } from "@/components/site/Receipt";
import { Button } from "@/components/ui/button";
import { Download, Printer, ArrowLeft } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export const Route = createFileRoute("/account/receipt/$orderId")({
  component: ReceiptPage,
});

function ReceiptPage() {
  const { orderId } = Route.useParams();
  const [order, setOrder] = useState<ReceiptOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data: o } = await supabase
        .from("orders")
        .select(
          "id,order_number,status,payment_status,subtotal_cents,total_cents,discount_cents,pickup_time,created_at,customer_name,order_notes",
        )
        .eq("id", orderId)
        .maybeSingle();
      const { data: items } = await supabase
        .from("order_items")
        .select("name,quantity,unit_price_cents,special_notes")
        .eq("order_id", orderId);
      if (o) setOrder({ ...(o as any), items: items ?? [] });
      setLoading(false);
    })();
  }, [orderId]);

  async function downloadPdf() {
    if (!receiptRef.current || !order) return;
    const canvas = await html2canvas(receiptRef.current, {
      backgroundColor: "#0f0710",
      scale: 2,
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      unit: "pt",
      format: [canvas.width * 0.5, canvas.height * 0.5],
    });
    pdf.addImage(imgData, "PNG", 0, 0, canvas.width * 0.5, canvas.height * 0.5);
    pdf.save(`BMC-${String(order.order_number).padStart(6, "0")}.pdf`);
  }

  if (loading) return <div className="min-h-screen grid place-items-center">Loading…</div>;
  if (!order)
    return (
      <div className="min-h-screen grid place-items-center px-4">
        <div className="text-center">
          <h1 className="font-display text-3xl">Receipt not found</h1>
          <Link to="/account" className="text-fire underline mt-4 inline-block">
            Back to account
          </Link>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-[--pink]/20 py-4 px-4 print:hidden">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <Link
            to="/account"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:underline"
          >
            <ArrowLeft className="size-4" /> My Orders
          </Link>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-4 mr-1.5" /> Print
            </Button>
            <Button
              size="sm"
              className="bg-fire text-white hover:opacity-95"
              onClick={downloadPdf}
            >
              <Download className="size-4 mr-1.5" /> Download PDF
            </Button>
          </div>
        </div>
      </header>
      <main className="py-8 px-4 print:p-0">
        <Receipt ref={receiptRef} order={order} />
      </main>
    </div>
  );
}
