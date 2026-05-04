import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---- Rate Limiting ----
const DAILY_SPEECH_CHECK_LIMIT = 200;

async function verifyUserAndCheckLimits(req: Request): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const today = new Date().toISOString().split("T")[0];

  await supabase.from("daily_usage").upsert(
    { user_id: user.id, usage_date: today },
    { onConflict: "user_id,usage_date", ignoreDuplicates: true }
  );

  const { data: currentUsage } = await supabase
    .from("daily_usage")
    .select("speech_checks, total_requests")
    .eq("user_id", user.id)
    .eq("usage_date", today)
    .single();

  if (currentUsage && currentUsage.speech_checks >= DAILY_SPEECH_CHECK_LIMIT) {
    return new Response(JSON.stringify({
      error: "daily_limit",
      message: `You've reached your daily limit of ${DAILY_SPEECH_CHECK_LIMIT} speech checks. Come back tomorrow!`,
    }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  await supabase
    .from("daily_usage")
    .update({
      speech_checks: (currentUsage?.speech_checks ?? 0) + 1,
      total_requests: (currentUsage?.total_requests ?? 0) + 1,
    })
    .eq("user_id", user.id)
    .eq("usage_date", today);

  return { userId: user.id };
}

// ---- OAuth Token Cache ----
let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let cachedProjectId: string | null = null;

async function getAccessToken(): Promise<{ token: string; projectId: string }> {
  const now = Date.now();
  if (cachedToken && cachedProjectId && now < tokenExpiresAt) {
    return { token: cachedToken, projectId: cachedProjectId };
  }

  const creds = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")!);
  cachedProjectId = creds.project_id;

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
  cachedToken = tokenData.access_token;
  tokenExpiresAt = now + 55 * 60 * 1000;

  return { token: cachedToken!, projectId: cachedProjectId! };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authResult = await verifyUserAndCheckLimits(req);
    if (authResult instanceof Response) return authResult;

    const body = await req.json();

    if (!body.audioBase64) {
      return new Response(
        JSON.stringify({ error: "No audio provided" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const { token, projectId } = await getAccessToken();

    // Strip data URL prefix if present
    const base64Audio = body.audioBase64.includes(",")
      ? body.audioBase64.split(",")[1]
      : body.audioBase64;

    // Build prompt
    const exerciseType = body.exerciseType || "";
    const wantFeedback = !!exerciseType;

    const prompt = wantFeedback
      ? buildTranscribeAndFeedbackPrompt(exerciseType, body.expectedText, body.vocabList, body.lessonContext, body)
      : "Transcribe this Arabic audio. Return ONLY a JSON object: {\"transcript\": \"<the Arabic text>\"}. Nothing else.";

    // Build parts array: text + audio
    const rawMime = body.mimeType || "audio/webm";
    const audioMimeType = rawMime.split(";")[0].trim();

    const parts: any[] = [
      { text: prompt },
      {
        inlineData: {
          mimeType: audioMimeType,
          data: base64Audio,
        },
      },
    ];

    // Gemini call
    const modelVersion = "gemini-2.5-flash-lite";
    const maxOutputTokens = getMaxOutputTokens(exerciseType, wantFeedback);
    console.log(`[speech-check] Using model: ${modelVersion}, exerciseType: ${exerciseType}, maxOutputTokens: ${maxOutputTokens}`);

    const geminiRes = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/${modelVersion}:generateContent`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts,
            },
          ],
          generationConfig: {
            temperature: wantFeedback ? 0.3 : 0.1,
            maxOutputTokens,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    const geminiData = await geminiRes.json();
    console.log("[speech-check] Gemini HTTP status:", geminiRes.status);

    if (geminiData.error) {
      console.error("[speech-check] Gemini API error:", JSON.stringify(geminiData.error));
      return new Response(
        JSON.stringify({ ok: false, transcript: "", _error: geminiData.error.message || "Gemini API error", _errorCode: geminiData.error.code }),
        { headers: corsHeaders }
      );
    }

    // Check for blocked/empty candidates
    const candidate = geminiData?.candidates?.[0];
    const finishReason = candidate?.finishReason;
    console.log("[speech-check] Finish reason:", finishReason);
    
    if (!candidate || !candidate.content) {
      console.error("[speech-check] No candidate content. Full response:", JSON.stringify(geminiData).substring(0, 1000));
      return new Response(
        JSON.stringify({ ok: false, transcript: "", _error: `No response from Gemini (finishReason: ${finishReason})` }),
        { headers: corsHeaders }
      );
    }

    const responseText = candidate.content.parts?.[0]?.text || "{}";
    console.log("[speech-check] Response text length:", responseText.length);

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      console.warn("[speech-check] Failed to parse JSON, raw:", responseText.substring(0, 500));
      result = { transcript: responseText.trim() };
    }

    return new Response(
      JSON.stringify({ ok: true, ...result }),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("speech-check error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: corsHeaders }
    );
  }
});

// Per-exercise output caps. The old blanket 2048 was massively over-provisioned
// for small-output exercises (transcribe-only, challenge-check, speak-check),
// which lets truncated/runaway outputs cost more than they should.
function getMaxOutputTokens(exerciseType: string, wantFeedback: boolean): number {
  if (!wantFeedback) return 300; // transcribe-only: {"transcript": "..."}
  switch (exerciseType) {
    case "picture-describe": return 1500;
    case "challenge-check":  return 300;
    case "speak-check":      return 400;
    case "reading":
    case "translate":        return 800;
    default:                 return 800;
  }
}

/* ---------- Prompt Builder ---------- */

function buildTranscribeAndFeedbackPrompt(
  exerciseType: string,
  expectedText?: string,
  vocabList?: string[],
  lessonContext?: string,
  body?: any
): string {
  const baseInstruction = `You are an Arabic language tutor. Listen to this audio recording of a student speaking Arabic.

Your job:
1. Transcribe exactly what the student said in Arabic
2. Give brief, encouraging feedback in English

You MUST respond with valid JSON in this exact format:
{
  "transcript": "<exact Arabic transcription of what was spoken>",
  "overallScore": <number 0-100>,
  "feedback": "<1-2 sentence summary in English>",
  "corrections": [
    {
      "said": "<what they said in Arabic>",
      "better": "<better version in Arabic>",
      "explanation": "<brief English explanation>"
    }
  ],
  "encouragement": "<short motivational message with emoji>",
  "missedVocab": ["<Arabic words they missed>"]
}

Keep feedback concise — 1-2 sentences max. Keep corrections to 1-2 items only.`;

  if (exerciseType === "picture-describe") {
    const vocabStr = vocabList?.join("، ") || "N/A";
    const vocabCount = vocabList?.length || 0;
    const imageDesc = body.imageDescription || "";
    return `STEP 1 — LANGUAGE CHECK (do this FIRST before anything else):
Listen to the audio. What language is the speaker actually using?
If the audio is NOT Arabic (English, silence, noise, other language), you MUST respond ONLY with:
{"language_detected":"<language>","is_arabic":false,"transcript":"<what you actually heard, verbatim>"}
Do NOT generate Arabic text. Do NOT evaluate. Just report what you heard and stop.

STEP 2 — Only if the speaker used Arabic, proceed with evaluation:
${imageDesc ? `PICTURE: ${imageDesc}` : ""}
${lessonContext ? `Lesson: ${lessonContext}` : ""}
Target vocab (${vocabCount}): ${vocabStr}

RULES: Transcribe EXACTLY what you hear. Do NOT add words that weren't spoken.

RATING: Judge holistically — vocab coverage, grammar, relevance to picture, length/detail.
- "fair" = weak attempt, few vocab words, grammar issues, very basic
- "good" = decent attempt, some vocab used, mostly correct grammar
- "excellent" = strong attempt, most vocab used, good grammar, detailed
Be LENIENT with vocab matching — count with/without ال, prefixes (ب،ل،و،ف), plurals, conjugations, synonyms.

Respond with JSON:
{"language_detected":"arabic","is_arabic":true,"transcript":"<Arabic>","rating":"fair|good|excellent","steps":[
  2-3 {"type":"segment","snippet":"<Arabic phrase>","analysis":"<direct feedback>","tip":"<or null>","teach":<omit unless it adds real learning value; when present: {"type":"synonym|phrase|better_way","label":"...","arabic":"...","english":"..."}>},
  2-3 {"type":"correction_challenge","original":"<what student said>","corrected":"<better way to say it>","instruction":"<brief instruction>"} (MANDATORY — ALWAYS give at least 2),
  {"type":"vocab_check","used":[...],"missed":[...],"analysis":"..."},
  1-2 {"type":"improvement","suggestion":"<specific tip>","example":"<Arabic example sentence>"}
]}
correction_challenge: pick something the student said and show a better/more natural way — they'll record themselves saying the corrected version.`;
  }

  if (exerciseType === "challenge-check") {
    return `Arabic tutor evaluating pronunciation practice.
Expected phrase: "${expectedText}"

CRITICAL — SILENCE CHECK FIRST:
If audio contains NO clear Arabic speech (silence, noise, breathing, mumbling) → transcript="", score=0, pass=false. Do NOT fabricate words.

If they DID speak: Transcribe exactly, compare to expected phrase. Ignore harakat.
Scoring: 80-100=correct/close, 50-79=noticeable errors, 20-49=many errors, 0-19=unrelated.
pass=true if score>=50.

Respond with JSON:
{"transcript":"<Arabic or empty if silent>","overallScore":<0-100>,"pass":<bool>,"feedback":"<1 sentence honest assessment>"}`;
  }

  if (exerciseType === "speak-check") {
    return `Arabic tutor evaluating student response to the question: "${expectedText}"

CRITICAL — SILENCE CHECK FIRST:
If the audio contains NO clear Arabic speech (silence, noise, breathing, mumbling, or only English) → transcript MUST be "", score=0, pass=false. Do NOT fabricate or guess words. Do NOT give positive feedback for silence.

If they DID speak Arabic:
- Transcribe exactly what they said
- Evaluate whether their answer actually responds to the question asked
- RELEVANCE IS CRITICAL: If the student said something totally unrelated to the question, they MUST fail. Do NOT say "good job" for an irrelevant answer. Be honest — tell them their answer didn't address the question and explain what a good answer would include.
- Only pass if the answer is at least a reasonable attempt to answer the specific question
- Grammar mistakes are OK if the answer is relevant → still pass
- Minor topic drift is OK if they're in the right ballpark → pass with constructive feedback
- Completely off-topic, random words, or answering a different question → fail (score 20-40), and explain what was expected

FEEDBACK RULES:
- Be HONEST. Never praise an irrelevant or wrong answer.
- If they failed: explain what they said, why it doesn't answer the question, and give an example of what a good answer would be.
- If they passed: acknowledge what they got right, then offer one improvement.
- Never say "good job" or "great work" unless the answer genuinely deserves it.

Respond with JSON:
{"transcript":"<Arabic or empty if silent>","overallScore":<0-100>,"pass":<bool>,"feedback":"<2-3 sentences: honest assessment of relevance and quality, with constructive guidance>"}`;
  }

  if (exerciseType === "reading") {
    return `${baseInstruction}

EXERCISE: Reading Practice
The student was asked to read/say this Arabic sentence aloud: "${expectedText}"

Evaluate:
1. How closely does their spoken text match the expected text?
2. Note any words that were mispronounced or missed.
3. Be aware that Arabic speech recognition may miss diacritics — focus on root word accuracy.
Give a score based on accuracy (exact match = 100, partial = proportional).`;
  }

  if (exerciseType === "translate") {
    return `${baseInstruction}

EXERCISE: Translate the Sentence
The student was shown an English sentence and asked to say the Arabic translation aloud.
Expected Arabic translation: "${expectedText}"

Evaluate:
1. Is the translation accurate in meaning?
2. Is the grammar correct (word order, verb conjugation, prepositions)?
3. Are there alternative correct translations they might have used?
Give a score based on meaning accuracy and grammar.`;
  }

  // All known exerciseTypes are handled above. If an unknown value slips
  // through, fall back to the base transcribe+feedback instruction.
  return baseInstruction;
}

/* ---------- helpers ---------- */

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
