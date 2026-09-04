import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Text,
} from '@react-email/components'

interface SeatLockWarningEmailProps {
  organisationName: string
  planLabel: string
  effectiveDate: string
  affected: Array<{ name: string; email: string; roleLabel: string }>
  billingUrl: string
}

const LOGO_URL = 'https://chai-retention-ai.lovable.app/logo-dark.png'

export const SeatLockWarningEmail = ({
  organisationName,
  planLabel,
  effectiveDate,
  affected,
  billingUrl,
}: SeatLockWarningEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Seats that will be locked when your plan changes</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt="ChAi logo" width={120} style={logo} />
        <Heading style={h1}>Your plan change is a week away</Heading>
        <Text style={text}>
          On <strong>{effectiveDate}</strong>, {organisationName} moves to the{' '}
          <strong>{planLabel}</strong> plan. These team members will lose their seat:
        </Text>
        {affected.map((person) => (
          <Text key={person.email} style={row}>
            {person.name || person.email} — {person.roleLabel}
          </Text>
        ))}
        <Text style={text}>
          If you'd rather keep everyone, you can stay on your current plan or move up
          before that date.
        </Text>
        <Button style={button} href={billingUrl}>
          Review your plan
        </Button>
      </Container>
    </Body>
  </Html>
)

export default SeatLockWarningEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '32px 24px' }
const logo = { margin: '0 0 28px' }
const h1 = { fontSize: '22px', fontWeight: 700, color: '#0E141C', margin: '0 0 16px' }
const text = { fontSize: '15px', lineHeight: '24px', color: '#33404F', margin: '0 0 16px' }
const row = { fontSize: '15px', lineHeight: '22px', color: '#0E141C', margin: '0 0 6px' }
const button = {
  backgroundColor: '#0E141C',
  borderRadius: '10px',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 600,
  padding: '12px 20px',
  textDecoration: 'none',
  display: 'inline-block',
}
