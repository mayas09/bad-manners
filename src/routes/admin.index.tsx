import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/lib/use-admin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { LogOut, Plus, Trash2, Upload, Save } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

const SECTIONS = [
  { id: "coffee", label: "Coffee" },
  { id: "non-coffee", label: "Non-Coffee" },
  { id: "tea", label: "Tea" },
  { id: "seasonal", label: "Seasonal" },
];

function AdminDashboard() {
  const auth = useAdminAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.loading && !auth.user) navigate({ to: "/admin/login" });
  }, [auth.loading, auth.user, navigate]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/admin/login" });
  }

  if (auth.loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>;
  if (!auth.user) return null;
  if (!auth.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md text-center bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <h1 className="text-xl font-semibold text-slate-900">Not authorized</h1>
          <p className="mt-2 text-sm text-slate-500">Your account is signed in but doesn't have admin access.</p>
          <Button variant="outline" className="mt-6" onClick={signOut}>Sign out</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Bad Manners — Admin</h1>
            <p className="text-xs text-slate-500">{auth.user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild><Link to="/">View site</Link></Button>
            <Button variant="outline" onClick={signOut}><LogOut className="size-4 mr-1.5" /> Logout</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Tabs defaultValue="menu">
          <TabsList>
            <TabsTrigger value="menu">Menu</TabsTrigger>
            <TabsTrigger value="photos">Photos</TabsTrigger>
            <TabsTrigger value="info">Business Info</TabsTrigger>
          </TabsList>
          <TabsContent value="menu" className="mt-6"><MenuManager /></TabsContent>
          <TabsContent value="photos" className="mt-6"><PhotoManager /></TabsContent>
          <TabsContent value="info" className="mt-6"><InfoManager /></TabsContent>
        </Tabs>
      </main>
      <Toaster richColors position="top-center" />
    </div>
  );
}

/* -------------------------------- Menu ---------------------------------- */

type MenuRow = {
  id: string;
  section: string;
  name: string;
  price: string | null;
  note: string | null;
  is_gf_v: boolean;
  sort_order: number;
};

function MenuManager() {
  const [rows, setRows] = useState<MenuRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("menu_items").select("*").order("section").order("sort_order");
    setRows((data ?? []) as MenuRow[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function addItem(section: string) {
    const maxSort = rows.filter((r) => r.section === section).reduce((m, r) => Math.max(m, r.sort_order), 0);
    const { error } = await supabase.from("menu_items").insert({
      section, name: "New item", price: "", note: "", is_gf_v: false, sort_order: maxSort + 1,
    });
    if (error) return toast.error(error.message);
    load();
  }
  async function saveRow(r: MenuRow) {
    const { error } = await supabase.from("menu_items").update({
      name: r.name, price: r.price, note: r.note, is_gf_v: r.is_gf_v, sort_order: r.sort_order,
    }).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Saved");
  }
  async function deleteRow(id: string) {
    if (!confirm("Delete this item?")) return;
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setRows((rs) => rs.filter((r) => r.id !== id));
  }
  function updateLocal(id: string, patch: Partial<MenuRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-8">
      {SECTIONS.map((sec) => {
        const items = rows.filter((r) => r.section === sec.id);
        return (
          <section key={sec.id} className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">{sec.label}</h2>
              <Button size="sm" variant="outline" onClick={() => addItem(sec.id)}>
                <Plus className="size-4 mr-1" /> Add item
              </Button>
            </div>
            <div className="space-y-3">
              {items.length === 0 && <p className="text-sm text-slate-400">No items.</p>}
              {items.map((r) => (
                <div key={r.id} className="grid gap-3 sm:grid-cols-12 items-start p-3 rounded-lg border border-slate-200">
                  <Input className="sm:col-span-3" value={r.name} onChange={(e) => updateLocal(r.id, { name: e.target.value })} placeholder="Name" />
                  <Input className="sm:col-span-2" value={r.price ?? ""} onChange={(e) => updateLocal(r.id, { price: e.target.value })} placeholder="Price" />
                  <Textarea className="sm:col-span-4" rows={1} value={r.note ?? ""} onChange={(e) => updateLocal(r.id, { note: e.target.value })} placeholder="Note / tasting notes" />
                  <label className="sm:col-span-1 flex items-center gap-2 text-xs text-slate-600">
                    <Switch checked={r.is_gf_v} onCheckedChange={(v) => updateLocal(r.id, { is_gf_v: v })} />
                    GF/V
                  </label>
                  <Input className="sm:col-span-1" type="number" value={r.sort_order} onChange={(e) => updateLocal(r.id, { sort_order: Number(e.target.value) })} />
                  <div className="sm:col-span-1 flex gap-1 justify-end">
                    <Button size="icon" variant="outline" onClick={() => saveRow(r)}><Save className="size-4" /></Button>
                    <Button size="icon" variant="outline" onClick={() => deleteRow(r.id)}><Trash2 className="size-4 text-red-500" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* -------------------------------- Photos -------------------------------- */

type ImgRow = { id: string; key: string; url: string; storage_path: string | null; category: string; sort_order: number };

const IMAGE_SLOTS: { key: string; label: string; category: string }[] = [
  { key: "hero_interior", label: "Hero — Interior", category: "hero" },
  { key: "story", label: "Story section", category: "story" },
  { key: "community", label: "Community section", category: "community" },
  { key: "gallery_1", label: "Gallery 1", category: "gallery" },
  { key: "gallery_2", label: "Gallery 2", category: "gallery" },
  { key: "gallery_3", label: "Gallery 3", category: "gallery" },
  { key: "gallery_4", label: "Gallery 4", category: "gallery" },
  { key: "gallery_5", label: "Gallery 5", category: "gallery" },
  { key: "gallery_6", label: "Gallery 6", category: "gallery" },
];

function PhotoManager() {
  const [rows, setRows] = useState<ImgRow[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("site_images").select("*").order("category").order("sort_order");
    setRows((data ?? []) as ImgRow[]);
  }
  useEffect(() => { load(); }, []);

  async function upload(slotKey: string, file: File) {
    setUploading(slotKey);
    try {
      const path = `${slotKey}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const up = await supabase.storage.from("site-images").upload(path, file, { upsert: true });
      if (up.error) { toast.error(up.error.message); return; }
      // Sign for ~10 years (effectively long-lived)
      const signed = await supabase.storage.from("site-images").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (signed.error || !signed.data) { toast.error(signed.error?.message ?? "Failed to sign URL"); return; }
      const existing = rows.find((r) => r.key === slotKey);
      const payload = { key: slotKey, url: signed.data.signedUrl, storage_path: path, category: IMAGE_SLOTS.find((s) => s.key === slotKey)?.category ?? "general" };
      let resp;
      if (existing) {
        resp = await supabase.from("site_images").update(payload).eq("key", slotKey);
        // best-effort cleanup of prior storage object
        if (existing.storage_path && existing.storage_path !== path) {
          await supabase.storage.from("site-images").remove([existing.storage_path]);
        }
      } else {
        resp = await supabase.from("site_images").insert({ ...payload, sort_order: IMAGE_SLOTS.findIndex((s) => s.key === slotKey) + 1 });
      }
      if (resp.error) { toast.error(resp.error.message); return; }
      toast.success("Image updated");
      load();
    } finally {
      setUploading(null);
    }
  }

  async function clearSlot(slotKey: string) {
    const existing = rows.find((r) => r.key === slotKey);
    if (!existing) return;
    if (!confirm("Remove this image? Site will fall back to the seeded photo until a new one is uploaded.")) return;
    if (existing.storage_path) await supabase.storage.from("site-images").remove([existing.storage_path]);
    const { error } = await supabase.from("site_images").delete().eq("key", slotKey);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {IMAGE_SLOTS.map((slot) => {
        const row = rows.find((r) => r.key === slot.key);
        return (
          <div key={slot.key} className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-900">{slot.label}</p>
            <div className="mt-3 aspect-video bg-slate-100 rounded-lg overflow-hidden">
              {row?.url ? <img src={row.url} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full grid place-items-center text-xs text-slate-400">No image</div>}
            </div>
            <div className="mt-3 flex gap-2">
              <label className="flex-1">
                <input
                  type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(slot.key, f); e.currentTarget.value = ""; }}
                />
                <span className="cursor-pointer inline-flex items-center justify-center w-full h-9 rounded-md border border-slate-300 bg-white text-sm hover:bg-slate-50">
                  <Upload className="size-4 mr-1.5" /> {uploading === slot.key ? "Uploading…" : row ? "Replace" : "Upload"}
                </span>
              </label>
              {row && (
                <Button size="icon" variant="outline" onClick={() => clearSlot(slot.key)}><Trash2 className="size-4 text-red-500" /></Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------- Info --------------------------------- */

const INFO_FIELDS: { key: string; label: string }[] = [
  { key: "address_line1", label: "Address line 1" },
  { key: "address_line2", label: "Address line 2" },
  { key: "instagram_url", label: "Instagram URL" },
  { key: "facebook_url", label: "Facebook URL" },
  { key: "gift_card_url", label: "Gift card store URL" },
  { key: "map_query", label: "Map search query" },
];

type HourRow = { id: string; label: string; hours_text: string; sort_order: number };

function InfoManager() {
  const [info, setInfo] = useState<Record<string, string>>({});
  const [hours, setHours] = useState<HourRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [infoRes, hoursRes] = await Promise.all([
      supabase.from("business_info").select("*"),
      supabase.from("business_hours").select("*").order("sort_order"),
    ]);
    const map: Record<string, string> = {};
    (infoRes.data ?? []).forEach((r: any) => { map[r.key] = r.value ?? ""; });
    setInfo(map);
    setHours((hoursRes.data ?? []) as HourRow[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function saveInfo() {
    const rows = INFO_FIELDS.map((f) => ({ key: f.key, value: info[f.key] ?? "" }));
    const { error } = await supabase.from("business_info").upsert(rows, { onConflict: "key" });
    if (error) return toast.error(error.message);
    toast.success("Info saved");
  }

  async function addHourRow() {
    const sort = hours.reduce((m, h) => Math.max(m, h.sort_order), 0) + 1;
    const { error } = await supabase.from("business_hours").insert({ label: "Day", hours_text: "9:00 AM – 5:00 PM", sort_order: sort });
    if (error) return toast.error(error.message);
    load();
  }
  async function saveHour(h: HourRow) {
    const { error } = await supabase.from("business_hours").update({ label: h.label, hours_text: h.hours_text, sort_order: h.sort_order }).eq("id", h.id);
    if (error) return toast.error(error.message);
    toast.success("Saved");
  }
  async function deleteHour(id: string) {
    if (!confirm("Delete this row?")) return;
    const { error } = await supabase.from("business_hours").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setHours((hs) => hs.filter((h) => h.id !== id));
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-900">Business Info</h2>
        <div className="mt-4 grid gap-3">
          {INFO_FIELDS.map((f) => (
            <div key={f.key} className="grid gap-1.5">
              <Label htmlFor={f.key} className="text-xs text-slate-600">{f.label}</Label>
              <Input id={f.key} value={info[f.key] ?? ""} onChange={(e) => setInfo((s) => ({ ...s, [f.key]: e.target.value }))} />
            </div>
          ))}
          <Button onClick={saveInfo} className="mt-2"><Save className="size-4 mr-1.5" /> Save info</Button>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Hours</h2>
          <Button size="sm" variant="outline" onClick={addHourRow}><Plus className="size-4 mr-1" /> Add</Button>
        </div>
        <div className="mt-4 space-y-3">
          {hours.map((h) => (
            <div key={h.id} className="grid grid-cols-12 gap-2 items-center">
              <Input className="col-span-4" value={h.label} onChange={(e) => setHours((hs) => hs.map((x) => x.id === h.id ? { ...x, label: e.target.value } : x))} />
              <Input className="col-span-5" value={h.hours_text} onChange={(e) => setHours((hs) => hs.map((x) => x.id === h.id ? { ...x, hours_text: e.target.value } : x))} />
              <Input className="col-span-1" type="number" value={h.sort_order} onChange={(e) => setHours((hs) => hs.map((x) => x.id === h.id ? { ...x, sort_order: Number(e.target.value) } : x))} />
              <div className="col-span-2 flex gap-1 justify-end">
                <Button size="icon" variant="outline" onClick={() => saveHour(h)}><Save className="size-4" /></Button>
                <Button size="icon" variant="outline" onClick={() => deleteHour(h.id)}><Trash2 className="size-4 text-red-500" /></Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
