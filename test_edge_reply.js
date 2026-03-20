import fs from "fs";

const envText = fs.readFileSync("/Users/mohammedryhanwadood/language-app/.env.local", "utf8");
const projectId = envText.match(/VITE_SUPABASE_PROJECT_ID=(.*)/)?.[1]?.trim() || "efpanaidmaztxszshlmp";
const supabaseUrl = envText.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const supabaseAnonKey = envText.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

async function test() {
    const res = await fetch(`${supabaseUrl}/functions/v1/scenario-chat`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseAnonKey}`
        },
        body: JSON.stringify({ 
            action: "start",
            difficulty: "beginner"
        })
    });

    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Body:", text);
}
test();
