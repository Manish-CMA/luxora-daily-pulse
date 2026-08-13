// Nitro generates Cloudflare's config after the application build. Keep that
// generated config deployable across Nitro output layouts and timezone edges.
import { readFile, writeFile } from "node:fs/promises";

const paths = [".output/server/wrangler.json", "dist/server/wrangler.json"];
const utcToday = new Date().toISOString().slice(0, 10);
let patched = false;

for (const path of paths) {
  try {
    const config = JSON.parse(await readFile(path, "utf8"));
    const flags = config.compatibility_flags ?? [];
    const nextFlags = flags.filter((flag) => flag !== "nodejs_compat");

    if (config.compatibility_date > utcToday) {
      config.compatibility_date = utcToday;
    }
    config.compatibility_flags = nextFlags;

    await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
    console.log(`[fix-wrangler-compat] patched ${path}`);
    patched = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

if (!patched) {
  console.warn("[fix-wrangler-compat] no generated wrangler.json found");
}
