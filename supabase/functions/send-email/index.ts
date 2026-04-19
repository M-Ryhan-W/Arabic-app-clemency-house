import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FROM = "Ihya Arabic <noreply@mail.ihyaarabicapp.com>";
const REPLY_TO = "ihyaarabic1@gmail.com";

function welcomeTemplate(data: { email: string }) {
  const subject = "Welcome to Ihya Arabic";
  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#0D1B2A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#E6E6E6;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0D1B2A;padding:40px 20px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#142438;border-radius:16px;overflow:hidden;border:1px solid rgba(224,159,62,0.15);">
            <tr>
              <td style="padding:40px 40px 24px;text-align:center;">
                <div style="font-size:22px;font-weight:700;color:#E09F3E;letter-spacing:0.5px;">Ihya Arabic</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 32px;">
                <h1 style="font-size:24px;font-weight:700;color:#fff;margin:0 0 16px;line-height:1.3;">Welcome aboard</h1>
                <p style="font-size:15px;line-height:1.6;color:rgba(230,230,230,0.8);margin:0 0 16px;">
                  Your account has been created. You're ready to discover the soul of Arabic — master pronunciation, script, and heritage at your own pace.
                </p>
                <p style="font-size:15px;line-height:1.6;color:rgba(230,230,230,0.8);margin:0 0 24px;">
                  Open the app and start your first lesson whenever you're ready.
                </p>
                <div style="border-top:1px solid rgba(224,159,62,0.15);padding-top:20px;margin-top:8px;">
                  <p style="font-size:13px;line-height:1.6;color:rgba(230,230,230,0.5);margin:0;">
                    Questions or feedback? Just reply to this email.
                  </p>
                </div>
              </td>
            </tr>
          </table>
          <p style="font-size:11px;color:rgba(230,230,230,0.35);margin:24px 0 0;">© Ihya Arabic</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  const text = `Welcome to Ihya Arabic\n\nYour account has been created. You're ready to discover the soul of Arabic — master pronunciation, script, and heritage at your own pace.\n\nOpen the app and start your first lesson whenever you're ready.\n\nQuestions or feedback? Just reply to this email.`;
  return { subject, html, text };
}

function buildTemplate(type: string, data: any) {
  switch (type) {
    case "welcome":
      return welcomeTemplate(data);
    default:
      throw new Error(`Unknown email type: ${type}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { type, to, data } = body ?? {};

    if (!type || !to) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: type, to" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { subject, html, text } = buildTemplate(type, data ?? {});

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        reply_to: REPLY_TO,
        subject,
        html,
        text,
      }),
    });

    const resendJson = await resendRes.json();

    if (!resendRes.ok) {
      console.error("Resend error:", resendJson);
      return new Response(
        JSON.stringify({ error: "Resend failed", details: resendJson }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, id: resendJson.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("send-email error:", e);
    return new Response(
      JSON.stringify({ error: String(e?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
