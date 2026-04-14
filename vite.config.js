
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/",
  define: {
    __APP_BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
});
