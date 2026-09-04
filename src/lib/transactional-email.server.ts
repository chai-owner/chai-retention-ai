// Small wrapper around the existing transactional email queue so trial,
// downgrade and seat-locking notices are sent exactly like invites are.
import * as React from "react";

const SITE_NAME = "chai-retention-ai";
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
}

/** Renders and queues one transactional email. Never throws. */
export async function queueTransactionalEmail(
  admin: AdminClient,
  { to, subject, template, element }: QueueEmailInput,
): Promise<boolean> {
  try {
    if (!to) return false;
    const { render } = await import("@react-email/render");
    const html = await render(element);
    const text = await render(element, { plainText: true });
    const messageId = crypto.randomUUID();

    await admin.from("email_send_log").insert({
      message_id: messageId,
      template_name: template,
      recipient_email: to,
      status: "pending",
    });

    const { error } = await admin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: "transactional",
        label: template,
        queued_at: new Date().toISOString(),
      },
    });
    return !error;
  } catch (error) {
    console.error(`Failed to queue ${template} email`, error);
    return false;
  }
}
