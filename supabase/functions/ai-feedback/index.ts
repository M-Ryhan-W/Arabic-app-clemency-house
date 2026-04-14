import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const { transcript, exerciseType, expectedText, vocabList, lessonContext } = body;

        if (!transcript) {
            return new Response(
                JSON.stringify({ error: "No transcript provided" }),
                { status: 400, headers: corsHeaders }
            );
        }

        // Reuse existing GCP service account for Gemini auth
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

        if (!tokenData.access_token) {
            console.error("Token error:", tokenData);
            return new Response(
                JSON.stringify({ error: "Failed to authenticate with GCP" }),
                { status: 500, headers: corsHeaders }
            );
        }

        // Build the prompt based on exercise type
        const prompt = buildPrompt(exerciseType, transcript, expectedText, vocabList, lessonContext);

        // Call Gemini Flash Lite via Vertex AI
        const geminiRes = await fetch(
            `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/gemini-2.5-flash-lite:generateContent`,
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
                            parts: [{ text: prompt }],
                        },
                    ],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 512,
                        responseMimeType: "application/json",
                    },
                }),
            }
        );

        const geminiData = await geminiRes.json();
        console.log("Gemini status:", geminiRes.status);

        if (geminiData.error) {
            console.error("Gemini API error:", JSON.stringify(geminiData.error));
            return new Response(
                JSON.stringify({ error: "Gemini API error", details: geminiData }),
                { status: 500, headers: corsHeaders }
            );
        }

        // Extract the text content from Gemini response
        const responseText =
            geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

        console.log("Gemini response text:", responseText);

        // Parse the JSON response from Gemini
        let feedback;
        try {
            feedback = JSON.parse(responseText);
        } catch {
            console.error("Failed to parse Gemini response as JSON:", responseText);
            feedback = {
                overallScore: 50,
                feedback: "I had trouble analyzing your response. Please try again!",
                corrections: [],
                encouragement: "Keep practicing! 💪",
                missedVocab: [],
            };
        }

        return new Response(
            JSON.stringify({ ok: true, ...feedback }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (err) {
        console.error("ai-feedback error:", err);
        return new Response(
            JSON.stringify({ error: err.message }),
            { status: 500, headers: corsHeaders }
        );
    }
});

/* ---------- Prompt Builder ---------- */

function buildPrompt(
    exerciseType: string,
    transcript: string,
    expectedText?: string,
    vocabList?: string[],
    lessonContext?: string
): string {
    const baseInstruction = `You are an Arabic language tutor giving feedback to a beginner-intermediate student.
Give feedback in ENGLISH (the student is an English speaker learning Arabic).
Keep feedback concise — 1-2 sentences max.
Keep corrections to the most important 1-2 items only.
Do NOT add encouragement, greetings, or filler phrases like "Great job!", "Keep going!" etc.
NEVER comment on vowel marks (harakat/tashkeel/diacritics) — they are not captured via audio and the student cannot control them. Ignore all diacritic differences.

You MUST respond with valid JSON in this exact format:
{
  "overallScore": <number 0-100>,
  "feedback": "<1-2 sentence summary of how they did>",
  "corrections": [
    {
      "said": "<what the student said in Arabic>",
      "better": "<better version in Arabic>",
      "explanation": "<brief English explanation>"
    }
  ],
  "missedVocab": ["<Arabic words they missed>"]
}`;

    if (exerciseType === "picture-describe") {
        const vocabStr = vocabList?.join("، ") || "N/A";
        return `${baseInstruction}

EXERCISE: Describe the Picture
The student looked at a picture and tried to describe it in Arabic.
Target vocabulary: ${vocabStr}
${lessonContext ? `Lesson context: ${lessonContext}` : ""}

The student said: "${transcript}"

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

The speech recognition captured: "${transcript}"

Evaluate:
1. How closely does their spoken text match the expected text? 
2. Note any words that were mispronounced or missed (based on transcription differences).
3. Be aware that Arabic speech recognition may miss diacritics — focus on root word accuracy.
Give a score based on accuracy (exact match = 100, partial = proportional).`;
    }

    if (exerciseType === "translate") {
        return `${baseInstruction}

EXERCISE: Translate the Sentence
The student was shown an English sentence and asked to say the Arabic translation aloud.
Expected Arabic translation: "${expectedText}"

The student said: "${transcript}"

Evaluate:
1. Is the translation accurate in meaning?
2. Is the grammar correct (word order, verb conjugation, prepositions)?
3. Are there alternative correct translations they might have used?
Give a score based on meaning accuracy and grammar.`;
    }

    // Default / unknown exercise type
    return `${baseInstruction}

EXERCISE: Speaking Practice
${expectedText ? `Expected text: "${expectedText}"` : ""}
${vocabList ? `Target vocabulary: ${vocabList.join("، ")}` : ""}

The student said: "${transcript}"

Evaluate their Arabic and provide helpful feedback.`;
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
