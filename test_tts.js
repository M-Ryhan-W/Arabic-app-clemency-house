import fs from "fs";

const envText = fs.readFileSync("/Users/mohammedryhanwadood/language-app/.env.local", "utf8");
const supabaseUrl = envText.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const supabaseAnonKey = envText.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

async function test() {
    const res = await fetch(`${supabaseUrl}/functions/v1/scenario-chat`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseAnonKey}`
        },
        body: JSON.stringify({ action: "list-voices" })
    });

    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Voices:", data.voices?.map(v => v.name));
}
test();
