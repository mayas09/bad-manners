import { createClient } from "@supabase/supabase-js";

const OLD_URL = "https://ttwmnzfqamdiewkrucdn.supabase.co";
const OLD_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NEW_URL = "https://nhncjaudtnplatwvbcab.supabase.co";
const NEW_KEY = process.env.NEW_SUPABASE_SERVICE_ROLE_KEY;

if (!OLD_KEY || !NEW_KEY) {
  console.error("Missing required service-role environment variables.");
  process.exit(1);
}

const oldC = createClient(OLD_URL, OLD_KEY, { auth: { persistSession: false } });
const newC = createClient(NEW_URL, NEW_KEY, { auth: { persistSession: false } });

async function listAll(client, bucket, prefix = "") {
  const out = [];
  async function walk(path) {
    let offset = 0;
    while (true) {
      const { data, error } = await client.storage.from(bucket).list(path, { limit: 1000, offset });
      if (error) { console.error("list err", bucket, path, error.message); return; }
      if (!data || data.length === 0) break;
      for (const item of data) {
        const full = path ? `${path}/${item.name}` : item.name;
        if (item.id === null || item.metadata === null) {
          // folder
          await walk(full);
        } else {
          out.push(full);
        }
      }
      if (data.length < 1000) break;
      offset += 1000;
    }
  }
  await walk(prefix);
  return out;
}

const { data: buckets, error: bErr } = await oldC.storage.listBuckets();
if (bErr) { console.error("listBuckets", bErr); process.exit(1); }

for (const b of buckets) {
  // ensure bucket on new
  const { error: ce } = await newC.storage.createBucket(b.id, { public: b.public });
  if (ce && !ce.message.includes("already exists")) console.error("createBucket", b.id, ce.message);
  const keys = await listAll(oldC, b.id);
  console.log(`\n=== bucket ${b.id}: ${keys.length} objects ===`);
  for (const k of keys) {
    const { data: blob, error: de } = await oldC.storage.from(b.id).download(k);
    if (de) { console.error("dl", b.id, k, de.message); continue; }
    const buf = Buffer.from(await blob.arrayBuffer());
    const { error: ue } = await newC.storage.from(b.id).upload(k, buf, {
      contentType: blob.type || "application/octet-stream",
      upsert: true,
    });
    if (ue) console.error("up", b.id, k, ue.message);
    else console.log("  ✓", k, `(${buf.length}B)`);
  }
}
console.log("\nDONE");
