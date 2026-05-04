import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const REPORT_TO = "ryhan1998@gmail.com";
const FROM = "Ihya Arabic <noreply@mail.ihyaarabicapp.com>";
const MAX_BODY_CHARS = 4000;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawMessage: string = (body?.message ?? "").toString();
    const message = rawMessage.trim();

    if (!message) {
      return new Response(
        JSON.stringify({ error: "Please describe the problem before submitting." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (message.length > MAX_BODY_CHARS) {
      return new Response(
        JSON.stringify({ error: `Message is too long (max ${MAX_BODY_CHARS} characters).` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- Atomic rate limit ----
    // Insert the report row first. The DB trigger enforces 5/day per user,
    // so racing requests can't slip past the limit. Only if the insert
    // succeeds do we proceed to send the email.
    const { data: inserted, error: insertErr } = await supabase
      .from("problem_reports")
      .insert({ user_id: user.id, message })
      .select("id")
      .single();

    if (insertErr) {
      const errMsg = insertErr.message || "";
      if (/daily_problem_report_limit_reached/i.test(errMsg)) {
        const cleaned = errMsg.replace(/^.*daily_problem_report_limit_reached:\s*/i, "").trim();
        return new Response(
          JSON.stringify({
            error: "daily_limit",
            message: cleaned || "You've reached your daily report limit. Please try again tomorrow.",
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error("problem_reports insert error:", insertErr);
      return new Response(
        JSON.stringify({ error: "Could not record your report. Please try again later." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- Look up the user's display name (best-effort) ----
    let displayName = "";
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      displayName = profile?.display_name ?? "";
    } catch (_e) {
      // best-effort only
    }

    // ---- Send the email ----
    const userEmail = user.email ?? "(no email on file)";
    const subject = `[Ihya Arabic] Problem report from ${displayName || userEmail}`;
    const messageHtml = escapeHtml(message).replace(/\n/g, "<br>");
    const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#0D1B2A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#E6E6E6;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0D1B2A;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#142438;border-radius:16px;overflow:hidden;border:1px solid rgba(224,159,62,0.15);">
          <tr><td style="padding:28px 32px 8px;">
            <div style="font-size:13px;font-weight:700;color:#E09F3E;letter-spacing:0.5px;text-transform:uppercase;">Problem Report</div>
            <h1 style="font-size:20px;font-weight:700;color:#fff;margin:8px 0 0;">From ${escapeHtml(displayName || userEmail)}</h1>
          </td></tr>
          <tr><td style="padding:8px 32px 24px;">
            <p style="font-size:13px;color:rgba(230,230,230,0.6);margin:0 0 4px;"><strong style="color:#fff;">User:</strong> ${escapeHtml(displayName || "(no display name)")}</p>
            <p style="font-size:13px;color:rgba(230,230,230,0.6);margin:0 0 4px;"><strong style="color:#fff;">Email:</strong> ${escapeHtml(userEmail)}</p>
            <p style="font-size:13px;color:rgba(230,230,230,0.6);margin:0 0 4px;"><strong style="color:#fff;">User ID:</strong> ${escapeHtml(user.id)}</p>
            <p style="font-size:13px;color:rgba(230,230,230,0.6);margin:0 0 16px;"><strong style="color:#fff;">Report ID:</strong> ${escapeHtml(inserted?.id ?? "")}</p>
            <div style="border-top:1px solid rgba(224,159,62,0.15);padding-top:16px;">
              <p style="font-size:12px;font-weight:700;color:#E09F3E;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Message</p>
              <div style="font-size:14px;line-height:1.6;color:rgba(230,230,230,0.9);white-space:pre-wrap;">${messageHtml}</div>
            </div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
    const text = `Problem report from ${displayName || userEmail}\n\nUser: ${displayName || "(no display name)"}\nEmail: ${userEmail}\nUser ID: ${user.id}\nReport ID: ${inserted?.id ?? ""}\n\n---\n${message}`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [REPORT_TO],
        reply_to: user.email || undefined,
        subject,
        html,
        text,
      }),
    });

    const resendJson = await resendRes.json().catch(() => ({}));

    if (!resendRes.ok) {
      console.error("Resend error:", resendJson);
      return new Response(
        JSON.stringify({ error: "Could not send your report. Please try again later." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, id: inserted?.id ?? null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("report-problem error:", e);
    return new Response(
      JSON.stringify({ error: "Unexpected error. Please try again later." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
