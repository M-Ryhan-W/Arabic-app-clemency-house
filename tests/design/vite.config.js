import { defineConfig, mergeConfig } from "vite";
import { fileURLToPath } from "node:url";
import appConfig from "../../vite.config.js";

// Explicitly opt-in, localhost-only fixture server. Never used by production builds.
export default mergeConfig(
  appConfig,
  defineConfig({
    resolve: {
      alias: [
        {
          find: /^\.\/supabaseClient(?:\.js)?$/,
          replacement: fileURLToPath(
            new URL("./fixtureClient.js", import.meta.url),
          ),
        },
      ],
    },
    server: { host: "127.0.0.1", port: 4174, strictPort: true },
  }),
);
