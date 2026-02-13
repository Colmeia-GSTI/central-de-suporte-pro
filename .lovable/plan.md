
# Simplificar UX de Batch Processing de Faturas

## Situação Atual
- Ao clicar "Faturar Agora", abre um **Dialog modal grande** que monopoliza a tela
- Dialog apresenta: seleção de provedor, checkboxes de ações, barra de progresso
- Bloqueia o usuário de interagir com o resto do sistema

## Proposta: Fluxo Discreto com Toasts

### Mudanças Propostas

**1. Remover o Dialog modal de `BillingBatchProcessing.tsx`**
   - O componente atualmente é um dialog cheio de opções
   - Será simplificado para apenas processar com padrões pré-configurados
   - As opções de seleção (boleto, PIX, NFS-e, email, whatsapp) serão removidas do fluxo direto

**2. Usar Toast Sonner para feedback não-intrusivo**
   - **Iniciar**: Toast de "Processando X faturas..." (duration curta ou indefinida com ação "Cancelar")
   - **Progresso**: Opcionalmente manter um toast de progresso discreto no canto
   - **Sucesso**: Toast verde com "✓ X faturas processadas com sucesso"
   - **Erro**: Toast vermelho com detalhes do erro

**3. Fluxo Simplificado (sem dialog)**
   - Clica "Faturar Agora"
   - Toast aparece no canto inferior: "Processando 3 faturas..."
   - Sistema continua respondendo (o usuário pode navegar, não fica preso)
   - Toast de conclusão ao final
   - Tabela se atualiza automaticamente via `queryClient.invalidateQueries`

**4. Configurações Padrão**
   - `generateBoleto: true`
   - `generatePix: false`
   - `emitNfse: true`
   - `sendEmail: true`
   - `sendWhatsapp: false`
   - `billingProvider: "banco_inter"`

### Arquivos a Alterar

| Arquivo | Mudança |
|---------|---------|
| `src/components/billing/BillingBatchProcessing.tsx` | Remover Dialog e opções de UI. Manter apenas a lógica de mutation com toasts. Pode se tornar um hook customizado ou ser integrado diretamente no tab. |
| `src/components/billing/BillingInvoicesTab.tsx` | Remover chamada para `<BillingBatchProcessing dialog>`. Chamar a mutation diretamente ao clicar "Faturar Agora". |

### Benefícios
✅ Não atrapalha fluxo do usuário  
✅ Menos cliques (direto para ação)  
✅ Sistema continua responsivo  
✅ Feedback claro mas discreto via toasts  
✅ Melhor UX para processamento em background
