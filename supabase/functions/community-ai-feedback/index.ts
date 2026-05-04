import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AI_BOT_USER_ID = "00000000-0000-0000-0000-000000000001";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { post_id } = await req.json();

    if (!post_id) {
      return new Response(
        JSON.stringify({ error: "post_id is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Init Supabase admin client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller via the bearer token forwarded from the client
    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "");
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: corsHeaders }
      );
    }
    const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Invalid auth" }),
        { status: 401, headers: corsHeaders }
      );
    }
    const callerId = userData.user.id;

    // ---- Rate limit: per-user daily AI feedback budget ----
    const DAILY_AI_FEEDBACK_LIMIT = 80;
    const today = new Date().toISOString().split("T")[0];
    await supabase.from("daily_usage").upsert(
      { user_id: callerId, usage_date: today },
      { onConflict: "user_id,usage_date", ignoreDuplicates: true }
    );
    const { data: currentUsage } = await supabase
      .from("daily_usage")
      .select("ai_feedback_requests, total_requests")
      .eq("user_id", callerId)
      .eq("usage_date", today)
      .single();
    if (currentUsage && currentUsage.ai_feedback_requests >= DAILY_AI_FEEDBACK_LIMIT) {
      return new Response(JSON.stringify({
        error: "daily_limit",
        message: `You've reached your daily limit of ${DAILY_AI_FEEDBACK_LIMIT} AI feedback requests. Come back tomorrow!`,
      }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    await supabase
      .from("daily_usage")
      .update({
        ai_feedback_requests: (currentUsage?.ai_feedback_requests ?? 0) + 1,
        total_requests: (currentUsage?.total_requests ?? 0) + 1,
      })
      .eq("user_id", callerId)
      .eq("usage_date", today);

    // Fetch the post
    const { data: post, error: postErr } = await supabase
      .from("community_posts")
      .select("*")
      .eq("id", post_id)
      .single();

    if (postErr || !post) {
      return new Response(
        JSON.stringify({ error: "Post not found" }),
        { status: 404, headers: corsHeaders }
      );
    }

    // Only the post owner can request AI feedback on their own post
    if (post.user_id !== callerId) {
      return new Response(
        JSON.stringify({ error: "Only the post owner can request AI feedback" }),
        { status: 403, headers: corsHeaders }
      );
    }

    // Allow only one AI feedback per post (community corrections from other users don't block this)
    const { count: aiCount } = await supabase
      .from("community_corrections")
      .select("id", { count: "exact", head: true })
      .eq("post_id", post_id)
      .eq("is_ai", true);

    if (aiCount && aiCount > 0) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, message: "AI feedback already exists" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authenticate with GCP
    const creds = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")!);
    const projectId = creds.project_id;
    const jwt = await createJWT(creds);

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error("Token error:", tokenData);
      return new Response(
        JSON.stringify({ error: "Failed to authenticate with GCP" }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Build prompt based on activity type
    const hasAudio = !!post.audio_url && !post.answer_text;
    const prompt = buildCommunityPrompt(post, hasAudio);

    // Build parts — include inline audio when the student answered by voice
    const parts: any[] = [{ text: prompt }];
    if (hasAudio) {
      // audio_url stores raw base64 (no data: prefix); strip if present just in case
      const audioValue = String(post.audio_url);
      const dataUrlMatch = audioValue.match(/^data:([^;]+);base64,/);
      const rawB64 = audioValue.includes(",")
        ? audioValue.split(",")[1]
        : audioValue;
      parts.push({
        inline_data: {
          mime_type: dataUrlMatch?.[1] || "audio/webm",
          data: rawB64,
        },
      });
    }

    // Call Gemini
    const geminiRes = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/gemini-2.5-flash-lite:generateContent`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 220,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    const geminiData = await geminiRes.json();

    if (geminiData.error) {
      console.error("Gemini API error:", JSON.stringify(geminiData.error));
      return new Response(
        JSON.stringify({ error: "Gemini API error" }),
        { status: 500, headers: corsHeaders }
      );
    }

    const responseText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    let feedback;
    try {
      feedback = JSON.parse(responseText);
    } catch {
      feedback = {
        correction: "I had trouble analyzing your response. Keep practicing!",
      };
    }

    const correctionText =
      feedback.correction ||
      feedback.feedback ||
      "Your answer looks good! Keep practicing.";

    // Insert AI correction
    const { error: insertErr } = await supabase
      .from("community_corrections")
      .insert({
        post_id,
        user_id: AI_BOT_USER_ID,
        correction_text: correctionText,
        is_ai: true,
      });

    if (insertErr) {
      console.error("Insert correction error:", insertErr);
      return new Response(
        JSON.stringify({ error: "Failed to insert AI correction" }),
        { status: 500, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, correction: correctionText }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("community-ai-feedback error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});

/* ---------- Prompt Builder ---------- */

function buildCommunityPrompt(post: any, hasAudio: boolean): string {
  // English feedback for an English speaker learning Arabic.
  // Ignore harakat. Reply ONLY as JSON: {"correction":"..."} max 2 sentences.
  const studentLabel = hasAudio
    ? "The user answered by voice (audio attached). Transcribe mentally, then evaluate."
    : `User's answer: "${post.answer_text || "(none)"}"`;
  const taskMap: Record<string, string> = {
    read_aloud: `Task: the user is reading the following Arabic text aloud.\nText: "${post.prompt_text}"\n${studentLabel}\nOnly flag ACTUAL mispronunciations or missed/added words you can hear. If the user read it correctly (ignoring harakat), praise them in one short sentence and DO NOT repeat the text back. Never "correct" a reading that matches the text.`,
    translate: `Task: the user is translating the following English sentence into Arabic. Their answer should be in Arabic.\nEnglish: "${post.prompt_text}"\n${studentLabel}\nCheck accuracy and grammar of the user's Arabic. If you suggest a better phrasing, it MUST be written in Arabic script (not English). Quote the suggested Arabic inside the correction. Never suggest an English "better phrasing".`,
    daily_question: `Task: the user is answering the following question in Arabic. Their answer should be in Arabic.\nQuestion: "${post.prompt_text}"\n${studentLabel}\nCheck grammar and vocab. Any suggested improved answer MUST be written in Arabic script, not English.`,
  };
  const task = taskMap[post.activity_type] || taskMap.daily_question;
  return `You are an Arabic tutor for English speakers. Speak DIRECTLY TO THE USER in 2nd person — use "you" and "your", never "the student", "they", "their", or "the user". Write the correction as if speaking face-to-face (e.g., "You said X — try Y instead", "Your grammar is solid", "Nice job — your pronunciation was clear"). Reply in English (max 2 sentences), but any Arabic corrections/suggestions MUST be in Arabic script. Ignore harakat (diacritics) when judging correctness. Do not fabricate errors — only correct real mistakes. JSON only: {"correction":"..."}\n${task}`;
}

/* ---------- Auth Helpers ---------- */

async function createJWT(creds: any) {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iss: creds.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const base64url = (obj: any) =>
    btoa(JSON.stringify(obj))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const unsignedJWT = base64url(header) + "." + base64url(payload);

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(creds.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedJWT)
  );

  return (
    unsignedJWT +
    "." +
    btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
  );
}

function pemToArrayBuffer(pem: string) {
  const b64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
}
