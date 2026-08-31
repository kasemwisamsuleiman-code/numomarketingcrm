import { createFileRoute } from "@tanstack/react-router";

function page(title: string, message: string) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title></head><body style="font-family:Helvetica,Arial,sans-serif;background:#f6f1e8;color:#1c1a17;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0"><div style="max-width:420px;padding:32px;background:#fff;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.08)"><h1 style="font-size:20px;margin:0 0 12px">${title}</h1><p style="margin:0;line-height:1.6;color:#5d574f">${message}</p></div></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

/**
 * Public unsubscribe endpoint. The token is HMAC-signed server-side and binds
 * one recipient to one workspace, so no data is exposed and nothing can be
 * suppressed on someone else's behalf.
 */
export const Route = createFileRoute("/api/public/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("t") ?? "";
        const { readUnsubscribeToken } = await import("@/lib/email.server");
        const parsed = token ? await readUnsubscribeToken(token) : null;
        if (!parsed) return page("Link not valid", "This unsubscribe link is invalid or has expired.");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("email_suppressions")
          .insert({ user_id: parsed.userId, email: parsed.email, reason: "UNSUBSCRIBE" });
        await supabaseAdmin
          .from("leads")
          .update({ stop_outreach: true, outreach_status: "STOPPED", next_follow_up_at: null })
          .eq("user_id", parsed.userId)
          .ilike("email", parsed.email);
        await supabaseAdmin.from("automation_logs").insert({
          user_id: parsed.userId,
          lead_id: null,
          lead_name: parsed.email,
          action: "UNSUBSCRIBED",
          channel: "EMAIL",
          result: "SUCCESS",
          detail: "Recipient unsubscribed via email link",
        });

        return page("You're unsubscribed", `${parsed.email} will not receive any further emails from us.`);
      },
    },
  },
});
