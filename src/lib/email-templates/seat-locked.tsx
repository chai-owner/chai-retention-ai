import * as React from 'react'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Text,
} from '@react-email/components'

interface SeatLockedEmailProps {
  organisationName: string
  ownerEmail?: string
}

const LOGO_URL = 'https://chai-retention-ai.lovable.app/logo-dark.png'

export const SeatLockedEmail = ({ organisationName, ownerEmail }: SeatLockedEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your ChAi access has been reduced due to a plan change</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt="ChAi logo" width={120} style={logo} />
        <Heading style={h1}>Your ChAi access has changed</Heading>
        <Text style={text}>
          Your ChAi access has been reduced due to a plan change in{' '}
          <strong>{organisationName}</strong>. Your seat is no longer active.
        </Text>
        <Text style={text}>
          Contact your workspace owner{ownerEmail ? ` (${ownerEmail})` : ''} for more
          information or to have your access restored.
        </Text>
        <Text style={footer}>Nothing you added to the workspace has been deleted.</Text>
      </Container>
    </Body>
  </Html>
)

export default SeatLockedEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '32px 24px' }
const logo = { margin: '0 0 28px' }
const h1 = { fontSize: '22px', fontWeight: 700, color: '#0E141C', margin: '0 0 16px' }
const text = { fontSize: '15px', lineHeight: '24px', color: '#33404F', margin: '0 0 16px' }
const footer = { fontSize: '13px', lineHeight: '20px', color: '#6B7787', margin: '24px 0 0' }
