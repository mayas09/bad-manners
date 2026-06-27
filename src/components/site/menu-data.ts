export type MenuItem = { name: string; price?: string; note?: string };
export type MenuSection = { id: string; title: string; blurb?: string; items: MenuItem[] };

export const MENU: MenuSection[] = [
  {
    id: "coffee",
    title: "Coffee",
    blurb: "Espresso pulled with care. Beans rotated seasonally.",
    items: [
      { name: "Espresso", price: "$3.25" },
      { name: "Macchiato", price: "$3.75" },
      { name: "Cortado", price: "$4.25" },
      { name: "Cappuccino", price: "$4.75" },
      { name: "Latte", price: "$5.25" },
      { name: "Mocha", price: "$5.75", note: "house ganache" },
      { name: "Americano", price: "$3.75" },
      { name: "Drip Coffee", price: "$3.25", note: "free refills" },
      { name: "Cold Brew", price: "$5.00" },
      { name: "Iced Latte", price: "$5.25" },
    ],
  },
  {
    id: "non-coffee",
    title: "Non-Coffee",
    blurb: "For the no-caffeine crew and the matcha devotees.",
    items: [
      { name: "Matcha Latte", price: "$5.75" },
      { name: "Iced Matcha", price: "$5.75" },
      { name: "Hot Chocolate", price: "$4.75", note: "dark or milk" },
      { name: "Steamer", price: "$4.25", note: "lavender / vanilla / rose" },
      { name: "Chai Latte", price: "$5.50", note: "house spiced" },
      { name: "Italian Soda", price: "$4.50" },
    ],
  },
  {
    id: "tea",
    title: "Tea",
    blurb: "Loose-leaf, steeped properly.",
    items: [
      { name: "Hot Tea", price: "$3.75", note: "rotating selection" },
      { name: "Iced Tea", price: "$3.75" },
      { name: "London Fog", price: "$5.25", note: "earl grey + vanilla" },
      { name: "Tea Latte", price: "$5.25" },
    ],
  },
  {
    id: "seasonal",
    title: "Seasonal",
    blurb: "Limited-run drinks. When they're gone, they're gone.",
    items: [
      { name: "Hot Honey Latte", price: "$6.25", note: "espresso, honey, chili, cream" },
      { name: "Strawberry Rose Matcha", price: "$6.50" },
      { name: "Smoked Maple Cortado", price: "$5.75" },
      { name: "Brown Butter Mocha", price: "$6.25" },
      { name: "Goth Spritz", price: "$5.50", note: "blackberry + hibiscus tonic" },
    ],
  },
];
