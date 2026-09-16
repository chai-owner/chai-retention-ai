// Shared sender for ChAi app emails (invites, trial notices, seat-locking
// warnings, the Monday digest and billing notices). Sends synchronously
// through Lovable's managed email delivery and records the outcome in
// email_send_log.
import * as React from "react";

const SITE_NAME = "ChAi";
const SENDER_DOMAIN = "notify.askchai.tech";
const FROM_DOMAIN = "askchai.tech";

// Loosely typed on purpose: this helper is shared by cron routes and server
// functions, which hold differently-typed Supabase clients.
type AdminClient = any;

export interface QueueEmailInput {
  to: string;
  subject: string;
  template: string;
  element: React.ReactElement;
  /** Dedupes retries of the same logical send. */
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

/** Renders and sends one app email. Never throws. */
export async function queueTransactionalEmail(
  admin: AdminClient,
  { to, subject, template, element, idempotencyKey }: QueueEmailInput,
): Promise<boolean> {
  if (!to) return false;

  let html: string;
  let text: string;
  try {
    const { render } = await import("@react-email/render");
    html = await render(element);
    text = await render(element, { plainText: true });
  } catch (error) {
    console.error(`Failed to render ${template} email`, error);
    return false;
  }

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    console.error(`Cannot send ${template} email: LOVABLE_API_KEY is not configured`);
    await logSend(admin, {
      template_name: template,
      recipient_email: to,
      status: "failed",
      error_message: "LOVABLE_API_KEY is not configured",
    });
    return false;
  }

  try {
    const { sendLovableEmail } = await import("@lovable.dev/email-js");
    await sendLovableEmail(
      {
        to,
        from: `${SITE_NAME} <support@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: "transactional",
        label: template,
        idempotency_key: idempotencyKey || crypto.randomUUID(),
      },
      { apiKey, sendUrl: process.env["LOVABLE_SEND_URL"] },
    );
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "recipient_suppressed") {
      await logSend(admin, {
        template_name: template,
        recipient_email: to,
        status: "suppressed",
      });
      return false;
    }
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
