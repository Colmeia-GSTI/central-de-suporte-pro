# Base de Conhecimento

> Módulo da hierarquia **[AGENTS.md](../../AGENTS.md)** · Domínios transversais em [_transversais.md](./_transversais.md).
> Fonte: re-auditoria completa do código (2026-07-21). Regras de negócio detalhadas de cobrança em [docs/REGRAS_DE_COBRANCA.md](../REGRAS_DE_COBRANCA.md).

## Escopo

Módulo 100% frontend (nenhuma edge function dedicada): staff cria/edita/fixa/categoriza artigos Markdown com upload de imagem; usuários buscam, leem (com views/feedback/TOC/relacionados) e navegam por categorias. Alimenta sugestões na abertura de chamados via KBSuggestions. Acesso ao banco é direto pelo supabase-js com RLS. Todos os 12 arquivos do escopo estão em uso; a dívida real é UI morta (Compartilhar/relacionados/⌘K), RPC ausente (increment_article_views) e renderer Markdown caseiro com risco de XSS e filtro .or() sem escaping.

## Integrações

- Supabase Postgres + RLS via supabase-js direto (sem edge function): tabelas knowledge_articles, knowledge_categories, article_feedback, ticket_categories
- Supabase Storage bucket público 'knowledge-images' (upload/getPublicUrl) — MarkdownEditor.tsx:127-135
- Supabase RPC increment_article_views (referenciada mas ausente — sempre fallback) — ArticleViewer.tsx:66
- Trigger/função DB generate_slug (usa unaccent) para slug de artigo — supabase/migrations/20260309...,20260414...
- Módulo de Chamados: KBSuggestions embutido em TicketForm/ClientTicketForm; artigos gerados por TicketResolveDialog

## Fluxos (rota → componente → hook → edge → tabela)

- /knowledge -> KnowledgePage -> KnowledgeHero(busca)/KnowledgeCategoryGrid/KnowledgePinnedCarousel/KnowledgeArticleList -> useQuery supabase.from('knowledge_articles').or(ilike title/content) + knowledge_categories -> tabelas knowledge_articles, knowledge_categories, ticket_categories(join legado)
- /knowledge (abrir artigo no Sheet) -> KnowledgePage -> ArticleViewer -> MarkdownPreviewRenderer + ArticleTableOfContents + ArticleFeedback; rpc increment_article_views (fallback update knowledge_articles) e upsert article_feedback -> tabelas knowledge_articles, article_feedback
- /knowledge/:slug -> KnowledgeArticlePage -> supabase.from('knowledge_articles').eq('slug').maybeSingle() (fallback eq id) -> ArticleViewer -> knowledge_articles
- /knowledge (Novo/Editar) -> KnowledgePage Dialog -> ArticleForm -> MarkdownEditor (upload storage 'knowledge-images') -> insert/update knowledge_articles (trigger generate_slug via unaccent)
- TicketForm(external)/ClientTicketForm -> KBSuggestions(title,description) -> supabase.from('knowledge_articles').or(ilike palavras).eq('is_public',true).order(views).limit(4) -> link <a href=/knowledge/:slug> (rota requireStaff)
- TicketResolveDialog -> insert knowledge_articles (artigo gerado ao resolver chamado) -> knowledge_articles [relacionado, fora do escopo primário]

## Regras de negócio

- Busca por título+conteúdo via or(title.ilike,%q%,content.ilike,%q%) — KnowledgePage.tsx:59
- Debounce de busca 300ms na listagem — KnowledgePage.tsx:48
- Ordenação client-side recent/popular(views)/helpful(helpful_count)/alphabetical(pt-BR) — KnowledgePage.tsx:76-90
- Lookup de artigo por slug primeiro, fallback por id (retrocompat) — KnowledgeArticlePage.tsx:26-46
- Feedback UNIQUE por (article_id,user_id): update se já votou, senão insert — ArticleFeedback.tsx:54-67
- Feedback exige usuário logado — ArticleFeedback.tsx:43-45
- Incremento de views idempotente por render (uma vez por article.id via ref) — ArticleViewer.tsx:83-88
- Views: tenta RPC atômica, cai em update não-atômico no catch — ArticleViewer.tsx:63-77
- Tempo de leitura = ceil(palavras/200), mínimo 1 — ArticleViewer.tsx:36-39
- Validação Zod: título 5-255, conteúdo 20-50000, resumo <=300, is_public default true — ArticleForm.tsx:35-47
- Tags: máx 10, lowercase, dedupe, Enter/vírgula adiciona — ArticleForm.tsx:145-162
- Rascunho persistido em sessionStorage só em artigo novo — ArticleForm.tsx:76-81
- Upload de imagem: só image/*, máx 5MB, bucket knowledge-images, insere Markdown com URL pública — MarkdownEditor.tsx:110-137
- KBSuggestions: só dispara com texto >=10 chars, palavras >3 chars (máx 6), só is_public, order views desc, limit 4, debounce 800ms — KBSuggestions.tsx:15-49
- KBSuggestions só é renderizado em chamado 'external' no TicketForm — TicketForm.tsx:402
- Category grid só is_active, ordenado por order_index — KnowledgeCategoryGrid.tsx:33-34
- Fixados: is_pinned=true, order_index, limit 6 — KnowledgePinnedCarousel.tsx:26-28
- TOC só renderiza com >=2 headings — ArticleTableOfContents.tsx:70
- Permissões UI: PermissionGate module='knowledge' create/edit/delete — KnowledgePage.tsx:139 e KnowledgeArticleList.tsx:191,203

## Arquivos-chave

- `src/pages/knowledge/KnowledgePage.tsx` — Página principal /knowledge: busca, filtro por categoria, ordenação, carrossel de fixados, lista, dialog de criar/editar, sheet de leitura e confirm de exclusão.
- `src/pages/knowledge/KnowledgeArticlePage.tsx` — Página de artigo único por slug (fallback por id) em /knowledge/:slug, renderiza ArticleViewer.
- `src/components/knowledge/ArticleForm.tsx` — Form React-Hook-Form+Zod de criar/editar artigo (título, categoria, público/fixar, resumo, tags, conteúdo Markdown).
- `src/components/knowledge/ArticleViewer.tsx` — Renderiza o artigo: breadcrumb, meta, incremento de views, Markdown, TOC, feedback e artigos relacionados.
- `src/components/knowledge/KnowledgeHero.tsx` — Hero com input de busca (⌘K decorativo).
- `src/components/knowledge/KnowledgeCategoryGrid.tsx` — Grade de categorias ativas (ícone lucide dinâmico) para filtro.
- `src/components/knowledge/KnowledgePinnedCarousel.tsx` — Carrossel horizontal de artigos fixados (is_pinned).
- `src/components/knowledge/KnowledgeArticleList.tsx` — Lista de artigos com ordenação, highlight de busca e ações editar/excluir por PermissionGate.
- `src/components/knowledge/ArticleFeedback.tsx` — Votação útil/não-útil (upsert em article_feedback) com comentário opcional no negativo.
- `src/components/knowledge/ArticleTableOfContents.tsx` — Índice lateral (headings #/##/###) com IntersectionObserver para item ativo; só aparece com >=2 headings.
- `src/components/knowledge/MarkdownEditor.tsx` — Editor Markdown com toolbar, abas escrever/visualizar e upload de imagem para bucket knowledge-images.
- `src/components/knowledge/MarkdownPreviewRenderer.tsx` — Renderer Markdown caseiro por regex (headings, listas, code, blockquote, img, link, bold/italic/inline-code) compartilhado.
- `src/components/tickets/KBSuggestions.tsx` — Sugere artigos públicos relacionados ao título/descrição do chamado; fora de src/knowledge mas é a peça 'sugestões em chamados' do escopo.

## Pontos de atenção / riscos

- XSS: MarkdownPreviewRenderer é parser caseiro por regex e injeta href/src sem sanitização/allowlist — permite javascript:/data: (MarkdownPreviewRenderer.tsx:171-176 links, :133-137/:49-52 imagens). Considerar react-markdown+rehype-sanitize ou DOMPurify.
- Injeção em filtro: KnowledgePage.tsx:59 e KBSuggestions.tsx:33-35 interpolam o termo direto no .or() do PostgREST sem escapar vírgula/parêntese/% — quebra ou altera a query com esses caracteres.
- Race condition em views: RPC ausente força update read-modify-write não-atômico (ArticleViewer.tsx:71-75), perdendo incrementos concorrentes.
- excerpt/calculateReadingTime usam replace(/<[^>]*>/g) para 'limpar HTML', mas o conteúdo é Markdown, não HTML — limpeza inócua (KnowledgeArticleList.tsx:111, ArticleViewer.tsx:37).
- UI morta acumulada: Compartilhar, cards relacionados, ⌘K e not_helpful_count (ver candidatosMortos) — dívida de escoteiro a remover ou implementar.
- KnowledgeArticlePage/rota /knowledge/:slug só é alcançada por URL direta, copiar-link ou link de KBSuggestion; dentro do app a leitura acontece em Sheet (setViewingArticle), sem navegação de rota.
- IDs de heading no TOC e no renderer são derivados independentemente (mesma fórmula heading-{index}-{slug}) — acoplamento frágil por convenção duplicada entre ArticleTableOfContents.tsx:34 e MarkdownPreviewRenderer.tsx:67/75/83; qualquer mudança numa fórmula quebra o scroll.

## Código morto — tratado na Fase 2 ou pendente de decisão

- `Botão 'Compartilhar' (Share2)` (src/components/knowledge/ArticleViewer.tsx) — Botão renderizado sem onClick — UI morta/decorativa.
- `Cards de 'Artigos Relacionados'` (src/components/knowledge/ArticleViewer.tsx) — Buttons de artigo relacionado sem onClick — não navegam nem abrem nada.
- `Atalho ⌘K` (src/components/knowledge/KnowledgeHero.tsx) — kbd ⌘K puramente visual; não há keybinding que foque a busca.
- `not_helpful_count` (src/components/knowledge/*) — Coluna de banco existe mas nunca é exibida na UI (só helpful_count é mostrado).
- `RPC increment_article_views (branch feliz)` (src/components/knowledge/ArticleViewer.tsx) — RPC chamada não existe (ausente das migrations e do types.ts Functions); o try sempre lança e cai no fallback update não-atômico. Ramo atômico é efetivamente morto.

## Notas de divergência (auditoria vs MAPA antigo)

- docs/MAPA_DE_SETORES.md §3.11 está, incomum, EM DIA e majoritariamente CORRETO: paths, lista dos 10 componentes de knowledge/, ausência de edge functions, tabelas (knowledge_articles/knowledge_categories/article_feedback/ticket_categories/storage knowledge-images) e dependências (KBSuggestions/TicketResolveDialog em Tickets) conferem com o código.
- CONFIRMADO (não é divergência): MAPA:626 'RPC increment_article_views NÃO existe' — verificado: ausente das migrations (só generate_slug/unaccent) e do types.ts; ArticleViewer.tsx:66 sempre cai no fallback não-atômico.
- CONFIRMADO: MAPA:627 rota /knowledge e /knowledge/:slug ambas requireStaff (AnimatedRoutes.tsx:168-169) enquanto KBSuggestions (usada no ClientTicketForm do portal) linka /knowledge/:slug — cliente vê sugestão mas o link é barrado; is_public tem efeito prático limitado.
- CONFIRMADO: MAPA:629-632 riscos reais — MarkdownPreviewRenderer monta <a href>/<img src> direto do regex sem allowlist (XSS via javascript:/data:) em MarkdownPreviewRenderer.tsx:49-52,133-137,171-176; filtro .or() por interpolação sem escaping em KnowledgePage.tsx:59 e KBSuggestions.tsx:33-35.
- NÃO VERIFICADO nesta auditoria (fora do escopo primário, sem acesso a banco): MAPA:628 sobre artigos criados via TicketResolveDialog usarem category_id/client_id legados; MAPA:634 dependência de extensão unaccent (a função generate_slug usa unaccent em migrations 20260309.../20260414..., mas a instalação da extensão não foi confirmada).

