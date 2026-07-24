import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MENU as FALLBACK_MENU, type MenuSection } from "@/components/site/menu-data";
import { PHOTOS as FALLBACK_PHOTOS } from "@/components/site/photos";
import { getSiteDateParts } from "@/lib/time-utils";

export type SiteContent = {
  menu: MenuSection[];
  photos: typeof FALLBACK_PHOTOS;
  info: {
    address_line1: string;
    address_line2: string;
    instagram_url: string;
    facebook_url: string;
    gift_card_url: string;
    map_query: string;
  };
  hours: { label: string; hours_text: string }[];
  loaded: boolean;
};

type SiteImageRow = {
  category: string;
  key: string;
  month_tag?: number | null;
  season_tag?: string | null;
  sort_order: number;
  url: string;
};

const SECTION_META: Record<
  string,
  { title: string; blurb?: string; footer?: MenuSection["footer"] }
> = {
  coffee: { title: "Coffee", blurb: "Espresso pulled with care. Beans rotated seasonally." },
  "non-coffee": { title: "Non-Coffee", blurb: "For the no-caffeine crew and the matcha devotees." },
  tea: {
    title: "Tea",
    blurb: "All teas $4 — hot or iced.",
    footer: [
      { label: "Flavor add-ons (+$0.50)", values: ["Vanilla", "Mocha", "Caramel"] },
      { label: "Milk options", values: ["Oat", "Almond"] },
    ],
  },
  seasonal: { title: "Seasonal", blurb: "Limited-run drinks. When they're gone, they're gone." },
};

const FALLBACK_INFO = {
  address_line1: "697 Haywood Rd, Suite G",
  address_line2: "Asheville, NC 28806",
  instagram_url: "https://instagram.com/badmannerscoffee",
  facebook_url: "https://facebook.com/badmannerscoffee",
  gift_card_url: "https://squareup.com/gift/bad-manners-coffee/order",
  map_query: "697 Haywood Rd G Asheville NC 28806",
};

const FALLBACK_HOURS = [
  { label: "Mon – Fri", hours_text: "8:00 AM – 3:00 PM" },
  { label: "Sat – Sun", hours_text: "8:30 AM – 3:00 PM" },
];

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtTime(t: string): string {
  const [hStr, mStr] = t.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10) || 0;
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${suffix}`;
}

function hoursFromSettings(
  rows: { day_of_week: number; open_time: string; close_time: string; is_closed: boolean }[],
): { label: string; hours_text: string }[] {
  const order = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun
  const byDay = new Map(rows.map((r) => [r.day_of_week, r]));
  type Group = { startIdx: number; endIdx: number; text: string };
  const groups: Group[] = [];
  order.forEach((dow, idx) => {
    const r = byDay.get(dow);
    const text =
      !r || r.is_closed ? "Closed" : `${fmtTime(r.open_time)} – ${fmtTime(r.close_time)}`;
    const last = groups[groups.length - 1];
    if (last && last.text === text && last.endIdx === idx - 1) {
      last.endIdx = idx;
    } else {
      groups.push({ startIdx: idx, endIdx: idx, text });
    }
  });
  return groups.map((g) => {
    const s = DAY_SHORT[order[g.startIdx]];
    const e = DAY_SHORT[order[g.endIdx]];
    return { label: g.startIdx === g.endIdx ? s : `${s} – ${e}`, hours_text: g.text };
  });
}

function currentSeason(month: number) {
  if (month === 12 || month <= 2) return "winter";
  if (month <= 5) return "spring";
  if (month <= 8) return "summer";
  return "fall";
}

export function useSiteContent(): SiteContent {
  const [state, setState] = useState<SiteContent>({
    menu: FALLBACK_MENU,
    photos: FALLBACK_PHOTOS,
    info: FALLBACK_INFO,
    hours: FALLBACK_HOURS,
    loaded: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [m, i, h, img, secRes] = await Promise.all([
        supabase.from("menu_items").select("*").order("section").order("sort_order"),
        supabase.from("business_info").select("*"),
        (supabase.from as any)("business_settings")
          .select("day_of_week,open_time,close_time,is_closed")
          .order("day_of_week"),
        supabase.from("site_images").select("*").order("category").order("sort_order"),
        supabase.from("menu_sections" as any).select("*").order("sort_order"),
      ]);
      if (cancelled) return;

      if (m.error || i.error || img.error) {
        console.error(
          "Site content load error:",
          m.error,
          i.error,
          h.error,
          img.error,
        );
        setState((s) => ({ ...s, loaded: false }));
        return;
      }

      // Section metadata — prefer DB, fall back to defaults.
      const dbSections = (secRes && !secRes.error ? (secRes.data as any[]) : null) ?? [];
      const sectionMeta: Record<string, { title: string; blurb?: string; sort_order: number; footer?: MenuSection["footer"] }> = {};
      Object.keys(SECTION_META).forEach((slug, idx) => {
        sectionMeta[slug] = {
          title: SECTION_META[slug].title,
          blurb: SECTION_META[slug].blurb,
          footer: SECTION_META[slug].footer,
          sort_order: idx + 1,
        };
      });
      dbSections.forEach((s) => {
        sectionMeta[s.slug] = {
          title: s.title,
          blurb: s.blurb ?? undefined,
          footer: SECTION_META[s.slug]?.footer,
          sort_order: s.sort_order ?? 999,
        };
      });

      // Menu
      let menu: MenuSection[] = FALLBACK_MENU;
      if (m.data && m.data.length) {
        const byId: Record<string, MenuSection> = {};
        m.data.forEach((r: any) => {
          if (!byId[r.section]) {
            const meta = sectionMeta[r.section];
            byId[r.section] = {
              id: r.section,
              title: meta?.title ?? r.section,
              blurb: meta?.blurb,
              items: [],
              footer: meta?.footer,
            };
          }
          byId[r.section].items.push({
            id: r.id,
            name: r.name,
            price_cents: r.price_cents ?? null,
            price: r.price ?? undefined,
            note: r.note ?? undefined,
            is_sold_out: !!r.is_sold_out,
            image_url: r.image_url ?? null,
            original_price_cents: r.original_price_cents ?? null,
            discount_type: r.discount_type ?? null,
            discount_value: r.discount_value ?? null,
          });
        });
        menu = Object.values(byId)
          .filter((s) => s.items.length > 0)
          .sort((a, b) => (sectionMeta[a.id]?.sort_order ?? 999) - (sectionMeta[b.id]?.sort_order ?? 999));
      }


      // Info
      const info = { ...FALLBACK_INFO };
      (i.data ?? []).forEach((r: any) => {
        if (r.key in info && r.value) (info as any)[r.key] = r.value;
      });

      // Hours
      const hours =
        h.data && h.data.length
          ? h.data.map((r: any) => ({ label: r.label, hours_text: r.hours_text }))
          : FALLBACK_HOURS;

      // Images — use the site (America/New_York) month so seasonal galleries
      // don't flip based on the visitor's timezone.
      const photos = { ...FALLBACK_PHOTOS };
      const { month } = getSiteDateParts(new Date());
      const season = currentSeason(month);
      const imageRows = (img.data ?? []) as SiteImageRow[];
      const allGalleryRows = imageRows
        .filter((r) => r.category === "gallery")
        .sort((a, b) => a.sort_order - b.sort_order);
      const themedRows = allGalleryRows.filter((r) => {
        const rowMonth = Number(r.month_tag);
        return rowMonth === month || r.season_tag === season;
      });
      const defaultRows = allGalleryRows.filter((r) => !r.month_tag && !r.season_tag);
      // Show themed images first, top up with defaults, cap at 6.
      const galleryRows =
        themedRows.length > 0 ? [...themedRows, ...defaultRows].slice(0, 6) : defaultRows;
      if (galleryRows.length) photos.gallery = galleryRows.map((r) => r.url);
      imageRows.forEach((r) => {
        if (r.key === "hero_interior") photos.heroInterior = r.url;
        else if (r.key === "story") photos.story = r.url;
        else if (r.key === "community") photos.community = r.url;
      });

      setState({ menu, info, hours, photos, loaded: true });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
