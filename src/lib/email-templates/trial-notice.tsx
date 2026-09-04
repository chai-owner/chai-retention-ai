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

interface TrialNoticeEmailProps {
  headline: string
  message: string
  organisationName: string
  upgradeUrl: string
}

const LOGO_URL = 'https://chai-retention-ai.lovable.app/logo-dark.png'

export const TrialNoticeEmail = ({
  headline,
  message,
  organisationName,
  upgradeUrl,
}: TrialNoticeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{headline}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt="ChAi logo" width={120} style={logo} />
        <Heading style={h1}>{headline}</Heading>
        <Text style={text}>
          Hi there — this is about <strong>{organisationName}</strong> on ChAi.
        </Text>
        <Text style={text}>{message}</Text>
        <Button style={button} href={upgradeUrl}>
          Choose a plan
        </Button>
        <Text style={footer}>
          Your data is safe either way — nothing is deleted when a trial ends.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default TrialNoticeEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '32px 24px' }
const logo = { margin: '0 0 28px' }
const h1 = { fontSize: '22px', fontWeight: 700, color: '#0E141C', margin: '0 0 16px' }
const text = { fontSize: '15px', lineHeight: '24px', color: '#33404F', margin: '0 0 16px' }
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
const footer = { fontSize: '13px', lineHeight: '20px', color: '#6B7787', margin: '24px 0 0' }
