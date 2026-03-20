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
        const { question, lessonTitle, lessonBlocks, vocabList, grammarNotes } = body;

        if (!question) {
            return new Response(
                JSON.stringify({ error: "No question provided" }),
                { status: 400, headers: corsHeaders }
            );
        }

        // Auth with GCP service account
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

        // Build contextual system prompt
        const systemPrompt = buildSystemPrompt(lessonTitle, lessonBlocks, vocabList, grammarNotes);

        // Call Gemini 2.0 Flash
        const geminiRes = await fetch(
            `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent`,
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
                            parts: [{ text: `${systemPrompt}\n\nStudent's question: ${question}` }],
                        },
                    ],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 1024,
                    },
                }),
            }
        );

        const geminiData = await geminiRes.json();
        console.log("Gemini status:", geminiRes.status);

        if (geminiData.error) {
            console.error("Gemini API error:", JSON.stringify(geminiData.error));
            return new Response(
                JSON.stringify({ error: "Gemini API error" }),
                { status: 500, headers: corsHeaders }
            );
        }

        const answer =
            geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't generate a response. Please try again.";

        return new Response(
            JSON.stringify({ ok: true, answer }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (err) {
        console.error("lesson-ai-helper error:", err);
        return new Response(
            JSON.stringify({ error: (err as Error).message }),
            { status: 500, headers: corsHeaders }
        );
    }
});

/* ---------- Prompt Builder ---------- */

function buildSystemPrompt(
    lessonTitle?: string,
    lessonBlocks?: { text_ar?: string; text_en?: string; block_type?: string }[],
    vocabList?: string[],
    grammarNotes?: string[]
): string {
    let context = `You are an Arabic language tutor helping a beginner-intermediate English-speaking student.

STRICT RULES:
- Give ONLY the information requested. No greetings, encouragement, filler, or phrases like "Great job!", "Well done!", "Keep it up!" etc.
- Keep answers concise (2-4 sentences max unless a list is requested).
- Use simple English for explanations. Include Arabic script when referencing Arabic words.
- Add transliterations in parentheses for Arabic words.
- NEVER comment on vowel marks (harakat/tashkeel) — the student learns via audio, and vowel marks are not captured in speech recognition. Do not mention diacritics as errors.
- Format Arabic words in quotes for clarity.
`;

    if (lessonTitle) {
        context += `\nCurrent lesson: "${lessonTitle}"\n`;
    }

    if (lessonBlocks && lessonBlocks.length > 0) {
        const dialogueText = lessonBlocks
            .slice(0, 20) // Limit to prevent token overflow
            .map((b) => {
                if (b.text_ar && b.text_en) return `Arabic: ${b.text_ar}\nEnglish: ${b.text_en}`;
                if (b.text_ar) return `Arabic: ${b.text_ar}`;
                return "";
            })
            .filter(Boolean)
            .join("\n---\n");

        if (dialogueText) {
            context += `\nLesson dialogue/content:\n${dialogueText}\n`;
        }
    }

    if (vocabList && vocabList.length > 0) {
        context += `\nKey vocabulary: ${vocabList.join("، ")}\n`;
    }

    if (grammarNotes && grammarNotes.length > 0) {
        context += `\nGrammar notes covered: ${grammarNotes.join("; ")}\n`;
    }

    return context;
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
