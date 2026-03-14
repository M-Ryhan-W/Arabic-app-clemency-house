import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const envVars = fs.readFileSync(".env.local", "utf8").split('\n').reduce((acc, line) => {
    if (line.includes('=')) {
        const parts = line.split('=');
        acc[parts[0]] = parts[1].replace(/["']/g, '').trim();
    }
    return acc;
}, {});

const supabase = createClient(envVars.VITE_SUPABASE_URL, envVars.VITE_SUPABASE_ANON_KEY);
const sql = fs.readFileSync("user_daily_stats.sql").toString();

async function run() {
    console.log("Running SQL...");
    const result = await supabase.rpc("exec_sql", { query: sql });
    console.log(result);
}
run();
