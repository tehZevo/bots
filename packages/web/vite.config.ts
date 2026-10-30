import { readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vitest/config";

const swManifest = (): Plugin => ({
  name: "sw-manifest",
  apply: "build",
  closeBundle() {
    const dir = resolve(import.meta.dirname, "dist/assets");
    const urls = readdirUrls(dir);
    writeFileSync(
      resolve(import.meta.dirname, "dist/sw-manifest.json"),
      JSON.stringify(urls),
    );
  },
});

function readdirUrls(dir: string): string[] {
  try {
    return ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png"].concat(
      readdirSync(dir).map((f) => `/assets/${f}`),
    );
  } catch {
    return ["/manifest.webmanifest"];
  }
}

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**"],
      // Waiver: vitest counts every src file against the floor (the old node
      // runner only counted files tests loaded, inflating ~20pp). 65 = current
      // measured level; raise back toward 80 as component tests land.
      thresholds: { lines: 65 },
    },
  },
  plugins: [react(), swManifest()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8075",
    },
  },
});
