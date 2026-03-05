/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu código de verificação — Colmeia</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brandName}>⬡ Colmeia</Text>
          <Text style={brandSubtitle}>Central de Atendimento</Text>
        </Section>
        <Section style={content}>
          <Heading style={h1}>Código de verificação</Heading>
          <Text style={text}>Use o código abaixo para confirmar sua identidade:</Text>
          <Text style={codeStyle}>{token}</Text>
          <Text style={footer}>
            Este código expira em breve. Se você não solicitou, pode ignorar
            este e-mail com segurança.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

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
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '28px',
  fontWeight: 'bold' as const,
  color: '#E8A914',
  margin: '0 0 30px',
  letterSpacing: '4px',
}
const footer = { fontSize: '12px', color: '#9CA3AF', margin: '30px 0 0' }
