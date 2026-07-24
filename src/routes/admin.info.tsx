import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/lib/use-admin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Save, Eye, MapPin, Instagram, Facebook, Gift, Clock } from "lucide-react";

export const Route = createFileRoute("/admin/info")({
  component: InfoPage,
});

const INFO_FIELDS: { key: string; label: string }[] = [
  { key: "address_line1", label: "Address line 1" },
  { key: "address_line2", label: "Address line 2" },
  { key: "instagram_url", label: "Instagram URL" },
  { key: "facebook_url", label: "Facebook URL" },
  { key: "gift_card_url", label: "Gift card store URL" },
  { key: "map_query", label: "Map search query" },
];

type DaySetting = {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT_DAYS: DaySetting[] = [
  { day_of_week: 0, open_time: "08:30", close_time: "15:00", is_closed: false },
  { day_of_week: 1, open_time: "08:00", close_time: "15:00", is_closed: false },
  { day_of_week: 2, open_time: "08:00", close_time: "15:00", is_closed: false },
  { day_of_week: 3, open_time: "08:00", close_time: "15:00", is_closed: false },
  { day_of_week: 4, open_time: "08:00", close_time: "15:00", is_closed: false },
  { day_of_week: 5, open_time: "08:00", close_time: "15:00", is_closed: false },
  { day_of_week: 6, open_time: "08:30", close_time: "15:00", is_closed: false },
];

function normalizeTime(t: string): string {
  // Accept "HH:MM" or "HH:MM:SS" and return "HH:MM".
  return t.slice(0, 5);
}


function InfoPage() {
  const admin = useAdminAuth();

  if (!admin.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
          <p className="mt-2 text-slate-600">You must be an admin to view this page.</p>
          <a href="/" className="mt-4 inline-block text-blue-600 underline">
            Go to homepage
          </a>
        </div>
      </div>
    );
  }

  const [info, setInfo] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<DaySetting[]>(DEFAULT_DAYS);
  const [previewOpen, setPreviewOpen] = useState(false);


  async function load() {
    setLoading(true);
    const [infoRes, settingsRes] = await Promise.all([
      supabase.from("business_info").select("*"),
      (supabase.from as any)("business_settings").select("*").order("day_of_week"),
    ]);
    const map: Record<string, string> = {};
    (infoRes.data ?? []).forEach((r: any) => {
      map[r.key] = r.value ?? "";
    });
    setInfo(map);
    const settingsRows = (settingsRes?.data ?? []) as DaySetting[];
    if (settingsRows.length) {
      const merged = DEFAULT_DAYS.map((d) => {
        const found = settingsRows.find((s) => s.day_of_week === d.day_of_week);
        return found
          ? {
              day_of_week: found.day_of_week,
              open_time: normalizeTime(found.open_time),
              close_time: normalizeTime(found.close_time),
              is_closed: !!found.is_closed,
            }
          : d;
      });
      setDays(merged);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function saveInfo() {
    const rows = INFO_FIELDS.map((f) => ({ key: f.key, value: info[f.key] ?? "" }));
    const { error } = await supabase.from("business_info").upsert(rows, { onConflict: "key" });
    if (error) return toast.error(error.message);
    toast.success("Info saved");
  }

  async function saveLoyaltyMilestone() {
    const milestone = Math.max(1, Number(info.loyalty_milestone) || 1);
    const { error } = await supabase
      .from("business_info")
      .upsert({ key: "loyalty_milestone", value: String(milestone) }, { onConflict: "key" });
    if (error) return toast.error(error.message);
    setInfo((s) => ({ ...s, loyalty_milestone: String(milestone) }));
    toast.success("Loyalty milestone saved");
  }
  

  async function saveSchedule() {
    const rows = days.map((d) => ({
      day_of_week: d.day_of_week,
      open_time: d.open_time,
      close_time: d.close_time,
      is_closed: d.is_closed,
    }));
    const { error } = await (supabase.from as any)("business_settings").upsert(rows, {
      onConflict: "day_of_week",
    });
    if (error) return toast.error(error.message);
    toast.success("Pickup hours saved");
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Business info</h1>
          <p className="text-sm text-slate-500">Hours, address, social links, and gift card URL.</p>
        </div>
        <Button variant="outline" onClick={() => setPreviewOpen(true)}>
          <Eye className="size-4 mr-1.5" /> Preview changes
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-base font-semibold text-slate-900">Business info</h2>
          <div className="mt-4 grid gap-3">
            {INFO_FIELDS.map((f) => (
              <div key={f.key} className="grid gap-1.5">
                <Label htmlFor={f.key} className="text-xs text-slate-600">
                  {f.label}
                </Label>
                <Input
                  id={f.key}
                  value={info[f.key] ?? ""}
                  onChange={(e) => setInfo((s) => ({ ...s, [f.key]: e.target.value }))}
                />
              </div>
            ))}
            <Button onClick={saveInfo} className="mt-2">
              <Save className="size-4 mr-1.5" /> Save info
            </Button>
          </div>
        </section>

      </div>

      <section className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Pickup schedule</h2>
            <p className="text-sm text-slate-500">
              Controls the times customers can select at checkout. Times use the store timezone.
            </p>
          </div>
          <Button size="sm" onClick={saveSchedule}>
            <Save className="size-4 mr-1.5" /> Save schedule
          </Button>
        </div>
        <div className="mt-4 space-y-2">
          {days.map((d) => (
            <div key={d.day_of_week} className="grid grid-cols-12 items-center gap-2">
              <span className="col-span-3 text-sm font-medium text-slate-700">
                {DAY_NAMES[d.day_of_week]}
              </span>
              <Input
                type="time"
                className="col-span-3"
                value={d.open_time}
                disabled={d.is_closed}
                onChange={(e) =>
                  setDays((ds) =>
                    ds.map((x) =>
                      x.day_of_week === d.day_of_week ? { ...x, open_time: e.target.value } : x,
                    ),
                  )
                }
              />
              <Input
                type="time"
                className="col-span-3"
                value={d.close_time}
                disabled={d.is_closed}
                onChange={(e) =>
                  setDays((ds) =>
                    ds.map((x) =>
                      x.day_of_week === d.day_of_week ? { ...x, close_time: e.target.value } : x,
                    ),
                  )
                }
              />
              <label className="col-span-3 flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={d.is_closed}
                  onChange={(e) =>
                    setDays((ds) =>
                      ds.map((x) =>
                        x.day_of_week === d.day_of_week ? { ...x, is_closed: e.target.checked } : x,
                      ),
                    )
                  }
                />
                Closed
              </label>
            </div>
          ))}
        </div>
      </section>


      <section className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md">
        <h2 className="text-base font-semibold text-slate-900">Loyalty program</h2>
        <p className="mt-1 text-sm text-slate-500">
          Customers earn a punch per picked-up order and a free drink at the milestone.
        </p>
        <div className="mt-4 grid gap-1.5 max-w-xs">
          <Label htmlFor="loyalty_milestone" className="text-xs text-slate-600">
            Free drink after every X purchases
          </Label>
          <Input
            id="loyalty_milestone"
            type="number"
            min={1}
            value={info.loyalty_milestone ?? ""}
            onChange={(e) => setInfo((s) => ({ ...s, loyalty_milestone: e.target.value }))}
          />
        </div>
        <Button onClick={saveLoyaltyMilestone} className="mt-3">
          <Save className="size-4 mr-1.5" /> Save
        </Button>
      </section>
      
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Preview — Visit Us section</DialogTitle>
          </DialogHeader>
          <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-pink-50 to-orange-50 p-6 text-slate-900">
            <p className="text-xs uppercase tracking-[0.3em] text-pink-700">Visit Us</p>
            <h3 className="mt-2 font-serif text-2xl">Come hang out.</h3>
            <div className="mt-5 grid sm:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <p className="flex items-start gap-2">
                  <MapPin className="size-4 mt-0.5 text-pink-700" />
                  <span>
                    {info.address_line1}
                    <br />
                    {info.address_line2}
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <Clock className="size-4 mt-0.5 text-pink-700" />
                  <span>
                    {hours.map((h) => (
                      <span key={h.id} className="block">
                        <strong>{h.label}:</strong> {h.hours_text}
                      </span>
                    ))}
                  </span>
                </p>
              </div>
              <div className="space-y-2">
                <p className="flex items-center gap-2">
                  <Instagram className="size-4 text-pink-700" />{" "}
                  <a
                    href={info.instagram_url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline truncate"
                  >
                    {info.instagram_url || "—"}
                  </a>
                </p>
                <p className="flex items-center gap-2">
                  <Facebook className="size-4 text-pink-700" />{" "}
                  <a
                    href={info.facebook_url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline truncate"
                  >
                    {info.facebook_url || "—"}
                  </a>
                </p>
                <p className="flex items-center gap-2">
                  <Gift className="size-4 text-pink-700" />{" "}
                  <a
                    href={info.gift_card_url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline truncate"
                  >
                    {info.gift_card_url || "—"}
                  </a>
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              This is how the new info will appear once saved. Map uses search:{" "}
              <em>{info.map_query || "—"}</em>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
