/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Você foi convidado para a Colmeia</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brandName}>⬡ Colmeia</Text>
          <Text style={brandSubtitle}>Central de Atendimento</Text>
        </Section>
        <Section style={content}>
          <Heading style={h1}>Você foi convidado!</Heading>
          <Text style={text}>
            Você foi convidado para participar da{' '}
            <Link href={siteUrl} style={link}>
              <strong>Colmeia</strong>
            </Link>
            . Clique no botão abaixo para aceitar o convite e criar sua conta.
          </Text>
          <Button style={button} href={confirmationUrl}>
            Aceitar Convite
          </Button>
          <Text style={footer}>
            Se você não esperava este convite, pode ignorar este e-mail com
            segurança.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Montserrat, Arial, sans-serif' }
const container = { maxWidth: '560px', margin: '0 auto' }
const header = {
  backgroundColor: '#E8A914',
  padding: '24px 25px',
  textAlign: 'center' as const,
  borderRadius: '12px 12px 0 0',
}
const brandName = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#1a1d21',
  margin: '0',
  letterSpacing: '1px',
}
const brandSubtitle = {
  fontSize: '11px',
  color: '#1a1d21',
  margin: '2px 0 0',
  textTransform: 'uppercase' as const,
  letterSpacing: '2px',
  opacity: '0.7',
}
const content = { padding: '32px 25px 20px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#212529',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#6B7280',
  lineHeight: '1.6',
  margin: '0 0 20px',
}
const link = { color: '#E8A914', textDecoration: 'underline' }
const button = {
  backgroundColor: '#E8A914',
  color: '#1a1d21',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '12px',
  padding: '12px 24px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#9CA3AF', margin: '30px 0 0' }
