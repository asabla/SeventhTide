import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rolldownOptions: {
      input: ["index.html", "hand.html"].map((name) =>
        fileURLToPath(new URL(name, import.meta.url)),
      ),
    },
  },
});
