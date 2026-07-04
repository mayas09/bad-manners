import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Trash2, Save, GripVertical, Upload, ImageOff } from "lucide-react";
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

const SECTIONS = [
  { id: "coffee", label: "Coffee" },
  { id: "non-coffee", label: "Non-Coffee" },
  { id: "tea", label: "Tea" },
  { id: "seasonal", label: "Seasonal" },
];

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
};

function MenuPage() {
  const [rows, setRows] = useState<MenuRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("menu_items")
      .select("*")
      .order("section")
      .order("sort_order");
    setRows((data ?? []) as MenuRow[]);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Menu</h1>
        <p className="text-sm text-slate-500">
          Drag to reorder. Toggle "Sold Out" to keep an item listed but mark it unavailable.
        </p>
      </div>
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <Tabs defaultValue="coffee">
          <TabsList>
            {SECTIONS.map((s) => (
              <TabsTrigger key={s.id} value={s.id}>
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {SECTIONS.map((sec) => (
            <TabsContent key={sec.id} value={sec.id} className="mt-4">
              <SectionEditor
                section={sec.id}
                rows={rows.filter((r) => r.section === sec.id)}
                onChange={setRows}
                reload={load}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
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
    const { error } = await supabase
      .from("menu_items")
      .update({
        name: r.name,
        price: r.price,
        note: r.note,
        is_gf_v: r.is_gf_v,
        is_sold_out: r.is_sold_out,
        sort_order: r.sort_order,
        image_url: r.image_url,
      })
      .eq("id", r.id);
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
    const path = `menu/${r.id}/${Date.now()}-${safeName}`;
    const up = await supabase.storage
      .from("site-images")
      .upload(path, compressed, { upsert: true, contentType: compressed.type });
    if (up.error) return toast.error(up.error.message);
    const signed = await supabase.storage
      .from("site-images")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (signed.error || !signed.data)
      return toast.error(signed.error?.message ?? "Failed to sign URL");
    const url = signed.data.signedUrl;
    updateLocal(r.id, { image_url: url });
    const { error } = await supabase
      .from("menu_items")
      .update({ image_url: url })
      .eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Image uploaded");
  }

  async function removeImage(r: MenuRow) {
    if (!r.image_url) return;
    if (!confirm("Remove this image?")) return;
    updateLocal(r.id, { image_url: null });
    const { error } = await supabase
      .from("menu_items")
      .update({ image_url: null })
      .eq("id", r.id);
    if (error) toast.error(error.message);
  }


  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    const reordered = arrayMove(rows, oldIndex, newIndex);
    // Re-sort
    const updates = reordered.map((r, i) => ({ ...r, sort_order: i + 1 }));
    onChange((rs) => {
      const others = rs.filter((x) => x.section !== section);
      return [...others, ...updates];
    });
    // Persist
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
}: {
  row: MenuRow;
  onUpdate: (p: Partial<MenuRow>) => void;
  onSave: () => void;
  onDelete: () => void;
  onToggleSold: (v: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
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
      <Input
        className="sm:col-span-3"
        value={row.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        placeholder="Name"
      />
      <Input
        className="sm:col-span-2"
        value={row.price ?? ""}
        onChange={(e) => onUpdate({ price: e.target.value })}
        placeholder="Price"
      />
      <Textarea
        className="sm:col-span-3"
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
      <div className="sm:col-span-1 flex gap-1 justify-end">
        <Button size="icon" variant="outline" onClick={onSave}>
          <Save className="size-4" />
        </Button>
        <Button size="icon" variant="outline" onClick={onDelete}>
          <Trash2 className="size-4 text-red-500" />
        </Button>
      </div>
    </div>
  );
}
