import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import copy from "rollup-plugin-copy";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: path.resolve(dirname, "src/index.ts"),
      formats: ["es"],
      fileName: () => "module/pokemon-hud-like-0.1.12.mjs",
      cssFileName: "module/pokemon-hud-like-0.1.12"
    },
    rollupOptions: {
      output: {
        chunkFileNames: "module/[name]-[hash].mjs"
      }
    }
  },
  plugins: [
    copy({
      hook: "writeBundle",
      flatten: false,
      targets: [
        { src: "module.json", dest: "dist" },
        { src: "src/lang/*", dest: "dist" },
        { src: "src/templates/**/*.hbs", dest: "dist" },
        { src: "assets", dest: "dist" },
        { src: "packs", dest: "dist" }
      ]
    })
  ]
});