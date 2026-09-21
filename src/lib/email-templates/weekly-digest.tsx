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
import { BrandFooter } from './brand-footer'

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

const LOGO_URL = 'https://app.askchai.tech/logo-dark.png'

// ChAi brand palette
const NAVY = '#152238'
const BODY_TEXT = '#1E3040'
const MUTED_TEXT = '#5A7080'
const MORNING_MIST = '#F7F9E1'
const TEAL_SURFACE = '#E2EDF0'
const CARD_SURFACE = '#F0F7F9'
const TEAL = '#204654'
const SPRING_MEADOW = '#CAFFA6'
const CRITICAL_RED = '#B6423F'

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
        {/* Navy header bar keeps the logo visible in every client */}
        <Section style={headerBar}>
          <Img src={LOGO_URL} alt="ChAi logo" width={100} style={logo} />
        </Section>

        <Section style={content}>
          <Heading style={h1}>Your Monday brief</Heading>
          <Text style={lead}>{headline}</Text>

          <Section style={summary}>
            <Text style={summaryLine}>
              <strong>{needsAttention}</strong> customers need attention ({criticalCount} critical,{' '}
              {atRiskCount} at risk)
            </Text>
            <Text style={summaryLine}>
              <strong>{movedCount}</strong> health scores changed significantly ({declinedCount}{' '}
              down, {improvedCount} up)
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
                <Text
                  style={{
                    ...cardTitle,
                    ...(customer.churnProbability > 60 ? { color: CRITICAL_RED } : {}),
                  }}
                >
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
          <BrandFooter />
        </Section>
      </Container>
    </Body>
  </Html>
)

export default WeeklyDigestEmail

const main: React.CSSProperties = {
  backgroundColor: MORNING_MIST,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  padding: '32px 0',
}

const container: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '14px',
  margin: '0 auto',
  maxWidth: '560px',
  padding: '0',
}

const headerBar: React.CSSProperties = {
  backgroundColor: NAVY,
  borderRadius: '14px 14px 0 0',
  padding: '20px 32px',
}

const logo: React.CSSProperties = { display: 'block' }

const content: React.CSSProperties = {
  padding: '28px 32px 32px',
}

const h1: React.CSSProperties = {
  color: NAVY,
  fontSize: '24px',
  fontWeight: 600,
  margin: '0 0 12px',
}

const h2: React.CSSProperties = {
  color: NAVY,
  fontSize: '16px',
  fontWeight: 600,
  margin: '0 0 12px',
}

const lead: React.CSSProperties = {
  color: BODY_TEXT,
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0 0 20px',
}

const summary: React.CSSProperties = {
  backgroundColor: TEAL_SURFACE,
  borderRadius: '10px',
  padding: '16px',
}

const summaryLine: React.CSSProperties = {
  color: BODY_TEXT,
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0 0 4px',
}

const hr: React.CSSProperties = { borderColor: TEAL_SURFACE, margin: '24px 0' }

const card: React.CSSProperties = {
  backgroundColor: CARD_SURFACE,
  borderLeft: `3px solid ${TEAL}`,
  borderRadius: '8px',
  marginBottom: '12px',
  padding: '14px 16px',
}

const cardTitle: React.CSSProperties = {
  color: NAVY,
  fontSize: '15px',
  fontWeight: 600,
  margin: '0 0 4px',
}

const cardMeta: React.CSSProperties = {
  color: MUTED_TEXT,
  fontSize: '13px',
  margin: '0 0 6px',
}

const text: React.CSSProperties = {
  color: BODY_TEXT,
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
}

const button: React.CSSProperties = {
  backgroundColor: SPRING_MEADOW,
  borderRadius: '8px',
  color: NAVY,
  display: 'inline-block',
  fontSize: '15px',
  fontWeight: 600,
  margin: '24px 0 8px',
  padding: '12px 24px',
  textDecoration: 'none',
}

const footer: React.CSSProperties = {
  color: MUTED_TEXT,
  fontSize: '12px',
  lineHeight: '18px',
  margin: '16px 0 0',
}
