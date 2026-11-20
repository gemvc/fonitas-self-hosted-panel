import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist-oem",
    rollupOptions: { input: "oem.html" },
  },
});
