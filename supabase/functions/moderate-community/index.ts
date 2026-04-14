import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { target_type, target_id, reason } = await req.json();

    if (!target_type || !target_id) {
      return jsonResponse({ error: "target_type and target_id are required" }, 400);
    }

    if (!["post", "correction"].includes(target_type)) {
      return jsonResponse({ error: "Invalid target_type" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "");
    if (!accessToken) {
      return jsonResponse({ error: "Missing authorization" }, 401);
    }

    const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Invalid auth" }, 401);
    }

    const actorId = userData.user.id;
    const { data: roleRows, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", actorId);

    if (roleError) {
      console.error("moderate-community roles lookup error:", roleError);
      return jsonResponse({ error: "Failed to validate permissions" }, 500);
    }

    const actorRoles = (roleRows || []).map((row: { role: string }) => row.role);
    if (!actorRoles.includes("teacher") && !actorRoles.includes("admin")) {
      return jsonResponse({ error: "Teacher access required" }, 403);
    }

    const sourceTable = target_type === "post" ? "community_posts" : "community_corrections";
    const selectFields = target_type === "post" ? "id, user_id" : "id, user_id, post_id, is_ai";

    const { data: target, error: targetError } = await supabase
      .from(sourceTable)
      .select(selectFields)
      .eq("id", target_id)
      .single();

    if (targetError || !target) {
      return jsonResponse({ error: "Target not found" }, 404);
    }

    const { error: deleteError } = await supabase
      .from(sourceTable)
      .delete()
      .eq("id", target_id);

    if (deleteError) {
      console.error("moderate-community delete error:", deleteError);
      return jsonResponse({ error: "Failed to delete content" }, 500);
    }

    const { error: logError } = await supabase
      .from("moderation_logs")
      .insert({
        actor_id: actorId,
        target_owner_id: target.user_id,
        target_type,
        target_id,
        action: "delete",
        reason: typeof reason === "string" ? reason.trim().slice(0, 300) : null,
      });

    if (logError) {
      console.error("moderate-community log error:", logError);
    }

    return jsonResponse({
      ok: true,
      target_type,
      target_id,
      post_id: target_type === "correction" ? target.post_id : target_id,
      is_ai: target_type === "correction" ? !!target.is_ai : false,
    });
  } catch (err) {
    console.error("moderate-community error:", err);
    return jsonResponse({ error: err.message || "Unexpected error" }, 500);
  }
});

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
