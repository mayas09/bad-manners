export type MenuItem = { id?: string; name: string; price?: string; note?: string; is_sold_out?: boolean };
export type MenuSection = {
  id: string;
  title: string;
  blurb?: string;
  items: MenuItem[];
  footer?: { label: string; values: string[] }[];
};

export const MENU: MenuSection[] = [
  {
    id: "coffee",
    title: "Coffee",
    blurb: "Espresso pulled with care. Beans rotated seasonally.",
    items: [
      { name: "Drip", price: "$3.75" },
      { name: "Cold Brew", price: "$4.50" },
      { name: "Americano", price: "$4" },
      { name: "Espresso", price: "$4" },
      { name: "Cortado", price: "$4.50" },
      { name: "Cappuccino", price: "$4.75" },
      { name: "Latte", price: "$5.50" },
      { name: "Espresso & Tonic", price: "$5" },
    ],
  },
  {
    id: "non-coffee",
    title: "Non-Coffee",
    blurb: "For the no-caffeine crew and the matcha devotees.",
    items: [
      { name: "Golden Milk Latte", price: "$5.50" },
      { name: "Chai Latte", price: "$5.50" },
      { name: "Matcha Latte", price: "$5.50" },
      { name: "London Fog", price: "$5.50" },
      { name: "Hot Chocolate", price: "$4 / $5" },
    ],
  },
  {
    id: "tea",
    title: "Tea",
    blurb: "All teas $4 — hot or iced.",
    items: [
      { name: "Ambrosia Black", note: "Tasting Notes: Hawthorn Berries, Baked Peach, Mead" },
      { name: "Crescent Green", note: "Tasting Notes: Sandalwood, Apricot, Honeycomb" },
      { name: "Sunstone Black", note: "Tasting Notes: Honey, Dark Cocoa, Apricot" },
      { name: "Malabar Herbal", note: "Tasting Notes: Ginger, Malabar Black Peppercorn, Turmeric, Lemongrass, Licorice Root" },
      { name: "Rosella Herbal Tonic", note: "Tasting Notes: Hibiscus, Lemongrass, Licorice Root" },
    ],
    footer: [
      { label: "Flavor add-ons (+$0.50)", values: ["Vanilla", "Mocha", "Caramel"] },
      { label: "Milk options", values: ["Oat", "Almond"] },
    ],
  },
  {
    id: "seasonal",
    title: "Seasonal",
    blurb: "Limited-run drinks. When they're gone, they're gone.",
    items: [
      {
        name: "Cold Brew Lemonade",
        price: "$6.00",
        note: "House-made sparkling lemonade topped with cold brew concentrate (Iced, 12oz, GF/V)",
      },
      {
        name: "Matcho Matcha Man",
        price: "$6.00",
        note: "House-made sparkling lemonade, lavender syrup, topped with matcha (Iced, 12oz, GF/V)",
      },
    ],
  },
];
