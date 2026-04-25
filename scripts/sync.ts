// Local macOS bridge between Health Auto Export's iCloud folder and the
// Deno Deploy `/ingest` endpoint.
//
// Watches $HAE_WATCH_DIR for new *.json files; POSTs each new file to
// $FUNCTIONS_URL/ingest with the bearer token $WEIGHTLESS_TOKEN.
// Already-posted files are moved into `./processed/` inside the watch dir
// so the same file isn't re-sent after a reboot or reprocess.
//
// Run with `pnpm sync` (or `npm run sync`). Install as a launchd service
// via scripts/com.weightless.sync.plist for always-on sync.

import "dotenv/config";
import chokidar from "chokidar";
import { readFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";

const watchDir = process.env.HAE_WATCH_DIR;
const functionsUrl = process.env.FUNCTIONS_URL?.replace(/\/$/, "");
const token = process.env.WEIGHTLESS_TOKEN;

if (!watchDir || !functionsUrl || !token) {
    console.error(
        "Missing env. Required: HAE_WATCH_DIR, FUNCTIONS_URL, WEIGHTLESS_TOKEN",
    );
    process.exit(1);
}

const processedDir = path.join(watchDir, "processed");
await mkdir(processedDir, { recursive: true });

console.log(`[weightless-sync] watching ${watchDir}`);
console.log(`[weightless-sync] posting to ${functionsUrl}/ingest`);

// readFile can fail with EAGAIN when iCloud is still materializing the file.
// Retry a few times before giving up.
async function readFileWithRetry(file: string, attempts = 6): Promise<string> {
    for (let i = 0; i < attempts; i++) {
        try {
            return await readFile(file, "utf8");
        } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            const errno = (err as NodeJS.ErrnoException).errno;
            const transient = code === "EAGAIN" || errno === -11 || code === "EBUSY";
            if (!transient || i === attempts - 1) throw err;
            const delay = 500 * 2 ** i;
            console.error(`[weightless-sync] ${path.basename(file)} ${code ?? errno} — retry in ${delay}ms`);
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw new Error("unreachable");
}

const watcher = chokidar.watch(watchDir, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 200 },
    depth: 0,
});

watcher.on("add", async (file) => {
    if (!file.endsWith(".json")) return;
    if (path.dirname(file) !== watchDir) return;
    try {
        const body = await readFileWithRetry(file);
        const res = await fetch(`${functionsUrl}/ingest`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${token}`,
            },
            body,
        });
        const text = await res.text();
        if (!res.ok) {
            console.error(`[weightless-sync] ${path.basename(file)} FAILED ${res.status}: ${text}`);
            return;
        }
        console.log(`[weightless-sync] ${path.basename(file)} ok: ${text}`);
        await rename(file, path.join(processedDir, path.basename(file)));
    } catch (err) {
        console.error(`[weightless-sync] error on ${file}:`, err);
    }
});

watcher.on("error", (err) => console.error("[weightless-sync] watcher error:", err));
