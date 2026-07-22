import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Save,
  GripVertical,
  Upload,
  ImageOff,
  Pencil,
  Check,
  X,
} from "lucide-react";
import imageCompression from "browser-image-compression";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export const Route = createFileRoute("/admin/menu")({
  component: MenuPage,
});

const DEFAULT_SECTIONS: SectionRow[] = [
  { id: "coffee", slug: "coffee", title: "Coffee", blurb: null, sort_order: 1 },
  { id: "non-coffee", slug: "non-coffee", title: "Non-Coffee", blurb: null, sort_order: 2 },
  { id: "tea", slug: "tea", title: "Tea", blurb: null, sort_order: 3 },
  { id: "seasonal", slug: "seasonal", title: "Seasonal", blurb: null, sort_order: 4 },
];

type SectionRow = {
  id: string;
  slug: string;
  title: string;
  blurb: string | null;
  sort_order: number;
};

type MenuRow = {
  id: string;
  section: string;
  name: string;
  price: string | null;
  note: string | null;
  is_gf_v: boolean;
  is_sold_out: boolean;
  sort_order: number;
  image_url: string | null;
  original_price_cents: number | null;
  discount_type: "percent" | "amount" | null;
  discount_value: number | null;
};

const MENU_IMAGE_BUCKET = "products";

function formatCentsShort(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function computeDiscountedPrice(row: {
  original_price_cents: number | null;
  discount_type: "percent" | "amount" | null;
  discount_value: number | null;
}): { finalCents: number | null; priceStr: string | null } {
  if (row.original_price_cents == null || !row.discount_type || row.discount_value == null) {
    return { finalCents: null, priceStr: null };
  }
  let finalCents = row.original_price_cents;
  if (row.discount_type === "percent") {
    finalCents = Math.round(row.original_price_cents * (1 - row.discount_value / 100));
  } else {
    finalCents = Math.max(0, row.original_price_cents - Math.round(row.discount_value * 100));
  }
  return { finalCents, priceStr: formatCentsShort(finalCents) };
}

function computePriceCents(row: {
  original_price_cents: number | null;
  discount_type: "percent" | "amount" | null;
  discount_value: number | null;
}): number | null {
  if (row.original_price_cents == null) return null;
  if (!row.discount_type || row.discount_value == null) return row.original_price_cents;
  if (row.discount_type === "percent") {
    return Math.round(row.original_price_cents * (1 - row.discount_value / 100));
  }
  return Math.round(row.original_price_cents - row.discount_value * 100);
}

function MenuPage() {
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [sectionsAvailable, setSectionsAvailable] = useState(true);
  const [rows, setRows] = useState<MenuRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<string | null>(null);

  async function loadSections() {
    // menu_sections is optional — if the table isn't in the DB yet we fall back
    // to the built-in section list so the page still works.
    const { data, error } = await supabase
      .from("menu_sections" as any)
      .select("*")
      .order("sort_order");
    if (error) {
      setSectionsAvailable(false);
      setSections(DEFAULT_SECTIONS);
      return;
    }
    setSectionsAvailable(true);
    const list = ((data ?? []) as SectionRow[]).sort((a, b) => a.sort_order - b.sort_order);
    setSections(list.length ? list : DEFAULT_SECTIONS);
  }

  async function loadRows() {
    const { data } = await supabase
      .from("menu_items")
      .select("*")
      .order("section")
      .order("sort_order");
    setRows((data ?? []) as MenuRow[]);
  }

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadSections(), loadRows()]);
    setLoading(false);
  }
  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!active && sections.length) setActive(sections[0].slug);
    if (active && !sections.some((s) => s.slug === active) && sections.length) {
      setActive(sections[0].slug);
    }
  }, [sections, active]);

  async function addSection() {
    if (!sectionsAvailable) {
      toast.error(
        "Run scripts/sql/menu_sections_and_site_images_columns.sql in Supabase to enable custom sections.",
      );
      return;
    }
    const title = prompt("New section name (e.g. Pastries)");
    if (!title) return;
    const slug = slugify(title);
    if (!slug) return toast.error("Invalid name");
    if (sections.some((s) => s.slug === slug)) return toast.error("A section with that slug already exists");
    const nextOrder = sections.reduce((m, s) => Math.max(m, s.sort_order), 0) + 1;
    const { error } = await supabase
      .from("menu_sections" as any)
      .insert({ slug, title, blurb: null, sort_order: nextOrder });
    if (error) return toast.error(error.message);
    toast.success("Section added");
    await loadSections();
    setActive(slug);
  }

  async function renameSection(s: SectionRow, next: { title: string; blurb: string | null }) {
    if (!sectionsAvailable) return;
    const { error } = await supabase
      .from("menu_sections" as any)
      .update({ title: next.title, blurb: next.blurb })
      .eq("id", s.id);
    if (error) return toast.error(error.message);
    setSections((cur) => cur.map((x) => (x.id === s.id ? { ...x, ...next } : x)));
    toast.success("Section updated");
  }

  async function deleteSection(s: SectionRow) {
    if (!sectionsAvailable) return;
    const itemsHere = rows.filter((r) => r.section === s.slug).length;
    if (itemsHere > 0) {
      toast.error(`Move or delete the ${itemsHere} item(s) in this section first.`);
      return;
    }
    if (!confirm(`Delete section "${s.title}"?`)) return;
    const { error } = await supabase.from("menu_sections" as any).delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Section deleted");
    await loadSections();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Menu</h1>
          <p className="text-sm text-slate-500">
            Drag to reorder. Toggle "Sold Out" to keep an item listed but mark it unavailable.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={addSection}>
          <Plus className="size-4 mr-1" /> Add section
        </Button>
      </div>

      {!sectionsAvailable && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Custom sections aren't set up yet. Run{" "}
          <code className="font-mono">scripts/sql/menu_sections_and_site_images_columns.sql</code>{" "}
          in Supabase to rename or add sections.
        </div>
      )}

      {loading || !active ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <Tabs value={active} onValueChange={setActive}>
          <TabsList className="flex-wrap h-auto">
            {sections.map((s) => (
              <TabsTrigger key={s.slug} value={s.slug}>
                {s.title}
              </TabsTrigger>
            ))}
          </TabsList>
          {sections.map((sec) => (
            <TabsContent key={sec.slug} value={sec.slug} className="mt-4 space-y-4">
              {sectionsAvailable && (
                <SectionHeader
                  section={sec}
                  onSave={(patch) => renameSection(sec, patch)}
                  onDelete={() => deleteSection(sec)}
                  canDelete={rows.filter((r) => r.section === sec.slug).length === 0}
                />
              )}
              <SectionEditor
                section={sec.slug}
                rows={rows.filter((r) => r.section === sec.slug)}
                onChange={setRows}
                reload={loadRows}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

function SectionHeader({
  section,
  onSave,
  onDelete,
  canDelete,
}: {
  section: SectionRow;
  onSave: (patch: { title: string; blurb: string | null }) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(section.title);
  const [blurb, setBlurb] = useState(section.blurb ?? "");

  useEffect(() => {
    setTitle(section.title);
    setBlurb(section.blurb ?? "");
  }, [section.id, section.title, section.blurb]);

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-3 bg-white rounded-2xl border border-slate-200 p-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Section</p>
          <p className="text-lg font-semibold text-slate-900">{section.title}</p>
          {section.blurb && <p className="text-sm text-slate-500">{section.blurb}</p>}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5 mr-1" /> Rename
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onDelete}
            disabled={!canDelete}
            title={canDelete ? "Delete section" : "Move items out first"}
          >
            <Trash2 className="size-3.5 text-red-500" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Section title"
      />
      <Textarea
        rows={2}
        value={blurb}
        onChange={(e) => setBlurb(e.target.value)}
        placeholder="Optional blurb shown under the section title"
      />
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setEditing(false);
            setTitle(section.title);
            setBlurb(section.blurb ?? "");
          }}
        >
          <X className="size-3.5 mr-1" /> Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => {
            onSave({ title: title.trim() || section.title, blurb: blurb.trim() || null });
            setEditing(false);
          }}
        >
          <Check className="size-3.5 mr-1" /> Save
        </Button>
      </div>
    </div>
  );
}

function SectionEditor({
  section,
  rows,
  onChange,
  reload,
}: {
  section: string;
  rows: MenuRow[];
  onChange: React.Dispatch<React.SetStateAction<MenuRow[]>>;
  reload: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function addItem() {
    const maxSort = rows.reduce((m, r) => Math.max(m, r.sort_order), 0);
    const { error } = await supabase.from("menu_items").insert({
      section,
      name: "New item",
      price: "",
      note: "",
      is_gf_v: false,
      is_sold_out: false,
      sort_order: maxSort + 1,
    });
    if (error) return toast.error(error.message);
    reload();
  }
  async function saveRow(r: MenuRow) {
    let priceToSave = r.price;
    const originalCents = r.original_price_cents;
    const discountInput = {
      original_price_cents: originalCents,
      discount_type: r.discount_type,
      discount_value: r.discount_value,
    };
    const { finalCents, priceStr } = computeDiscountedPrice(discountInput);
    const priceCents = computePriceCents(discountInput);
    if (priceStr) priceToSave = priceStr;

    const payload: Partial<MenuRow> & { price_cents?: number } = {
      name: r.name,
      price: priceToSave,
      note: r.note,
      is_gf_v: r.is_gf_v,
      is_sold_out: r.is_sold_out,
      sort_order: r.sort_order,
      image_url: r.image_url,
      original_price_cents: finalCents != null ? originalCents : null,
      discount_type: r.discount_type,
      discount_value: r.discount_value,
    };
    if (priceCents != null) payload.price_cents = priceCents;

    const { error } = await supabase.from("menu_items").update(payload).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Saved");
  }
  async function deleteRow(id: string) {
    if (!confirm("Delete this item?")) return;
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    onChange((rs) => rs.filter((r) => r.id !== id));
  }
  function updateLocal(id: string, patch: Partial<MenuRow>) {
    onChange((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  async function quickToggleSoldOut(r: MenuRow, v: boolean) {
    updateLocal(r.id, { is_sold_out: v });
    const { error } = await supabase.from("menu_items").update({ is_sold_out: v }).eq("id", r.id);
    if (error) toast.error(error.message);
    const { error: inventoryError } = await supabase.from("inventory").upsert(
      {
        menu_item_id: r.id,
        available: !v,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "menu_item_id" },
    );
    if (inventoryError) toast.error(inventoryError.message);
  }

  async function uploadImage(r: MenuRow, file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are supported.");
      return;
    }
    let compressed: File;
    try {
      compressed = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        fileType: file.type === "image/png" ? "image/png" : "image/jpeg",
      });
    } catch {
      compressed = file;
    }
    const safeName = compressed.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `products/menu/${r.id}/${Date.now()}-${safeName}`;
    const up = await supabase.storage
      .from(MENU_IMAGE_BUCKET)
      .upload(path, compressed, { upsert: true, contentType: compressed.type });
    if (up.error) return toast.error(up.error.message);
    const signed = await supabase.storage
      .from(MENU_IMAGE_BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (signed.error || !signed.data)
      return toast.error(signed.error?.message ?? "Failed to sign URL");
    const url = signed.data.signedUrl;
    updateLocal(r.id, { image_url: url });
    const { error } = await supabase.from("menu_items").update({ image_url: url }).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Image uploaded");
  }

  async function removeImage(r: MenuRow) {
    if (!r.image_url) return;
    if (!confirm("Remove this image?")) return;
    updateLocal(r.id, { image_url: null });
    const { error } = await supabase.from("menu_items").update({ image_url: null }).eq("id", r.id);
    if (error) toast.error(error.message);
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    const reordered = arrayMove(rows, oldIndex, newIndex);
    const updates = reordered.map((r, i) => ({ ...r, sort_order: i + 1 }));
    onChange((rs) => {
      const others = rs.filter((x) => x.section !== section);
      return [...others, ...updates];
    });
    const results = await Promise.all(
      updates.map((r) =>
        supabase.from("menu_items").update({ sort_order: r.sort_order }).eq("id", r.id),
      ),
    );
    if (results.some((r) => r.error)) {
      toast.error("Failed to save new order — reloading");
      reload();
    } else {
      toast.success("Order saved");
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          {rows.length} item{rows.length === 1 ? "" : "s"}
        </p>
        <Button size="sm" variant="outline" onClick={addItem}>
          <Plus className="size-4 mr-1" /> Add item
        </Button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {rows.length === 0 && <p className="text-sm text-slate-400">No items yet.</p>}
            {rows.map((r) => (
              <SortableRow
                key={r.id}
                row={r}
                onUpdate={(p) => updateLocal(r.id, p)}
                onSave={() => saveRow(r)}
                onDelete={() => deleteRow(r.id)}
                onToggleSold={(v) => quickToggleSoldOut(r, v)}
                onUploadImage={(f) => uploadImage(r, f)}
                onRemoveImage={() => removeImage(r)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableRow({
  row,
  onUpdate,
  onSave,
  onDelete,
  onToggleSold,
  onUploadImage,
  onRemoveImage,
}: {
  row: MenuRow;
  onUpdate: (p: Partial<MenuRow>) => void;
  onSave: () => void;
  onDelete: () => void;
  onToggleSold: (v: boolean) => void;
  onUploadImage: (f: File) => void;
  onRemoveImage: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid gap-3 sm:grid-cols-12 items-start p-3 rounded-lg border border-slate-200 bg-white"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="sm:col-span-1 flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing py-2"
        aria-label="Drag to reorder"
      >
        <GripVertical className="size-4" />
      </button>
      <div className="sm:col-span-2 flex flex-col gap-1.5">
        <div className="aspect-video w-full overflow-hidden rounded-md bg-slate-100 border border-slate-200">
          {row.image_url ? (
            <img src={row.image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full grid place-items-center text-slate-400">
              <ImageOff className="size-4" />
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUploadImage(f);
            e.currentTarget.value = "";
          }}
        />
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-xs px-2"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-3 mr-1" /> {row.image_url ? "Replace" : "Upload"}
          </Button>
          {row.image_url && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              onClick={onRemoveImage}
              aria-label="Remove image"
            >
              <Trash2 className="size-3 text-red-500" />
            </Button>
          )}
        </div>
      </div>
      <Input
        className="sm:col-span-2"
        value={row.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        placeholder="Name"
      />
      <Input
        className="sm:col-span-1"
        value={row.price ?? ""}
        onChange={(e) => onUpdate({ price: e.target.value })}
        placeholder="Price"
      />
      <Textarea
        className="sm:col-span-2"
        rows={1}
        value={row.note ?? ""}
        onChange={(e) => onUpdate({ note: e.target.value })}
        placeholder="Note / tasting notes"
      />
      <label className="sm:col-span-1 flex items-center gap-1.5 text-xs text-slate-600">
        <Switch checked={row.is_gf_v} onCheckedChange={(v) => onUpdate({ is_gf_v: v })} />
        GF/V
      </label>
      <label className="sm:col-span-1 flex items-center gap-1.5 text-xs text-slate-600">
        <Switch checked={row.is_sold_out} onCheckedChange={onToggleSold} />
        Sold out
      </label>
      <div className="sm:col-span-2 flex gap-1 justify-end">
        <Button size="icon" variant="outline" onClick={onSave}>
          <Save className="size-4" />
        </Button>
        <Button size="icon" variant="outline" onClick={onDelete}>
          <Trash2 className="size-4 text-red-500" />
        </Button>
      </div>

      {/* Discount editor — full row */}
      <div className="sm:col-span-12 mt-2 pt-3 border-t border-slate-100 grid gap-2 sm:grid-cols-12 items-end">
        <div className="sm:col-span-3">
          <label className="text-[10px] uppercase tracking-wider text-slate-500">
            Original price ($)
          </label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={
              row.original_price_cents != null ? (row.original_price_cents / 100).toFixed(2) : ""
            }
            onChange={(e) =>
              onUpdate({
                original_price_cents: e.target.value
                  ? Math.round(parseFloat(e.target.value) * 100)
                  : null,
              })
            }
            placeholder="e.g. 5.50"
          />
        </div>
        <div className="sm:col-span-3">
          <label className="text-[10px] uppercase tracking-wider text-slate-500">
            Discount type
          </label>
          <select
            className="w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
            value={row.discount_type ?? ""}
            onChange={(e) =>
              onUpdate({
                discount_type: (e.target.value || null) as "percent" | "amount" | null,
              })
            }
          >
            <option value="">None</option>
            <option value="percent">Percent (%)</option>
            <option value="amount">Fixed ($)</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="text-[10px] uppercase tracking-wider text-slate-500">Value</label>
          <Input
            type="number"
            step="0.01"
            min="0"
            disabled={!row.discount_type}
            value={row.discount_value ?? ""}
            onChange={(e) =>
              onUpdate({
                discount_value: e.target.value ? parseFloat(e.target.value) : null,
              })
            }
            placeholder={row.discount_type === "percent" ? "20" : "1.50"}
          />
        </div>
        <div className="sm:col-span-4 text-xs text-slate-600">
          {(() => {
            const preview = computeDiscountedPrice({
              original_price_cents: row.original_price_cents,
              discount_type: row.discount_type,
              discount_value: row.discount_value,
            });
            if (!preview.priceStr) return <span className="text-slate-400">No discount</span>;
            return (
              <span>
                Customer sees:{" "}
                <span className="font-semibold text-pink-600">{preview.priceStr}</span> (was{" "}
                {row.original_price_cents != null
                  ? formatCentsShort(row.original_price_cents)
                  : "—"}
                )
              </span>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
