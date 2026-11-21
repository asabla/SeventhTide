import fastify from "fastify";
import staticFiles from "@fastify/static";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const client = new URL("../web/dist/", import.meta.url);
await access(new URL("index.html", client));
const app = fastify({ logger: true });
app.get("/api/health", async () => ({ status: "ok" }));
await app.register(staticFiles, { root: fileURLToPath(client) });
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void app.close());
}
await app.listen({
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 4173),
});
