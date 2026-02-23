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

  try {
    const body = await req.json();

    if (!body.audioBase64) {
      return new Response(
        JSON.stringify({ error: "No audio provided" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const creds = JSON.parse(
      Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")!
    );
    const projectId = creds.project_id;

    const jwt = await createJWT(creds);

    const tokenRes = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: jwt,
        }),
      }
    );

    const tokenData = await tokenRes.json();

    // Strip data URL prefix if present
    const base64Audio = body.audioBase64.includes(",")
      ? body.audioBase64.split(",")[1]
      : body.audioBase64;

    console.log("Audio base64 length:", base64Audio.length);

    // Build prompt: transcription only, or transcription + feedback
    const exerciseType = body.exerciseType || "";
    const wantFeedback = !!exerciseType;

    const prompt = wantFeedback
      ? buildTranscribeAndFeedbackPrompt(exerciseType, body.expectedText, body.vocabList, body.lessonContext)
      : "Transcribe this Arabic audio. Return ONLY a JSON object: {\"transcript\": \"<the Arabic text>\"}. Nothing else.";

    // Single Gemini call: transcribe audio + optional feedback
    const geminiRes = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/gemini-2.0-flash:generateContent`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: "audio/webm",
                    data: base64Audio,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: wantFeedback ? 0.3 : 0.1,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    const geminiData = await geminiRes.json();
    console.log("Gemini status:", geminiRes.status);

    if (geminiData.error) {
      console.error("Gemini error:", JSON.stringify(geminiData.error));
      return new Response(
        JSON.stringify({ ok: true, transcript: "" }),
        { headers: corsHeaders }
      );
    }

    const responseText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    console.log("Gemini response:", responseText);

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      // If JSON parse fails, treat the whole response as transcript
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

/* ---------- Prompt Builder ---------- */

function buildTranscribeAndFeedbackPrompt(
  exerciseType: string,
  expectedText?: string,
  vocabList?: string[],
  lessonContext?: string
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
    return `${baseInstruction}

EXERCISE: Describe the Picture
The student looked at a picture and tried to describe it in Arabic.
Target vocabulary: ${vocabStr}
${lessonContext ? `Lesson context: ${lessonContext}` : ""}

Evaluate:
1. How many target vocab words did they use correctly?
2. Was the sentence grammatically reasonable?
3. What key vocab did they miss?
Give a score based on vocab coverage and effort (be generous for beginners).`;
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

  // Default
  return `${baseInstruction}

EXERCISE: Speaking Practice
${expectedText ? `Expected text: "${expectedText}"` : ""}
${vocabList ? `Target vocabulary: ${vocabList.join("، ")}` : ""}

Evaluate their Arabic and provide helpful feedback.`;
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
