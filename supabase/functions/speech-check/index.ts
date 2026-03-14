import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
      ? buildTranscribeAndFeedbackPrompt(exerciseType, body.expectedText, body.vocabList, body.lessonContext)
      : "Transcribe this Arabic audio. Return ONLY a JSON object: {\"transcript\": \"<the Arabic text>\"}. Nothing else.";

    // Build parts array: text + audio + optional image
    const parts: any[] = [
      { text: prompt },
      {
        inlineData: {
          mimeType: "audio/webm",
          data: base64Audio,
        },
      },
    ];

    // If imageUrl provided, fetch and include the image
    if (body.imageUrl && exerciseType === "picture-describe") {
      try {
        const imgRes = await fetch(body.imageUrl);
        if (imgRes.ok) {
          const imgBuf = await imgRes.arrayBuffer();
          const imgBase64 = btoa(String.fromCharCode(...new Uint8Array(imgBuf)));
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          parts.push({
            inlineData: {
              mimeType: contentType,
              data: imgBase64,
            },
          });
        }
      } catch (imgErr) {
        console.warn("Could not fetch image for context:", imgErr);
      }
    }

    // Gemini call
    const geminiRes = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/gemini-2.0-flash:generateContent`,
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
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    const geminiData = await geminiRes.json();

    if (geminiData.error) {
      console.error("Gemini error:", JSON.stringify(geminiData.error));
      return new Response(
        JSON.stringify({ ok: true, transcript: "" }),
        { headers: corsHeaders }
      );
    }

    const responseText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
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
    const vocabCount = vocabList?.length || 0;
    return `You are an Arabic language tutor. A student looked at a picture and described it in Arabic. You can see both the picture and hear the student's audio.

Your job:
1. Transcribe exactly what the student said in Arabic
2. Break down their response into segments and give step-by-step feedback
3. Score them out of 10 using the STRICT scoring formula below
4. Create interactive challenges based on the picture and their response

SCORING FORMULA (follow this exactly):
The score is calculated from 3 components:

A) VOCAB COVERAGE (30% of score = max 3 points)
   - Count how many of the ${vocabCount} target vocab words the student actually used
   - Score = (words_used / ${vocabCount}) × 3
   - Example: used 4 out of 11 words → (4/11) × 3 = 1.1 points
   - BE VERY LENIENT when matching — count a word as used if:
     * They said the word with or without ال (e.g. "مدرسة" counts for "المدرسة" and vice versa)
     * They said the word with ANY Arabic prefix/preposition attached: ب، بال، ل، لل، ك، كال، و، ف (e.g. "بالثلج" counts for "ثلج", "للمدرسة" counts for "مدرسة", "وأطفال" counts for "أطفال")
     * They used a plural/singular variant (e.g. "أطفال" counts for "طفل")
     * They used the same root with ANY conjugation (e.g. "يلعب" counts for "لعب")
     * They used a close synonym (e.g. "بيت" for "منزل", "ولد" for "صبي")
     * Ignore harakat differences entirely
     * If the student used a word that CONTAINS the target word as a substring, count it (e.g. "مدرستي" counts for "مدرسة", "بالثلج" counts for "ثلج")
     * If in doubt, count it as used — ALWAYS err on the side of generosity

B) RELEVANCE (40% of score = max 4 points)
   - Did they actually describe what's in the picture?
   - 4 points: Fully on-topic, described the picture accurately
   - 3 points: Mostly on-topic with some off-topic content
   - 2 points: Partially related to the picture
   - 1 point: Barely related to the picture
   - 0 points: Completely off-topic or said something unrelated to the picture

C) GRAMMAR & STRUCTURE (30% of score = max 3 points)
   - 3 points: Good sentence structure, proper Arabic grammar
   - 2 points: Decent sentences, minor errors
   - 1 point: Basic but understandable sentences
   - 0 points: Single words only or very broken grammar

Final score = A + B + C (round to 1 decimal place)

EXAMPLES:
- Used 4/11 vocab + completely off-topic = 1.1 + 0 + 1 = 2.1 → score: 2.1
- Used 8/11 vocab + on-topic + good grammar = 2.2 + 4 + 3 = 9.2 → score: 9.2
- Used 6/11 vocab + mostly on-topic + decent grammar = 1.6 + 3 + 2 = 6.6 → score: 6.6
- Used 4/11 vocab + on-topic + decent grammar = 1.1 + 4 + 2 = 7.1 → score: 7.1

CRITICAL — SILENCE DETECTION:
- If the audio is SILENT, contains only noise, or has NO recognizable Arabic speech:
  - transcript MUST be "" (empty string)
  - score MUST be 0
  - vocabUsed MUST be 0
  - Include only 1 segment step saying "No speech was detected. Try speaking into the microphone."
  - Do NOT invent or fabricate words the student did not say
  - Do NOT hallucinate a transcript — if you can't clearly hear Arabic words, the transcript is empty

IMPORTANT RULES:
- Do NOT penalize for harakat (تشكيل/إعراب) differences — speech recognition cannot detect diacritics
- Be HONEST about the score. Do NOT inflate it. If they talked about something unrelated to the picture, the relevance score MUST be 0.
- Do NOT fabricate or guess what the student said. Only transcribe words you can clearly hear.
- Each feedback step should be short (1-2 sentences)
- Look at the picture to give relevant follow-up questions

Target vocabulary (${vocabCount} words): ${vocabStr}
${lessonContext ? `Lesson context: ${lessonContext}` : ""}

You MUST respond with valid JSON in this exact format:
{
  "transcript": "<exact Arabic transcription of what was spoken>",
  "score": <number 0-10 calculated using the formula above>,
  "vocabUsed": <number of target vocab words they actually used>,
  "vocabTotal": ${vocabCount},
  "steps": [
    {
      "type": "segment",
      "snippet": "<a phrase the student said, in Arabic>",
      "analysis": "<brief DIRECT English analysis — no 'great job!' fluff. State what they said, whether it works, and what could be better>",
      "tip": "<improvement suggestion in English, or null>",
      "teach": null or {
        "type": "synonym" | "phrase" | "better_way",
        "label": "<short English label, e.g. 'Useful synonym' or 'Better phrasing' or 'Handy phrase'>",
        "arabic": "<the Arabic word/phrase being taught>",
        "english": "<English meaning>"
      }
    },
    {
      "type": "correction_challenge",
      "original": "<what the student said incorrectly, in Arabic>",
      "corrected": "<the better/correct version in Arabic>",
      "instruction": "<English instruction, e.g. 'Now try saying it correctly:'>"
    },
    {
      "type": "vocab_check",
      "used": ["<Arabic vocab words they used correctly>"],
      "missed": ["<Arabic vocab words they missed>"],
      "analysis": "<brief comment on vocab coverage>"
    },
    {
      "type": "speak_challenge",
      "prompt": "<English instruction asking a THEMATIC question related to the picture's theme or story>",
      "hint": "<optional Arabic hint or starter phrase, or null>"
    }
  ]
}

TONE RULES:
- Do NOT say "Great job!", "Well done!", "Excellent!" unless the segment is genuinely perfect
- Be DIRECT and MATTER-OF-FACT: "You said X. This is correct." or "You said X but Y would be more natural."
- If something is wrong, say so plainly: "This doesn't match the picture" or "The grammar here is incorrect"
- Think of yourself as a helpful but honest teacher, not a cheerleader

Guidelines for steps:
- Start with 2-3 "segment" steps breaking down what they said
- For every ODD-numbered segment (1st, 3rd), include a "teach" object: a useful synonym, a better way to phrase something, or a handy related phrase. For EVEN segments, set teach to null.
- After a segment that needs correction, add a "correction_challenge" asking them to repeat the better version
- Include exactly 1 "vocab_check" step
- Include 1 "improvement" step that provides ONE HIGHLY SPECIFIC tip based on what the student actually said. DO NOT give generic advice like "Try making longer sentences". Instead, identify a specific idea they tried to express (or a grammatical mistake they made that wasn't covered in a segment) and tell them exactly how to say it more naturally or eloquently in Arabic. Give a concrete example sentence in Arabic they could try. Format: {"type": "improvement", "suggestion": "<Specific English suggestion targeting their actual answer>", "example": "<an example Arabic sentence they could say, related to the picture>"}
- End with exactly 1 "speak_challenge" — this should be a THEMATIC or REFLECTIVE question about the picture's subject, NOT about physical objects. Examples: for a homeless person → "How do you think we can help people in this situation?", for a family at the park → "What's your favourite thing about going to the park?", for a classroom → "What subject do you enjoy the most?". The question should invite the student to express an opinion or share a thought in Arabic.
- Do NOT include a "summary" step
- If the student said nothing (silent audio), score 0 and tell them to try speaking. Still include the speak_challenge so they can try.
- Only include correction_challenge if there was actually something to correct`;
  }

  if (exerciseType === "challenge-check") {
    return `You are an Arabic language tutor evaluating a student's pronunciation practice.

The student was asked to say this Arabic phrase: "${expectedText}"

Your job:
1. Transcribe exactly what they said
2. Determine if what they said is CLOSE ENOUGH to the expected phrase
3. Be HONEST — if they said something completely different or unrelated, score them 0

Scoring rules:
- 80-100: They said it correctly or very close (minor differences OK, ignore harakat)
- 50-79: They attempted it but made noticeable errors in words or structure
- 20-49: They tried but got many words wrong or mixed up the meaning
- 0-19: They said something completely different or unrelated to the expected phrase

Do NOT be falsely encouraging. If they said garbage or something unrelated, say so honestly.
Ignore harakat/diacritics differences — focus on root words and meaning.

You MUST respond with valid JSON:
{
  "transcript": "<what they actually said in Arabic>",
  "overallScore": <number 0-100>,
  "pass": <true if score >= 50, false otherwise>,
  "feedback": "<1 sentence honest assessment>"
}`;
  }

  if (exerciseType === "speak-check") {
    return `You are an Arabic language tutor. The student was asked this question: "${expectedText}"

They were supposed to answer in Arabic. Listen to their audio.

Your job:
1. Transcribe what they said
2. Did they answer IN ARABIC and is it AT LEAST VAGUELY relevant to the question?
3. Be LENIENT on passing — this is the end of a lesson
4. But give MEANINGFUL feedback, not just "Good job!"

Pass criteria (be generous):
- They spoke Arabic (not English or silence) → likely pass
- Their answer is at least loosely related to the topic → pass
- They made grammar mistakes but communicated something → pass
- They said something totally unrelated to the question → fail
- They said nothing or only English words → fail
- Silent audio → fail, transcript must be ""

If they PASS: Give specific feedback about what they said. Mention what was good about their answer and teach them one useful related word or phrase they could use next time.
If they FAIL: Clearly explain what was expected and give an example Arabic sentence they could say.

You MUST respond with valid JSON:
{
  "transcript": "<what they actually said in Arabic, or empty string if silent>",
  "overallScore": <number 0-100>,
  "pass": <true if they made any reasonable Arabic attempt related to the topic>,
  "feedback": "<2-3 sentences: what they said, what was good/bad, and one teaching point>"
}`;
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
