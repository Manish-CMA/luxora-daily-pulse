// Cloudflare enables `nodejs_compat` by default from 2026-08-04 and now REJECTS
// workers that still list the flag ("...became the default ... does not need to be
// specified anymore"), which made every published request fail with a 502.
// Nitro's cloudflare preset always appends the flag when node compat is on, so we
// strip it from the generated worker config after the build.
import { readFile, writeFile } from "node:fs/promises";

const path = "dist/server/wrangler.json";

try {
  const config = JSON.parse(await readFile(path, "utf8"));
  const flags = config.compatibility_flags ?? [];
  if (!flags.includes("nodejs_compat")) process.exit(0);
  config.compatibility_flags = flags.filter((f) => f !== "nodejs_compat");
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
  console.log("[fix-wrangler-compat] removed redundant nodejs_compat flag");
} catch (error) {
  if (error.code === "ENOENT") process.exit(0);
  throw error;
}
