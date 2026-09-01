import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export interface WeeklyDigestCustomer {
  name: string
  score: number
  riskLabel: string
  topMetric: string | null
  action: string
  /** e.g. "73% probability of churning in the next 90 days" */
  churnProbability: number
  confidenceLabel: string
}

export interface WeeklyDigestEmailProps {
  headline: string
  needsAttention: number
  criticalCount: number
  atRiskCount: number
  movedCount: number
  declinedCount: number
  improvedCount: number
  customers: WeeklyDigestCustomer[]
  todayUrl: string
}

const LOGO_URL = 'https://chai-retention-ai.lovable.app/logo-dark.png'

export const WeeklyDigestEmail = ({
  headline,
  needsAttention,
  criticalCount,
  atRiskCount,
  movedCount,
  declinedCount,
  improvedCount,
  customers,
  todayUrl,
}: WeeklyDigestEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{headline}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt="ChAi logo" width={120} style={logo} />
        <Heading style={h1}>Your Monday brief</Heading>
        <Text style={lead}>{headline}</Text>

        <Section style={summary}>
          <Text style={summaryLine}>
            <strong>{needsAttention}</strong> customers need attention ({criticalCount} critical,{' '}
            {atRiskCount} at risk)
          </Text>
          <Text style={summaryLine}>
            <strong>{movedCount}</strong> health scores changed significantly ({declinedCount} down,{' '}
            {improvedCount} up)
          </Text>
        </Section>

        <Hr style={hr} />

        <Heading as="h2" style={h2}>
          Do these first
        </Heading>

        {customers.length === 0 ? (
          <Text style={text}>
            Nothing needs chasing this week — every scored customer is in healthy territory.
          </Text>
        ) : (
          customers.map((customer, index) => (
            <Section key={`${customer.name}-${index}`} style={card}>
              <Text style={cardTitle}>
                {index + 1}. {customer.name} — {customer.score}/100 · {customer.riskLabel}
              </Text>
              <Text style={cardMeta}>
                {customer.churnProbability}% probability of churning in the next 90 days ·{' '}
                {customer.confidenceLabel}
              </Text>
              {customer.topMetric ? (
                <Text style={cardMeta}>Driving the risk: {customer.topMetric}</Text>
              ) : null}
              <Text style={text}>{customer.action}</Text>
            </Section>
          ))
        )}

        <Button style={button} href={todayUrl}>
          Open ChAi
        </Button>

        <Text style={footer}>
          You're receiving this because you own a ChAi workspace. Reply to this email if you'd
          rather not get the Monday brief.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default WeeklyDigestEmail

const main: React.CSSProperties = {
  backgroundColor: '#0f1115',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  padding: '32px 0',
}

const container: React.CSSProperties = {
  backgroundColor: '#171a21',
  borderRadius: '14px',
  margin: '0 auto',
  maxWidth: '560px',
  padding: '32px',
}

const logo: React.CSSProperties = { marginBottom: '24px' }

const h1: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '24px',
  fontWeight: 600,
  margin: '0 0 12px',
}

const h2: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 600,
  margin: '0 0 12px',
}

const lead: React.CSSProperties = {
  color: '#d6dae2',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0 0 20px',
}

const summary: React.CSSProperties = {
  backgroundColor: '#1f232c',
  borderRadius: '10px',
  padding: '16px',
}

const summaryLine: React.CSSProperties = {
  color: '#d6dae2',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0 0 4px',
}

const hr: React.CSSProperties = { borderColor: '#2a2f3a', margin: '24px 0' }

const card: React.CSSProperties = {
  backgroundColor: '#1f232c',
  borderRadius: '10px',
  marginBottom: '12px',
  padding: '14px 16px',
}

const cardTitle: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 600,
  margin: '0 0 4px',
}

const cardMeta: React.CSSProperties = {
  color: '#9aa2b1',
  fontSize: '13px',
  margin: '0 0 6px',
}

const text: React.CSSProperties = {
  color: '#d6dae2',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
}

const button: React.CSSProperties = {
  backgroundColor: '#6d5efc',
  borderRadius: '8px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '15px',
  fontWeight: 600,
  margin: '24px 0 8px',
  padding: '12px 24px',
  textDecoration: 'none',
}

const footer: React.CSSProperties = {
  color: '#7d8493',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '16px 0 0',
}
