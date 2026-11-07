// Local review helper: serves the game and accepts PNG posts from the
// terrain benchmark page so full-size renders can be inspected on disk.
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { mkdir } from "node:fs/promises";

const root = process.cwd();
const artifacts = resolve(root, "../artifacts");
await mkdir(artifacts, { recursive: true });

const mime = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json",
    ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp3": "audio/mpeg", ".wav": "audio/wav",
};

createServer(async (request, response) => {
    try {
        if (request.method === "POST" && request.url.startsWith("/shot")) {
            let body = "";
            for await (const chunk of request) body += chunk;
            const url = new URL(request.url, "http://127.0.0.1");
            const name = String(url.searchParams.get("name") || "terrain-shot").replace(/[^a-z0-9-]/gi, "").slice(0, 60);
            const base64 = body.replace(/^data:image\/png;base64,/, "");
            await writeFile(resolve(artifacts, name + ".png"), Buffer.from(base64, "base64"));
            response.writeHead(200, { "content-type": "text/plain" }).end("ok");
            return;
        }
        const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
        const relative = pathname === "/" ? "index.html" : pathname.slice(1);
        const file = resolve(root, relative);
        if (file !== root && !file.startsWith(root + sep)) {
            response.writeHead(403).end("Forbidden");
            return;
        }
        const data = await readFile(file);
        response.writeHead(200, {
            "content-type": mime[extname(file)] || "application/octet-stream",
            "cache-control": "no-store",
        }).end(data);
    } catch {
        response.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    }
}).listen(3000, "0.0.0.0", () => console.log("capture server on 3000"));
