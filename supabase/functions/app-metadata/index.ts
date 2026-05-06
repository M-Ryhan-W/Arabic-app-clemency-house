import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Update these values when releasing a new version ──
  // minimum_required_version: oldest version allowed to run (force update if below)
  // current_version: latest available version (soft prompt if below but above minimum)
  const metadata = {
    android: {
      current_version: "1.0.12",
      minimum_required_version: "1.0.12",
      update_url: "https://ihyaarabicapp.com/download?mode=update",
    },
    web: {
      current_build: new Date().toISOString(),
      force_reload: false,
    },
  };

  return new Response(JSON.stringify(metadata), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
