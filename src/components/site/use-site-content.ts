import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MENU as FALLBACK_MENU, type MenuSection } from "@/components/site/menu-data";
import { PHOTOS as FALLBACK_PHOTOS } from "@/components/site/photos";

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
      const [m, i, h, img] = await Promise.all([
        supabase.from("menu_items").select("*").order("section").order("sort_order"),
        supabase.from("business_info").select("*"),
        supabase.from("business_hours").select("*").order("sort_order"),
        supabase.from("site_images").select("*").order("category").order("sort_order"),
      ]);
      if (cancelled) return;

      // Menu
      let menu: MenuSection[] = FALLBACK_MENU;
      if (m.data && m.data.length) {
        const byId: Record<string, MenuSection> = {};
        for (const id of Object.keys(SECTION_META)) {
          byId[id] = {
            id,
            title: SECTION_META[id].title,
            blurb: SECTION_META[id].blurb,
            items: [],
            footer: SECTION_META[id].footer,
          };
        }
        m.data.forEach((r: any) => {
          if (!byId[r.section]) byId[r.section] = { id: r.section, title: r.section, items: [] };
          byId[r.section].items.push({
            id: r.id,
            name: r.name,
            price: r.price ?? undefined,
            note: r.note ?? undefined,
            is_sold_out: !!r.is_sold_out,
            image_url: r.image_url ?? null,
            original_price_cents: r.original_price_cents ?? null,
            discount_type: r.discount_type ?? null,
            discount_value: r.discount_value ?? null,
          });
        });
        menu = Object.values(byId).filter((s) => s.items.length > 0);
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

      // Images
      const photos = { ...FALLBACK_PHOTOS };
      const galleryRows = (img.data ?? [])
        .filter((r: any) => r.category === "gallery")
        .sort((a: any, b: any) => a.sort_order - b.sort_order);
      if (galleryRows.length) photos.gallery = galleryRows.map((r: any) => r.url);
      (img.data ?? []).forEach((r: any) => {
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
