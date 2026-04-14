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
    const { student_user_id, limit } = await req.json();

    if (!student_user_id) {
      return jsonResponse({ error: "student_user_id is required" }, 400);
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

    const viewerId = userData.user.id;
    const { data: roleRows, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", viewerId);

    if (roleError) {
      console.error("teacher-student-posts roles lookup error:", roleError);
      return jsonResponse({ error: "Failed to validate permissions" }, 500);
    }

    const viewerRoles = (roleRows || []).map((row: { role: string }) => row.role);
    if (!viewerRoles.includes("teacher") && !viewerRoles.includes("admin")) {
      return jsonResponse({ error: "Teacher access required" }, 403);
    }

    const [{ data: student, error: studentError }, { data: posts, error: postsError }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, avatar_url, created_at")
        .eq("id", student_user_id)
        .single(),
      supabase
        .from("community_posts")
        .select("*")
        .eq("user_id", student_user_id)
        .order("created_at", { ascending: false })
        .limit(Math.min(Math.max(Number(limit || 50), 1), 100)),
    ]);

    if (studentError || !student) {
      console.error("teacher-student-posts student lookup error:", studentError);
      return jsonResponse({ error: "Student not found" }, 404);
    }

    if (postsError) {
      console.error("teacher-student-posts posts lookup error:", postsError);
      return jsonResponse({ error: "Failed to load student posts" }, 500);
    }

    const enrichedPosts = posts || [];
    if (enrichedPosts.length > 0) {
      const postIds = enrichedPosts.map((post: any) => post.id);
      const { data: corrections, error: correctionsError } = await supabase
        .from("community_corrections")
        .select("post_id, is_ai")
        .in("post_id", postIds);

      if (correctionsError) {
        console.error("teacher-student-posts corrections lookup error:", correctionsError);
      }

      const countMap: Record<string, number> = {};
      const aiSet = new Set<string>();
      for (const correction of corrections || []) {
        countMap[correction.post_id] = (countMap[correction.post_id] || 0) + 1;
        if (correction.is_ai) aiSet.add(correction.post_id);
      }

      for (const post of enrichedPosts) {
        post.profiles = student;
        post.corrections_count = countMap[post.id] || 0;
        post.has_ai_feedback = aiSet.has(post.id);
      }
    }

    return jsonResponse({
      student,
      posts: enrichedPosts,
    });
  } catch (err) {
    console.error("teacher-student-posts error:", err);
    return jsonResponse({ error: err.message || "Unexpected error" }, 500);
  }
});

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
