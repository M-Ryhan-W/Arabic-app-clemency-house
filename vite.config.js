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
    // These paths exist for the web download page but should NEVER ship inside
    // the Android APK — bundling them causes recursive size bloat (the APK
    // ending up inside itself) and ships unused PNG backups.
    const stripPaths = ["dist/downloads", "dist/_webp_backup"];
    await Promise.all(
      stripPaths.map((p) =>
        rm(resolve(__dirname, p), { recursive: true, force: true })
      )
    );
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
        privacy: resolve(__dirname, "privacy/index.html"),
      },
    },
  },
  define: {
    __APP_BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
});
