// Reworked from src/lib/transactional-email.server.ts to send through
// Resend instead of Lovable's managed email API (@lovable.dev/email-js +
// LOVABLE_API_KEY, which no longer exists post-migration). Render/idempotency/
// logging behaviour is otherwise unchanged.
//
// Needs two secrets set on this project (`supabase secrets set ...`):
//   RESEND_API_KEY    - from your Resend account
//   RESEND_FROM_EMAIL - the verified "from" address, e.g. "ChAi <support@askchai.tech>"
// If RESEND_FROM_EMAIL isn't set, falls back to the same address the
// original code used: "ChAi <support@askchai.tech>".
import * as React from "npm:react@19";

const SITE_NAME = "ChAi";
const FROM_DOMAIN = "askchai.tech";
const DEFAULT_FROM = `${SITE_NAME} <support@${FROM_DOMAIN}>`;
const RESEND_SEND_URL = "https://api.resend.com/emails";

// deno-lint-ignore no-explicit-any
type AdminClient = any;

export interface QueueEmailInput {
  to: string;
  subject: string;
  template: string;
  element: React.ReactElement;
  idempotencyKey?: string;
}

async function logSend(
  admin: AdminClient,
  row: {
    template_name: string;
    recipient_email: string;
    status: string;
    error_message?: string;
  },
): Promise<void> {
  const { error } = await admin.from("email_send_log").insert({
    message_id: crypto.randomUUID(),
    ...row,
  });
  if (error) {
    console.error("Failed to record email send log row", {
      template: row.template_name,
      status: row.status,
      error,
    });
  }
}

export async function queueTransactionalEmail(
  admin: AdminClient,
  { to, subject, template, element, idempotencyKey }: QueueEmailInput,
): Promise<boolean> {
  if (!to) return false;

  let html: string;
  let text: string;
  try {
    const { render } = await import("npm:@react-email/render@2");
    html = await render(element);
    text = await render(element, { plainText: true });
  } catch (error) {
    console.error(`Failed to render ${template} email`, error);
    return false;
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.error(`Cannot send ${template} email: RESEND_API_KEY is not configured`);
    await logSend(admin, {
      template_name: template,
      recipient_email: to,
      status: "failed",
      error_message: "RESEND_API_KEY is not configured",
    });
    return false;
  }

  const from = Deno.env.get("RESEND_FROM_EMAIL") || DEFAULT_FROM;

  try {
    const res = await fetch(RESEND_SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({ from, to, subject, html, text }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend ${res.status}: ${body.slice(0, 500)}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to send ${template} email`, error);
    await logSend(admin, {
      template_name: template,
      recipient_email: to,
      status: "failed",
      error_message: message.slice(0, 1000),
    });
    return false;
  }

  await logSend(admin, {
    template_name: template,
    recipient_email: to,
    status: "sent",
  });
  return true;
}
