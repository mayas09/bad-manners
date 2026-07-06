import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, Trash2 } from "lucide-react";
import imageCompression from "browser-image-compression";

export const Route = createFileRoute("/admin/photos")({
  component: PhotosPage,
});

type ImgRow = {
  id: string;
  key: string;
  url: string;
  storage_path: string | null;
  category: string;
  sort_order: number;
};

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

function bucketForCategory(category: string) {
  return category === "banner" ? "banners" : "gallery";
}

function bucketForExistingRow(row: ImgRow) {
  if (row.url.includes("/site-images/") || row.url.includes("/site-images?")) return "site-images";
  return bucketForCategory(row.category);
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

async function readImageMeta(file: File): Promise<{ width: number; height: number; size: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight, size: file.size };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function PhotosPage() {
  const [rows, setRows] = useState<ImgRow[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [meta, setMeta] = useState<Record<string, { width: number; height: number; size: number }>>(
    {},
  );

  async function load() {
    const { data } = await supabase
      .from("site_images")
      .select("*")
      .order("category")
      .order("sort_order");
    setRows((data ?? []) as ImgRow[]);
  }
  useEffect(() => {
    load();
  }, []);

  async function upload(slotKey: string, file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are supported.");
      return;
    }
    setUploading(slotKey);
    try {
      // Compress
      let compressed: File;
      try {
        compressed = await imageCompression(file, {
          maxSizeMB: 1.5,
          maxWidthOrHeight: 2000,
          useWebWorker: true,
          fileType: file.type === "image/png" ? "image/png" : "image/jpeg",
        });
      } catch {
        toast.warning("Compression failed — uploading original file uncompressed.");
        compressed = file;
      }
      const m = await readImageMeta(compressed).catch(() => null);

      const safeName = compressed.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const category = IMAGE_SLOTS.find((s) => s.key === slotKey)?.category ?? "general";
      const bucket = bucketForCategory(category);
      const path = `${slotKey}/${Date.now()}-${safeName}`;
      const up = await supabase.storage
        .from(bucket)
        .upload(path, compressed, { upsert: true, contentType: compressed.type });
      if (up.error) {
        toast.error(up.error.message);
        return;
      }
      const signed = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (signed.error || !signed.data) {
        toast.error(signed.error?.message ?? "Failed to sign URL");
        return;
      }

      const existing = rows.find((r) => r.key === slotKey);
      const payload = {
        key: slotKey,
        url: signed.data.signedUrl,
        storage_path: path,
        category,
      };
      let resp;
      if (existing) {
        resp = await supabase.from("site_images").update(payload).eq("key", slotKey);
        const existingBucket = bucketForExistingRow(existing);
        if (
          existingBucket !== "site-images" &&
          existing.storage_path &&
          existing.storage_path !== path
        ) {
          await supabase.storage.from(existingBucket).remove([existing.storage_path]);
        }
      } else {
        resp = await supabase
          .from("site_images")
          .insert({ ...payload, sort_order: IMAGE_SLOTS.findIndex((s) => s.key === slotKey) + 1 });
      }
      if (resp.error) {
        toast.error(resp.error.message);
        return;
      }
      if (m) setMeta((s) => ({ ...s, [slotKey]: m }));
      toast.success(
        `Uploaded · ${m ? `${m.width}×${m.height} · ${formatBytes(m.size)}` : formatBytes(compressed.size)}`,
      );
      load();
    } finally {
      setUploading(null);
    }
  }

  async function clearSlot(slotKey: string) {
    const existing = rows.find((r) => r.key === slotKey);
    if (!existing) return;
    if (!confirm("Remove this image?")) return;
    const existingBucket = bucketForExistingRow(existing);
    if (existingBucket !== "site-images" && existing.storage_path)
      await supabase.storage.from(existingBucket).remove([existing.storage_path]);
    const { error } = await supabase.from("site_images").delete().eq("key", slotKey);
    if (error) return toast.error(error.message);
    setMeta((s) => {
      const c = { ...s };
      delete c[slotKey];
      return c;
    });
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Photos</h1>
        <p className="text-sm text-slate-500">
          Drop an image on a slot or click to upload. Images are automatically compressed before
          saving.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {IMAGE_SLOTS.map((slot) => {
          const row = rows.find((r) => r.key === slot.key);
          return (
            <PhotoSlot
              key={slot.key}
              label={slot.label}
              row={row}
              uploading={uploading === slot.key}
              meta={meta[slot.key]}
              onUpload={(f) => upload(slot.key, f)}
              onClear={() => clearSlot(slot.key)}
            />
          );
        })}
      </div>
    </div>
  );
}

function PhotoSlot({
  label,
  row,
  uploading,
  meta,
  onUpload,
  onClear,
}: {
  label: string;
  row: ImgRow | undefined;
  uploading: boolean;
  meta?: { width: number; height: number; size: number };
  onUpload: (f: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onUpload(file);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <p className="text-sm font-medium text-slate-900">{label}</p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`mt-3 aspect-video bg-slate-100 rounded-lg overflow-hidden cursor-pointer relative border-2 border-dashed transition-colors ${
          drag ? "border-slate-900 bg-slate-200" : "border-transparent"
        }`}
      >
        {row?.url ? (
          <img src={row.url} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full grid place-items-center text-xs text-slate-400">
            Drop image here or click to upload
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-white/70 grid place-items-center text-xs font-medium text-slate-700">
            Uploading…
          </div>
        )}
      </div>
      {meta && (
        <p className="mt-2 text-[11px] text-slate-500">
          {meta.width}×{meta.height} · {formatBytes(meta.size)}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.currentTarget.value = "";
          }}
        />
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-4 mr-1.5" /> {row ? "Replace" : "Upload"}
        </Button>
        {row && (
          <Button size="icon" variant="outline" onClick={onClear}>
            <Trash2 className="size-4 text-red-500" />
          </Button>
        )}
      </div>
    </div>
  );
}
