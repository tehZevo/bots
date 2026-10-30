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
  },
  plugins: [react(), swManifest()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8075",
    },
  },
});
