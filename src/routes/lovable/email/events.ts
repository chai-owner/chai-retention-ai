import { createEmailWebhookHandler } from '@lovable.dev/email-js'
import { createFileRoute } from '@tanstack/react-router'

type SuppressionReason = 'bounce' | 'complaint' | 'unsubscribe'
type LogStatus = 'bounced' | 'complained' | 'suppressed'

async function recordSuppression(
  event: any,
  reason: SuppressionReason,
  logStatus: LogStatus,
  description: string
): Promise<void> {
  const recipient = String(event?.data?.recipient ?? '').toLowerCase()
  if (!recipient) return

  const { getSupabaseAdmin } = await import('@/integrations/supabase/client.server')
  const admin = await getSupabaseAdmin()

  const { error: suppressionError } = await admin
    .from('suppressed_emails')
    .upsert({ email: recipient, reason, metadata: event?.data?.metadata ?? null }, { onConflict: 'email' })
  if (suppressionError) {
    console.error('Failed to record suppression', {
      event_id: event.event_id,
      error: { code: suppressionError.code, message: suppressionError.message },
    })
    throw new Error('Failed to record suppression')
  }

  const { error: logError } = await admin.from('email_send_log').insert({
    message_id: crypto.randomUUID(),
    template_name: 'system',
    recipient_email: recipient,
    status: logStatus,
    error_message: description,
  })
  if (logError) {
    console.error('Failed to record email event', {
      event_id: event.event_id,
      error: { code: logError.code, message: logError.message },
    })
    throw new Error('Failed to record email event')
  }
}

export const Route = createFileRoute("/lovable/email/events")({
  server: {
    handlers: {
      POST: ({ request }) => {
        const apiKey = process.env['LOVABLE_API_KEY']
        if (!apiKey) {
          console.error('Missing required environment variables')
          return Response.json({ error: 'Server configuration error' }, { status: 500 })
        }
        const handler = createEmailWebhookHandler({
          apiKey,
          on: {
            'email.bounced': async (event) => {
              await recordSuppression(event, 'bounce', 'bounced', 'Recipient address bounced')
            },
            'email.complaint': async (event) => {
              await recordSuppression(event, 'complaint', 'complained', 'Recipient marked the email as spam')
            },
            'email.unsubscribed': async (event) => {
              await recordSuppression(event, 'unsubscribe', 'suppressed', 'Recipient unsubscribed')
            },
          },
        })
        return handler(request)
      },
    },
  },
})
