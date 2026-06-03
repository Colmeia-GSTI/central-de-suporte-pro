## Plano atualizado: NFS-e com conformidade fiscal + UI mais clara

Vou corrigir a causa raiz e remodelar a área de ações da NFS-e usando a skill **UI/UX Pro Max**. A tela atual está confusa porque mistura ações comuns, ações fiscais e ações perigosas no mesmo bloco, incluindo “Cancelar e Excluir”, que não deve existir em um fluxo fiscal.

## Regra principal

Notas fiscais, boletos e logs financeiros não serão apagados fisicamente do banco.

A partir deste ajuste:

- “Excluir Registro” será removido.
- “Cancelar e Excluir” será removido.
- O fluxo correto será:
  - **Cancelar NFS-e**: cancela fiscalmente no Asaas/prefeitura e mantém histórico.
  - **Arquivar registro**: apenas oculta da listagem ativa, mantendo tudo no banco.
  - **Restaurar arquivado**: permite voltar a mostrar o registro.
  - **Ver logs**: continua mostrando o histórico/auditoria.

## Nova organização visual da tela

A área de botões será dividida em grupos claros:

```text
Documentos
[Ver logs] [XML] [PDF] [DANFSe]

Ação principal
[Validar e reenviar] ou [Cancelar NFS-e] ou [Reemitir]

Ajustes operacionais
[Editar] [Alterar status]

Conformidade e arquivo
[Arquivar registro] / [Restaurar registro]
```

Na prática, para a NFS-e 256 da imagem:

- “Validar e reenviar” não ficará competindo visualmente com cancelamento quando a nota já está autorizada.
- “Cancelar NFS-e” ficará separado como ação fiscal séria.
- “Cancelar e Excluir” desaparece.
- “Arquivar registro” entra como ação de organização, não como destruição de dado.
- O usuário verá uma mensagem curta explicando que arquivar não remove a nota nem os logs.

## Correção no backend

Vou alterar a função `asaas-nfse` para bloquear exclusão física.

Mudanças previstas:

- Substituir `delete_record` por `archive_record`.
- Criar `restore_record`.
- Remover o trecho que faz `.delete()` em `nfse_history`.
- Registrar arquivamento/restauração em logs de auditoria.
- Manter compatibilidade defensiva: se algum botão antigo ou chamada antiga tentar excluir, o backend não apagará mais; responderá orientando usar arquivamento.

## Banco de dados

Adicionar campos de arquivamento em `nfse_history`:

```text
is_active boolean default true
archived_at data/hora
archived_reason texto
archived_by usuário
```

Isso resolve a causa raiz do erro:

```text
nfse_history não pode ser apagada porque nfse_cancellation_log aponta para ela
```

Em vez de tentar apagar uma linha que tem histórico fiscal ligado a ela, vamos apenas marcar como arquivada.

## Listagem de NFS-e

Na aba de notas fiscais:

- Mostrar apenas notas ativas por padrão.
- Adicionar opção “Mostrar arquivadas”.
- Notas arquivadas aparecerão com badge “Arquivada”.
- Relatórios fiscais continuarão considerando o histórico, pois arquivar não é cancelar nem apagar.

## Diálogos atualizados

Trocar os diálogos atuais:

- `Excluir Registro?` vira `Arquivar registro?`
- `Cancelar e Excluir NFS-e?` será removido.
- O novo diálogo terá campo obrigatório:

```text
Motivo do arquivamento
```

Texto simples para o usuário:

```text
Este registro será ocultado da listagem principal, mas continuará salvo para auditoria fiscal.
```

## Asaas e cancelamento fiscal

Também vou corrigir o cancelamento conforme documentação do Asaas:

- Cancelar NFS-e usando o endpoint correto de cancelamento da nota fiscal.
- Enviar justificativa obrigatória.
- Tratar respostas como processamento, cancelamento negado ou nota já cancelada.
- Não transformar erro do Asaas em exclusão local.

## Arquivos previstos

- `supabase/functions/asaas-nfse/index.ts`
- `src/components/billing/nfse/NfseDetailsSheet.tsx`
- `src/components/billing/BillingNfseTab.tsx`
- `src/components/billing/nfse/details/NfseDeleteDialog.tsx`, renomeado/refatorado para arquivamento
- `src/components/billing/nfse/details/NfseCancelDeleteDialog.tsx`, removido do fluxo
- Nova migration para campos de arquivamento
- `CHANGELOG.md`
- Memória do projeto sobre regra fiscal: NFS-e nunca é apagada fisicamente

## Resultado esperado

Depois da implementação:

- A NFS-e 256 não tentará mais ser excluída fisicamente.
- O erro de chave estrangeira não ocorrerá mais.
- Novas notas também ficarão protegidas contra exclusão indevida.
- A interface ficará mais simples: cancelar é fiscal, arquivar é organização, logs são auditoria.
- O sistema ficará alinhado à retenção fiscal e auditoria.