

## Plano: Substituir editor Markdown por acordeão de Documentação Técnica

### O que será feito

Reescrever completamente o componente `ClientDocumentation` removendo o editor Markdown e substituindo por um acordeão com 14 seções colapsáveis, cada uma representando um módulo da documentação técnica do cliente.

### Alterações

#### 1. Reescrever `src/components/clients/ClientDocumentation.tsx`

- Remover todo o código atual (editor Markdown, preview, botões Split/Editar/Visualizar/Salvar)
- Novo componente usando `Accordion` do Radix (já disponível em `src/components/ui/accordion.tsx`) no modo `type="single"` com `defaultValue="section-1"`
- Props simplificadas: apenas `clientId: string` (remover `initialContent`)

**Estrutura das 14 seções:**

| # | Título | Badge | Ícone |
|---|--------|-------|-------|
| 1 | Dados gerais do cliente | campos fixos | Building2 |
| 2 | Infraestrutura | misto | Server |
| 3 | Internet, conectividade e telefonia | misto | Wifi |
| 4 | Estações e servidores | tabela | Monitor |
| 5 | Dispositivos de rede | tabela | Network |
| 6 | CFTV — Câmeras e NVR | tabela | Camera |
| 7 | Licenças | tabela | Key |
| 8 | Softwares e ERPs | tabela | Package |
| 9 | Domínios e DNS | tabela | Globe |
| 10 | Credenciais de acesso | tabela | Lock |
| 11 | Contatos e horários de suporte | misto | Users |
| 12 | Segurança e políticas de rede | misto | Shield |
| 13 | Prestadores externos | tabela | Handshake |
| 14 | Rotinas e procedimentos | tabela | ClipboardList |

**Cada cabeçalho terá:**
- Número da seção + título
- Badge discreto ("campos fixos" / "tabela" / "misto")
- Contador placeholder alinhado à direita (ex: "—")
- Chevron animado (já incluso no `AccordionTrigger`)

**Corpo:** Placeholder `[Seção X em construção]` com ícone e texto centralizado.

**Estilo:** Fundo do cabeçalho com `bg-muted/30`, corpo sem borda pesada, badges usando variant `outline`.

#### 2. Atualizar `src/pages/clients/ClientDetailPage.tsx`

- Remover prop `initialContent` da chamada ao `ClientDocumentation`
- Manter apenas `clientId={id!}`

### Arquivos

| Arquivo | Mudança |
|---|---|
| `src/components/clients/ClientDocumentation.tsx` | Reescrita completa |
| `src/pages/clients/ClientDetailPage.tsx` | Remover prop `initialContent` |

