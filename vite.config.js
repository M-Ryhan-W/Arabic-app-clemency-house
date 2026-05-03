import { defineConfig } from "vite";
import { resolve } from "node:path";
import { rm } from "node:fs/promises";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const isCapacitorBuild = Boolean(process.env.CAPACITOR_BUILD);

const stripAndroidDownloadArtifacts = () => ({
  name: "strip-android-download-artifacts",
  apply: "build",
  closeBundle: async () => {
    if (!isCapacitorBuild) return;
    await rm(resolve(__dirname, "dist/downloads"), { recursive: true, force: true });
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), stripAndroidDownloadArtifacts()],
  base: isCapacitorBuild ? "./" : "/",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        download: resolve(__dirname, "download/index.html"),
      },
    },
  },
  define: {
    __APP_BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
});
