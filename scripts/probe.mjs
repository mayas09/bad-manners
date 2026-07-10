import { createClient } from "@supabase/supabase-js";
const oldC = createClient("https://ttwmnzfqamdiewkrucdn.supabase.co", process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }});
const { data, error } = await oldC.storage.from("site-images").list("", { limit: 100 });
console.log("root list:", data, error);
const { data: d2, error: e2 } = await oldC.storage.from("site-images").list("hero_interior", { limit: 100 });
console.log("hero_interior:", d2, e2);
const { data: dl, error: dle } = await oldC.storage.from("site-images").download("hero_interior/1783100878388-photo_2026-07-03_18.19.09.jpeg");
console.log("download:", dl?.size, dle);
