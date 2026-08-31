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

interface OrgInviteEmailProps {
  organisationName: string
  inviterName: string
  roleLabel: string
  acceptUrl: string
  expiresInDays: number
}

const LOGO_URL = 'https://chai-retention-ai.lovable.app/logo-dark.png'

export const OrgInviteEmail = ({
  organisationName,
  inviterName,
  roleLabel,
  acceptUrl,
  expiresInDays,
}: OrgInviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to join {organisationName} on ChAi</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt="ChAi logo" width={120} style={logo} />
        <Heading style={h1}>Join {organisationName} on ChAi</Heading>
        <Text style={text}>
          {inviterName} has invited you to join <strong>{organisationName}</strong> as
          a <strong>{roleLabel}</strong>. Accept the invitation to get access to the
          team's retention workspace.
        </Text>
        <Button style={button} href={acceptUrl}>
          Accept invitation
        </Button>
        <Text style={footer}>
          This invitation expires in {expiresInDays} days. If you weren't expecting
          it, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default OrgInviteEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '32px 24px' }
const logo = { margin: '0 0 28px' }
const h1 = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: '#152238',
  margin: '0 0 20px',
}
const text = {
  fontSize: '15px',
  color: '#4A5A6B',
  lineHeight: '1.6',
  margin: '0 0 20px',
}
const button = {
  backgroundColor: '#204654',
  color: '#F7F9E1',
  fontSize: '15px',
  fontWeight: '600' as const,
  borderRadius: '10px',
  padding: '14px 28px',
  textDecoration: 'none',
}
const footer = { fontSize: '13px', color: '#8A96A3', margin: '32px 0 0' }
