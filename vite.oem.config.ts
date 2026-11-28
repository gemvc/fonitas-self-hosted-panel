import { defineConfig } from "vite";

export default defineConfig({
  // OEM ZIP is served from the publisher origin with customer PHP `/api/v1` bridge.
  envPrefix: ["VITE_"],
  define: {
    "import.meta.env.VITE_OEM_SAME_ORIGIN_API": JSON.stringify("true"),
  },
  build: {
    outDir: "dist-oem",
    rollupOptions: { input: "oem.html" },
  },
});
