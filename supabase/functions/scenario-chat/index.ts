import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---- TTS Audio Cache (server-side, persists across warm requests) ----
const ttsCache = new Map<string, { audio: string; ts: number }>();
const TTS_CACHE_MAX = 50; // max entries
const TTS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

function getTtsCached(text: string): string | null {
    const entry = ttsCache.get(text);
    if (entry && Date.now() - entry.ts < TTS_CACHE_TTL) return entry.audio;
    if (entry) ttsCache.delete(text);
    return null;
}

function setTtsCached(text: string, audio: string) {
    // Evict oldest if at capacity
    if (ttsCache.size >= TTS_CACHE_MAX) {
        const oldest = ttsCache.keys().next().value;
        if (oldest) ttsCache.delete(oldest);
    }
    ttsCache.set(text, { audio, ts: Date.now() });
}

// ---- Text Hashing (for persistent TTS cache keys) ----
async function hashText(text: string): Promise<string> {
    const data = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ---- Rate Limiting ----
const DAILY_SESSION_LIMIT = 3;   // Max scenario starts per user per day
const DAILY_REQUEST_LIMIT = 100; // Max total AI requests per user per day

async function verifyUserAndCheckLimits(req: Request, action: string): Promise<{ userId: string } | Response> {
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

    // Check and increment usage
    const today = new Date().toISOString().split("T")[0];

    // Upsert daily usage row
    const { data: usage, error: upsertErr } = await supabase
        .from("daily_usage")
        .upsert(
            { user_id: user.id, usage_date: today, scenario_sessions: 0, total_requests: 0 },
            { onConflict: "user_id,usage_date", ignoreDuplicates: true }
        )
        .select()
        .single();

    // Fetch current usage (upsert with ignoreDuplicates won't return existing row reliably)
    const { data: currentUsage } = await supabase
        .from("daily_usage")
        .select("scenario_sessions, total_requests")
        .eq("user_id", user.id)
        .eq("usage_date", today)
        .single();

    if (currentUsage) {
        // Check limits
        if (action === "start" && currentUsage.scenario_sessions >= DAILY_SESSION_LIMIT) {
            return new Response(JSON.stringify({
                error: "daily_limit",
                message: `You've reached your daily limit of ${DAILY_SESSION_LIMIT} scenario sessions. Come back tomorrow!`,
            }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (currentUsage.total_requests >= DAILY_REQUEST_LIMIT) {
            return new Response(JSON.stringify({
                error: "daily_limit",
                message: "You've reached your daily request limit. Come back tomorrow!",
            }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Increment counters
        const updates: any = { total_requests: currentUsage.total_requests + 1 };
        if (action === "start") {
            updates.scenario_sessions = currentUsage.scenario_sessions + 1;
        }
        await supabase
            .from("daily_usage")
            .update(updates)
            .eq("user_id", user.id)
            .eq("usage_date", today);
    }

    return { userId: user.id };
}

// ---- OAuth Token Cache ----
let cachedToken = null;
let tokenExpiresAt = 0;
let cachedProjectId = null;

async function getAccessToken() {
    const now = Date.now();
    if (cachedToken && cachedProjectId && now < tokenExpiresAt) {
        return { token: cachedToken, projectId: cachedProjectId };
    }

    const creds = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON"));
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

    return { token: cachedToken, projectId: cachedProjectId };
}

// Extract response text from Gemini response, skipping thinking/reasoning parts
function extractResponseText(geminiData: any): string | undefined {
    const parts = geminiData?.candidates?.[0]?.content?.parts;
    if (!parts) return undefined;
    // Find the last non-thinking part (response comes after thinking)
    for (let i = parts.length - 1; i >= 0; i--) {
        if (!parts[i].thought && parts[i].text) return parts[i].text;
    }
    return parts[0]?.text; // fallback
}

async function callVertexAI(projectId: string, token: string, payload: any, model: string = "gemini-2.5-flash-lite", maxRetries: number = 3) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const geminiRes = await fetch(
            `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/${model}:generateContent`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            }
        );
        const geminiData = await geminiRes.json();
        if (geminiData.error) {
            const code = geminiData.error.code;
            // Retry on 429 (rate limit) and 503 (overloaded) with exponential backoff
            if ((code === 429 || code === 503) && attempt < maxRetries) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
                console.warn(`[callVertexAI] ${code} on attempt ${attempt + 1}, retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw new Error(JSON.stringify(geminiData.error) || "Gemini API Error");
        }
        return geminiData;
    }
    throw new Error("callVertexAI: max retries exceeded");
}

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SCENARIOS = [
    { id: "cafe", emoji: "☕", title: "At the Café", titleAr: "في المقهى", setting: "You are a waiter at an Arabic café. The student walks in and wants to order a drink and a snack. Greet them warmly and take their order." },
    { id: "restaurant", emoji: "🍽️", title: "At the Restaurant", titleAr: "في المطعم", setting: "You are a friendly waiter at an Arabic restaurant. The student is dining and wants to order food. Help them choose from the menu." },
    { id: "groceries", emoji: "🛒", title: "Buying Groceries", titleAr: "شراء البقالة", setting: "You are a shopkeeper at a small grocery store. The student needs to buy fruits, vegetables, and household items. Help them find what they need." },
    { id: "hotel", emoji: "🏨", title: "Checking into a Hotel", titleAr: "تسجيل في الفندق", setting: "You are a hotel receptionist. The student is checking in. Ask about their reservation, how many nights, and give them their room key." },
    { id: "airport", emoji: "✈️", title: "At the Airport", titleAr: "في المطار", setting: "You are an airline staff member at the check-in counter. The student needs to check in for their flight. Ask for their passport and help them." },
    { id: "directions", emoji: "🗺️", title: "Asking for Directions", titleAr: "السؤال عن الاتجاهات", setting: "You are a local person on the street. The student is lost and needs directions to the mosque/library/market. Help them find their way." },
    { id: "market", emoji: "🛍️", title: "At the Market", titleAr: "في السوق", setting: "You are a market vendor selling spices and traditional goods. The student wants to buy something. Negotiate the price with them." },
    { id: "clothes", emoji: "👕", title: "Buying Clothes", titleAr: "شراء الملابس", setting: "You are a clothing store assistant. The student wants to buy clothes. Help them find the right size and color." },
    { id: "bookstore", emoji: "📚", title: "At the Bookstore", titleAr: "في المكتبة", setting: "You are a bookstore clerk. The student is looking for Arabic books. Help them find something suitable for their level." },
    { id: "meeting", emoji: "🤝", title: "Meeting Someone New", titleAr: "لقاء شخص جديد", setting: "You are a friendly person at a social gathering. The student is new. Introduce yourself, ask about them, where they're from, and what they do." },
    { id: "invitation", emoji: "💌", title: "Inviting a Friend", titleAr: "دعوة صديق", setting: "You are the student's friend. They want to invite you to dinner/a party. Discuss the details — when, where, what to bring." },
    { id: "family", emoji: "👨‍👩‍👧‍👦", title: "Family Gathering", titleAr: "تجمع عائلي", setting: "You are a relative at a family gathering. Chat about how everyone is doing, ask about school/work, and discuss family news." },
    { id: "pharmacy", emoji: "💊", title: "At the Pharmacy", titleAr: "في الصيدلية", setting: "You are a pharmacist. The student is feeling unwell and needs medicine. Ask about their symptoms and recommend something." },
    { id: "taxi", emoji: "🚕", title: "Taking a Taxi", titleAr: "ركوب التاكسي", setting: "You are a taxi driver. The student needs to go somewhere. Ask where they're heading and discuss the route and fare." },
    { id: "bank", emoji: "🏦", title: "At the Bank", titleAr: "في البنك", setting: "You are a bank teller. The student needs to open an account or exchange money. Help them through the process." },
    { id: "school", emoji: "🏫", title: "First Day at School", titleAr: "أول يوم في المدرسة", setting: "You are a teacher welcoming a new student. Show them around, ask what subjects they like, and make them feel welcome." },
    { id: "gym", emoji: "💪", title: "At the Gym", titleAr: "في النادي الرياضي", setting: "You are a gym trainer. The student wants to sign up. Ask about their fitness goals and show them around." },
    { id: "doctor", emoji: "🩺", title: "Doctor's Visit", titleAr: "زيارة الطبيب", setting: "You are a doctor. The student has come for a checkup. Ask about how they're feeling, any symptoms, and give advice." },
    { id: "library", emoji: "📖", title: "At the Library", titleAr: "في المكتبة العامة", setting: "You are a librarian. The student wants to borrow books or find a quiet study spot. Help them." },
    { id: "bakery", emoji: "🥐", title: "At the Bakery", titleAr: "في المخبز", setting: "You are a baker. The student wants to buy bread, pastries, and sweets. Tell them about today's fresh items." },
    { id: "phone", emoji: "📱", title: "Phone Store", titleAr: "محل الهواتف", setting: "You are a phone store employee. The student wants to buy a new phone or fix their broken one. Help them choose." },
    { id: "park", emoji: "🌳", title: "At the Park", titleAr: "في الحديقة", setting: "You are someone sitting on a bench at the park. The student sits next to you. Have a casual conversation about the weather, the park, and life." },
    { id: "post_office", emoji: "📮", title: "At the Post Office", titleAr: "في مكتب البريد", setting: "You are a post office clerk. The student wants to send a package or buy stamps. Help them with the process." },
    { id: "barber", emoji: "💇", title: "At the Barber", titleAr: "عند الحلاق", setting: "You are a barber. The student wants a haircut. Ask what style they want, how short, etc." },
    { id: "neighbor", emoji: "🏠", title: "Meeting Your Neighbor", titleAr: "لقاء جارك", setting: "You are the student's new neighbor. They've just moved in. Welcome them, introduce yourself, and chat about the neighborhood." },
    { id: "travel_agent", emoji: "🧳", title: "Planning a Trip", titleAr: "التخطيط لرحلة", setting: "You are a travel agent. The student wants to plan a trip. Ask where they want to go, how long, and suggest activities." },
    { id: "mechanic", emoji: "🔧", title: "At the Mechanic", titleAr: "عند الميكانيكي", setting: "You are a car mechanic. The student's car has a problem. Ask what's wrong and explain what needs to be fixed." },
    { id: "birthday", emoji: "🎂", title: "Birthday Party", titleAr: "حفلة عيد ميلاد", setting: "You are at a friend's birthday party. The student is also there. Chat about the party, the birthday person, and have fun." },
    { id: "rent", emoji: "🏢", title: "Renting an Apartment", titleAr: "استئجار شقة", setting: "You are a landlord showing an apartment. The student is interested in renting. Show them around and discuss the price and rules." },
    { id: "wedding", emoji: "💒", title: "At a Wedding", titleAr: "في حفل زفاف", setting: "You are a guest at a wedding. The student is also a guest. Chat about the couple, the ceremony, and celebrate together." },
];

function getTodayScenario(): typeof SCENARIOS[0] {
    const today = new Date();
    const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
    const index = (dayOfYear * 17 + 7) % SCENARIOS.length;
    return SCENARIOS[index];
}

function buildSystemPrompt(scenario: typeof SCENARIOS[0], difficulty: string, elapsedTimeSec: number = 0, turnCount: number = 0): string {
    const time = elapsedTimeSec > 200 ? " WRAP UP NOW — set isEnding=true." : "";
    const turn = turnCount < 6 ? "Keep going, don't end yet." : "May wrap up naturally.";
    const diff: any = {
        easy: "EASY: Very basic Arabic, short sentences, end with yes/no question.",
        intermediate: "MEDIUM: Simple Fusha, moderate sentences, end with follow-up question.",
        advanced: "HARD: Natural Fusha, richer vocab, 2-3 sentences max, end with follow-up question."
    };

    return `Character in Arabic scenario. Stay in character.
SCENARIO: ${scenario.title} — ${scenario.setting}
${diff[difficulty] || diff.intermediate}
Turn ${turnCount}/~8.${turn}${time}
RULES: Full tashkeel on ALL Arabic. Fusha only. 1-3 sentences. React then ask.
JSON: {"message":"<Arabic with tashkeel>","isEnding":${turnCount >= 6 ? "true/false" : "false"},"keyPhrase":{"arabic":"...","english":"..."}}`;
}

function buildStreamingSystemPrompt(scenario: typeof SCENARIOS[0], difficulty: string, elapsedTimeSec: number = 0, turnCount: number = 0): string {
    const time = elapsedTimeSec > 200 ? " Wrap up now." : "";
    const diff: any = {
        easy: "Basic Arabic, very short.",
        intermediate: "Simple Fusha, moderate.",
        advanced: "Natural Fusha, richer vocab, 2-3 sentences max."
    };

    return `Character in Arabic scenario. Stay in character.
SCENARIO: ${scenario.title} — ${scenario.setting}
${diff[difficulty] || diff.intermediate} Turn ${turnCount}/~8.${time}
Full tashkeel. Fusha only. 1-3 sentences. End with question. ONLY Arabic, no English/JSON.`;
}

function cleanJson(text: string): string {
    if (!text) return "";
    let cleaned = String(text).trim();
    const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match) {
        return match[1].trim();
    }

    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1 && start <= end) {
        return cleaned.substring(start, end + 1);
    }

    return cleaned;
}

// Compress conversation history: summarize old turns, keep last 4 in full
function compressHistory(history: any[]): any[] {
    if (!history || history.length <= 4) return history || [];
    const older = history.slice(0, -4);
    const recent = history.slice(-4);
    // Summarize older turns into a single compact line
    const summary = older.map(m => `${m.role === 'ai' ? 'AI' : 'User'}: ${m.text.substring(0, 60)}`).join(' | ');
    return [{ role: "user", text: `[Earlier conversation summary: ${summary}]` }, ...recent];
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const reqBody = await req.json();
        const { action, difficulty, conversationHistory, audioBase64 } = reqBody;

        // Action: get-scenario (no auth needed — no AI call)
        if (action === "get-scenario") {
            const scenario = getTodayScenario();
            return new Response(JSON.stringify({
                id: scenario.id,
                emoji: scenario.emoji,
                title: scenario.title,
                titleAr: scenario.titleAr,
                setting: scenario.setting,
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // --- Auth & rate limiting for all AI actions ---
        const aiActions = ["start", "reply", "reply-stream", "help", "generate-tts"];
        if (aiActions.includes(action)) {
            const authResult = await verifyUserAndCheckLimits(req, action);
            if (authResult instanceof Response) return authResult;
        }

        // Action: start
        if (action === "start") {
            const scenario = getTodayScenario();
            const systemPrompt = buildSystemPrompt(scenario, difficulty || "intermediate", reqBody.elapsedSeconds || 0, 0);
            const { token, projectId } = await getAccessToken();

            const geminiData = await callVertexAI(projectId, token, {
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: "user", parts: [{ text: "Start the conversation. Greet me in character." }] }],
                generationConfig: { temperature: 0.8, maxOutputTokens: 600, responseMimeType: "application/json" },
            }, "gemini-2.5-flash-lite");

            const text = extractResponseText(geminiData);
            if (!text) throw new Error("No response from Gemini");

            const parsed = JSON.parse(cleanJson(text));
            return new Response(JSON.stringify(parsed), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Action: reply
        if (action === "reply") {
            const scenario = getTodayScenario();
            const systemPrompt = buildSystemPrompt(scenario, difficulty || "intermediate", reqBody.elapsedSeconds || 0, reqBody.turnCount || 0);
            const { token, projectId } = await getAccessToken();

            const contents = [];
            contents.push({ role: "user", parts: [{ text: "Start the conversation. Greet me in character." }] });

            const compressed = compressHistory(conversationHistory);
            for (const msg of compressed) {
                const msgRole = msg.role === "ai" ? "model" : "user";
                const lastTurn = contents[contents.length - 1];
                if (lastTurn.role === msgRole) {
                    lastTurn.parts[0].text += "\n" + msg.text;
                } else {
                    contents.push({ role: msgRole, parts: [{ text: msg.text }] });
                }
            }

            if (audioBase64) {
                // Gemini only accepts base MIME types (e.g. "audio/webm"), not codec params
                const audioMime = (reqBody.mimeType || "audio/webm").split(";")[0].trim();
                const transcribeData = await callVertexAI(projectId, token, {
                    contents: [{
                        role: "user",
                        parts: [
                            { inlineData: { mimeType: audioMime, data: audioBase64 } },
                            { text: 'Transcribe ONLY clearly spoken Arabic words from this audio. Rules: 1) If the audio is silent, has only noise, breathing, or mumbling with no clear words, return {"transcript":""}. 2) Do NOT guess or invent words. Do NOT hallucinate sentences. If you are not confident about what was said, return {"transcript":""}. 3) Only transcribe words you can clearly hear. Return: {"transcript":"<Arabic text>"} or {"transcript":""}' },
                        ],
                    }],
                    generationConfig: { temperature: 0.1, maxOutputTokens: 400, responseMimeType: "application/json" },
                }, "gemini-2.5-flash-lite");

                const transcribeText = extractResponseText(transcribeData);
                console.log("Transcription raw:", transcribeText);
                let transcript = "";
                try {
                    const parsed = JSON.parse(cleanJson(transcribeText));
                    transcript = parsed.transcript || "";
                } catch {
                    transcript = transcribeText || "";
                }

                // Strip diacritics for length check
                const stripped = transcript.replace(/[\u064B-\u065F\u0670]/g, "").trim();
                // Allow single-word answers (e.g. نعم, لا, شكراً) — only reject truly empty/noise
                if (stripped.length < 1) transcript = "";

                if (!transcript || transcript.trim() === "") {
                    return new Response(JSON.stringify({
                        transcript: "",
                        message: "لَمْ أَسْمَعْ شَيْئًا. هَلْ يُمْكِنُكَ تَكْرَارُ ذَلِكَ مِنْ فَضْلِكَ؟",
                        translation: "I didn't hear anything. Can you repeat that please?",
                        hint: "Speak clearly into the microphone and try again.",
                        isEnding: false,
                        keyPhrase: null,
                    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
                }

                const lastTurnRole = contents[contents.length - 1].role;
                if (lastTurnRole === "user") {
                    contents[contents.length - 1].parts[0].text += "\n" + transcript;
                } else {
                    contents.push({
                        role: "user",
                        parts: [{ text: transcript }],
                    });
                }

                const replyData = await callVertexAI(projectId, token, {
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    contents,
                    generationConfig: { temperature: 0.8, maxOutputTokens: 1000, responseMimeType: "application/json" },
                }, "gemini-2.5-flash-lite");

                const replyText = extractResponseText(replyData);
                console.log("Reply raw:", replyText);
                if (!replyText) throw new Error("No response from Gemini");

                const parsed = JSON.parse(cleanJson(replyText));
                return new Response(JSON.stringify({ ...parsed, transcript }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            throw new Error("No audio provided");
        }

        // Action: reply-stream — SSE streaming version of reply
        if (action === "reply-stream") {
            const scenario = getTodayScenario();
            const { token, projectId } = await getAccessToken();

            // Build conversation history for context
            const contents: any[] = [];
            contents.push({ role: "user", parts: [{ text: "Start the conversation. Greet me in character." }] });

            const compressed = compressHistory(conversationHistory);
            for (const msg of compressed) {
                const msgRole = msg.role === "ai" ? "model" : "user";
                const lastTurn = contents[contents.length - 1];
                if (lastTurn.role === msgRole) {
                    lastTurn.parts[0].text += "\n" + msg.text;
                } else {
                    contents.push({ role: msgRole, parts: [{ text: msg.text }] });
                }
            }

            if (!audioBase64) {
                throw new Error("No audio provided");
            }

            // --- SSE Response Stream ---
            const sseHeaders = {
                ...corsHeaders,
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            };

            const stream = new ReadableStream({
                async start(controller) {
                    const sendEvent = (data: any) => {
                        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
                    };

                    try {
                        // --- Step 1: Transcribe audio ---
                        const audioMime = (reqBody.mimeType || "audio/webm").split(";")[0].trim();
                        const transcribeData = await callVertexAI(projectId, token, {
                            contents: [{
                                role: "user",
                                parts: [
                                    { inlineData: { mimeType: audioMime, data: audioBase64 } },
                                    { text: 'Transcribe ONLY clearly spoken Arabic words from this audio. Rules: 1) If the audio is silent, has only noise, breathing, or mumbling with no clear words, return {"transcript":""}. 2) Do NOT guess or invent words. Do NOT hallucinate sentences. If you are not confident about what was said, return {"transcript":""}. 3) Only transcribe words you can clearly hear. Return: {"transcript":"<Arabic text>"} or {"transcript":""}' },
                                ],
                            }],
                            generationConfig: { temperature: 0.1, maxOutputTokens: 400, responseMimeType: "application/json" },
                        }, "gemini-2.5-flash-lite");

                        const transcribeText = extractResponseText(transcribeData);
                        let transcript = "";
                        try {
                            const parsed = JSON.parse(cleanJson(transcribeText));
                            transcript = parsed.transcript || "";
                        } catch {
                            transcript = transcribeText || "";
                        }

                        // Strip diacritics for length check (tashkeel inflates char count)
                        const stripped = transcript.replace(/[\u064B-\u065F\u0670]/g, "").trim();
                        // Reject very short transcripts — likely hallucinated from noise
                        // Also reject single-word transcripts (common hallucination artifacts)
                        const wordCount = stripped.split(/\s+/).filter(w => w.length > 0).length;
                        if (stripped.length < 5 || wordCount < 2) {
                            transcript = "";
                        }

                        // Send transcript event immediately
                        sendEvent({ type: "transcript", text: transcript });

                        if (!transcript || transcript.trim() === "") {
                            sendEvent({
                                type: "done",
                                message: "لَمْ أَسْمَعْ شَيْئًا. هَلْ يُمْكِنُكَ تَكْرَارُ ذَلِكَ مِنْ فَضْلِكَ؟",
                                translation: "I didn't hear anything. Can you repeat that please?",
                                hint: "Speak clearly into the microphone and try again.",
                                isEnding: false,
                                keyPhrase: null,
                                audioBase64: null,
                                emptyTranscript: true,
                            });
                            controller.close();
                            return;
                        }

                        // Add transcript to conversation context
                        const lastTurnRole = contents[contents.length - 1].role;
                        if (lastTurnRole === "user") {
                            contents[contents.length - 1].parts[0].text += "\n" + transcript;
                        } else {
                            contents.push({ role: "user", parts: [{ text: transcript }] });
                        }

                        // --- Step 2: Stream Gemini reply (plain Arabic text) ---
                        const streamSystemPrompt = buildStreamingSystemPrompt(scenario, difficulty || "intermediate", reqBody.elapsedSeconds || 0, reqBody.turnCount || 0);

                        let streamRes: Response | null = null;
                        for (let attempt = 0; attempt < 3; attempt++) {
                            streamRes = await fetch(
                                `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/gemini-2.5-flash-lite:streamGenerateContent?alt=sse`,
                                {
                                    method: "POST",
                                    headers: {
                                        Authorization: `Bearer ${token}`,
                                        "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                        systemInstruction: { parts: [{ text: streamSystemPrompt }] },
                                        contents,
                                        generationConfig: { temperature: 0.8, maxOutputTokens: 1000 },
                                    }),
                                }
                            );
                            if (streamRes.ok && streamRes.body) break;
                            if (streamRes.status === 429 || streamRes.status === 503) {
                                const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
                                console.warn(`[reply-stream] ${streamRes.status} on attempt ${attempt + 1}, retrying in ${delay}ms...`);
                                await new Promise(r => setTimeout(r, delay));
                                continue;
                            }
                            break; // non-retryable error
                        }

                        if (!streamRes || !streamRes.ok || !streamRes.body) {
                            const errText = streamRes ? await streamRes.text() : "no response";
                            console.error("[reply-stream] Gemini stream error:", streamRes?.status, errText);
                            throw new Error("Gemini streaming failed");
                        }

                        // Read the SSE stream from Gemini and forward chunks
                        let fullArabicReply = "";
                        const reader = streamRes.body.getReader();
                        const decoder = new TextDecoder();
                        let buffer = "";

                        while (true) {
                            const { done, value } = await reader.read();

                            if (value) {
                                buffer += decoder.decode(value, { stream: !done });
                            }
                            if (done) {
                                buffer += decoder.decode(); // flush
                            }

                            // Normalize \r\n → \n (HTTP responses may use CRLF)
                            buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

                            // SSE events are separated by double-newline (\n\n)
                            let eventEnd;
                            while ((eventEnd = buffer.indexOf("\n\n")) !== -1) {
                                const eventBlock = buffer.slice(0, eventEnd);
                                buffer = buffer.slice(eventEnd + 2);

                                for (const line of eventBlock.split("\n")) {
                                    const trimmed = line.trim();
                                    if (trimmed.startsWith("data: ")) {
                                        const jsonStr = trimmed.slice(6).trim();
                                        if (jsonStr === "[DONE]") continue;
                                        try {
                                            const chunk = JSON.parse(jsonStr);
                                            const parts = chunk?.candidates?.[0]?.content?.parts;
                                            if (parts) {
                                                for (const part of parts) {
                                                    // Skip thinking/reasoning tokens — only forward actual response text
                                                    if (part.thought) continue;
                                                    if (part.text) {
                                                        fullArabicReply += part.text;
                                                        sendEvent({ type: "chunk", text: part.text });
                                                    }
                                                }
                                            }
                                            // Log if Gemini stopped for any reason
                                            const finish = chunk?.candidates?.[0]?.finishReason;
                                            if (finish && finish !== "STOP") {
                                                console.warn("[reply-stream] finishReason:", finish);
                                            }
                                        } catch (e: any) {
                                            console.error("[reply-stream] chunk parse error:", e.message, "data:", jsonStr.substring(0, 200));
                                        }
                                    }
                                }
                            }

                            if (done) {
                                // Parse remaining buffer
                                if (buffer.trim()) {
                                    for (const line of buffer.split("\n")) {
                                        const trimmed = line.trim();
                                        if (trimmed.startsWith("data: ")) {
                                            const jsonStr = trimmed.slice(6).trim();
                                            if (jsonStr === "[DONE]") continue;
                                            try {
                                                const chunk = JSON.parse(jsonStr);
                                                const parts = chunk?.candidates?.[0]?.content?.parts;
                                                if (parts) {
                                                    for (const part of parts) {
                                                        if (part.thought) continue;
                                                        if (part.text) {
                                                            fullArabicReply += part.text;
                                                            sendEvent({ type: "chunk", text: part.text });
                                                        }
                                                    }
                                                }
                                            } catch (e) {}
                                        }
                                    }
                                }
                                break;
                            }
                        }

                        if (!fullArabicReply.trim()) {
                            throw new Error("No reply text generated");
                        }

                        // --- Step 3: Parallel metadata extraction + TTS ---
                        const [metaResult, ttsResult] = await Promise.allSettled([
                            // Metadata extraction (fast Flash-Lite call)
                            callVertexAI(projectId, token, {
                                contents: [{
                                    role: "user",
                                    parts: [{ text: `Given this Arabic message from a conversation:\n"${fullArabicReply}"\n\nProvide:\n1. One useful key phrase from the message with its English meaning\n2. Whether this feels like a conversation ending (true/false)\n\nRespond in JSON: {"keyPhrase":{"arabic":"...","english":"..."},"isEnding":false}` }],
                                }],
                                generationConfig: { temperature: 0.1, maxOutputTokens: 300, responseMimeType: "application/json" },
                            }, "gemini-2.5-flash-lite"),

                            // TTS generation (in parallel)
                            (async () => {
                                const voicePool = [
                                    "ar-XA-Chirp3-HD-Puck", "ar-XA-Chirp3-HD-Aoede",
                                    "ar-XA-Chirp3-HD-Charon", "ar-XA-Chirp3-HD-Kore",
                                    "ar-XA-Chirp3-HD-Fenrir", "ar-XA-Chirp3-HD-Leda",
                                ];
                                const voice = reqBody.voice || voicePool[Math.floor(Math.random() * voicePool.length)];
                                const ttsRes = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
                                    method: "POST",
                                    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        input: { text: fullArabicReply },
                                        voice: { languageCode: "ar-XA", name: voice },
                                        audioConfig: { audioEncoding: "MP3" },
                                    }),
                                });
                                if (!ttsRes.ok) return null;
                                const ttsData = await ttsRes.json();
                                return ttsData.audioContent || null;
                            })(),
                        ]);

                        // Extract metadata
                        let keyPhrase = null, isEnding = false;
                        if (metaResult.status === "fulfilled") {
                            try {
                                const metaText = extractResponseText(metaResult.value);
                                const meta = JSON.parse(cleanJson(metaText));
                                keyPhrase = meta.keyPhrase || null;
                                isEnding = meta.isEnding || false;
                            } catch (e) {
                                console.error("[reply-stream] Metadata parse error:", e);
                            }
                        }

                        // Extract TTS audio
                        let ttsAudio = null;
                        if (ttsResult.status === "fulfilled" && ttsResult.value) {
                            ttsAudio = ttsResult.value;
                        }

                        // Send final done event
                        sendEvent({
                            type: "done",
                            message: fullArabicReply,
                            isEnding,
                            keyPhrase,
                            audioBase64: ttsAudio,
                            emptyTranscript: false,
                        });

                    } catch (err: any) {
                        console.error("[reply-stream] Error:", err);
                        try { sendEvent({ type: "error", message: err.message || "Something went wrong" }); } catch {}
                    } finally {
                        try { controller.close(); } catch {}
                    }
                },
            });

            return new Response(stream, { headers: sseHeaders });
        }

        // Action: help — on-demand detailed help for the current conversation point
        if (action === "help") {
            const scenario = getTodayScenario();
            const { token, projectId } = await getAccessToken();
            const lastAiMessage = reqBody.lastAiMessage || "";
            const diff = reqBody.difficulty || "intermediate";
            const history = conversationHistory || [];

            // Build a brief conversation summary for context
            const recentTurns = history.slice(-4).map((m: any) => 
                `${m.role === 'ai' ? 'Waiter/Character' : 'Student'}: ${m.text}`
            ).join("\n");

            const helpSystemInstruction = `You are a friendly, encouraging Arabic tutor helping a student practice a conversation.

The student is in a "${scenario.title}" scenario (${scenario.setting}).
Difficulty: ${diff}.

Your job:
1. Briefly explain what the character just said (1 sentence, plain English — do NOT give a full translation, just the gist)
2. Tell the student what they should say next — give them a SPECIFIC Arabic phrase or sentence they can use, with FULL tashkeel (diacritics)
3. Provide the English translation of that phrase

${diff === 'easy' ? 'Keep the suggested phrase VERY simple — 2-5 words max. Use basic vocabulary only.' : diff === 'advanced' ? 'The suggested phrase should be a natural, full Arabic sentence.' : 'Keep the suggested phrase moderate — a short, natural sentence of 4-8 words.'}

Respond ONLY with valid JSON:
{
  "explanation": "<1 sentence: what the character said and what the student should do>",
  "suggestedResponse": "<Arabic phrase with full tashkeel>",
  "suggestedResponseTranslation": "<English translation>"
}`;

            const helpUserPrompt = recentTurns
                ? `Here is the recent conversation:\n${recentTurns}\n\nThe character's latest message:\n"${lastAiMessage}"\n\nWhat should the student say next?`
                : `The character just said:\n"${lastAiMessage}"\n\nWhat should the student say next?`;

            const helpData = await callVertexAI(projectId, token, {
                systemInstruction: { parts: [{ text: helpSystemInstruction }] },
                contents: [{ role: "user", parts: [{ text: helpUserPrompt }] }],
                generationConfig: { temperature: 0.5, maxOutputTokens: 400, responseMimeType: "application/json" },
            }, "gemini-2.5-flash-lite");

            const helpText = extractResponseText(helpData);
            if (!helpText) throw new Error("No help response");

            const parsed = JSON.parse(cleanJson(helpText));
            return new Response(JSON.stringify(parsed), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Action: generate-tts (with server-side cache + persistent DB cache)
        if (action === "generate-tts") {
            const textToSpeak = reqBody.text || "مرحباً";
            // Optional writeback: persists the generated audio directly onto a
            // domain row (e.g. word_of_the_day) so subsequent reads of that row
            // include the audio in the same query — no extra edge round trip.
            // Only whitelisted tables allowed.
            const WRITEBACK_WHITELIST = new Set([
                "word_of_the_day",
                "word_of_the_day_examples",
            ]);
            const writeback = reqBody.writeback as { table?: string; id?: string | number } | undefined;
            const writebackValid = !!(
                writeback &&
                writeback.table &&
                writeback.id != null &&
                WRITEBACK_WHITELIST.has(writeback.table)
            );

            const adminSb = createClient(
                Deno.env.get("SUPABASE_URL")!,
                Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
            );

            const persistWriteback = async (audioBase64: string) => {
                if (!writebackValid) return;
                const { error: wbErr } = await adminSb
                    .from(writeback!.table!)
                    .update({ audio_base64: audioBase64 })
                    .eq("id", writeback!.id!);
                if (wbErr) {
                    console.error(`writeback to ${writeback!.table} failed:`, wbErr);
                }
            };

            // L1: Check in-memory cache first (fastest, survives warm instance)
            const memCached = getTtsCached(textToSpeak);
            if (memCached) {
                // Even on a memory hit, make sure writeback happens so the row
                // gets populated for future cross-device reads.
                await persistWriteback(memCached);
                return new Response(JSON.stringify({ audioBase64: memCached }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            // L2: Check persistent Supabase DB cache (shared across all users)
            const textHash = await hashText(textToSpeak);
            const { data: dbCached } = await adminSb
                .from("tts_cache")
                .select("audio_base64, created_at")
                .eq("text_hash", textHash)
                .single();

            if (dbCached) {
                const age = Date.now() - new Date(dbCached.created_at).getTime();
                if (age < 24 * 60 * 60 * 1000) {
                    // Still fresh — populate in-memory cache and return
                    setTtsCached(textToSpeak, dbCached.audio_base64);
                    await persistWriteback(dbCached.audio_base64);
                    return new Response(JSON.stringify({ audioBase64: dbCached.audio_base64 }), {
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                } else {
                    // Expired — delete stale entry
                    await adminSb.from("tts_cache").delete().eq("text_hash", textHash);
                }
            }

            // Cache miss — generate from Google TTS
            const { token } = await getAccessToken();
            const voicePool = [
                "ar-XA-Chirp3-HD-Puck",
                "ar-XA-Chirp3-HD-Aoede",
                "ar-XA-Chirp3-HD-Charon",
                "ar-XA-Chirp3-HD-Kore",
                "ar-XA-Chirp3-HD-Fenrir",
                "ar-XA-Chirp3-HD-Leda",
            ];
            const voice = reqBody.voice || voicePool[Math.floor(Math.random() * voicePool.length)];

            const ttsRes = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    input: { text: textToSpeak },
                    voice: { languageCode: "ar-XA", name: voice },
                    audioConfig: { audioEncoding: "MP3" }
                })
            });

            if (!ttsRes.ok) {
                const errData = await ttsRes.text();
                return new Response(JSON.stringify({ error: errData }), { status: 500, headers: corsHeaders });
            }

            const ttsData = await ttsRes.json();
            const audio = ttsData.audioContent;

            if (audio) {
                // Populate in-memory cache
                setTtsCached(textToSpeak, audio);

                // Persist to DB — MUST await, otherwise the edge worker
                // terminates on response and cancels the pending promise.
                const { error: upsertErr } = await adminSb.from("tts_cache").upsert({
                    text_hash: textHash,
                    arabic_text: textToSpeak,
                    audio_base64: audio,
                    created_at: new Date().toISOString(),
                }, { onConflict: "text_hash" });
                if (upsertErr) {
                    console.error("tts_cache upsert failed:", upsertErr);
                }

                // Writeback onto the domain row so future readers get it inline
                await persistWriteback(audio);
            }

            return new Response(JSON.stringify({ audioBase64: audio }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Action: list-voices
        if (action === "list-voices") {
            const { token } = await getAccessToken();
            const voicesRes = await fetch("https://texttospeech.googleapis.com/v1/voices?languageCode=ar", {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await voicesRes.json();
            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Action: translate — on-demand translation of Arabic text
        if (action === "translate") {
            const { token, projectId } = await getAccessToken();
            const textToTranslate = reqBody.text || "";
            if (!textToTranslate.trim()) {
                return new Response(JSON.stringify({ translation: "" }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }

            const transData = await callVertexAI(projectId, token, {
                contents: [{
                    role: "user",
                    parts: [{ text: `Translate this Arabic text to English. Return ONLY the English translation, nothing else:\n"${textToTranslate}"` }],
                }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 300 },
            }, "gemini-2.5-flash-lite");

            const translation = extractResponseText(transData) || "";
            return new Response(JSON.stringify({ translation: translation.replace(/^["']|["']$/g, '').trim() }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ error: "Unknown action" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (error: any) {
        console.error("Global Error:", error);
        return new Response(JSON.stringify({ error: error.message, stack: error.stack, name: error.name }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});

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
