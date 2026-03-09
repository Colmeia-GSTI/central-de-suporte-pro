

# Modernização da Base de Conhecimento — Inspirado nos Líderes de Mercado

## Análise Comparativa

| Funcionalidade | Zendesk/Freshdesk/Notion | Colmeia HD (Atual) |
|---|---|---|
| Editor rico (WYSIWYG/Markdown) | Editor rico com toolbar, preview live | Textarea simples sem toolbar |
| Categorias hierárquicas | Árvore de categorias/seções | Flat (1 nível, reusa ticket_categories) |
| Tags nos artigos | Sistema de tags dedicado | Inexistente |
| Artigos relacionados | Sugestões automáticas | Inexistente |
| Feedback (útil/não útil) | Votação por artigo | Inexistente |
| Busca full-text destacada | Highlight nos resultados | Busca ILIKE básica |
| Navegação lateral (TOC) | Table of Contents automático | Inexistente |
| Fixar artigos populares | Pin/destaque | Inexistente |
| Versionamento | Histórico de edições | Inexistente |
| Ordenação/filtro avançado | Por categoria, popularidade, data | Apenas data |
| Layout da listagem | Cards com thumbnails + sidebar de categorias | Grid simples sem filtro lateral |
| Breadcrumbs na visualização | Categoria > Subcategoria > Artigo | Inexistente |

## Plano de Implementação

### Fase 1 — Database (Migração SQL)

Adicionar à tabela `knowledge_articles`:
- `tags text[]` — array de tags
- `is_pinned boolean DEFAULT false` — artigos fixados no topo
- `helpful_count integer DEFAULT 0` — votos "útil"
- `not_helpful_count integer DEFAULT 0` — votos "não útil"
- `slug text` — URL amigável gerada do título
- `excerpt text` — resumo curto (150 chars)
- `order_index integer DEFAULT 0` — ordenação manual

Nova tabela `knowledge_categories`:
- `id uuid PK`
- `name text NOT NULL`
- `slug text`
- `description text`
- `icon text` (nome do ícone Lucide)
- `parent_id uuid FK` (hierarquia)
- `order_index integer DEFAULT 0`
- `article_count integer DEFAULT 0` (cache counter)
- `created_at, updated_at`

Nova tabela `article_feedback`:
- `id uuid PK`
- `article_id uuid FK`
- `user_id uuid`
- `is_helpful boolean`
- `comment text` (opcional)
- `created_at`
- Unique constraint em `(article_id, user_id)`

RLS: Staff pode CRUD tudo; authenticated pode dar feedback; público pode ler artigos `is_public = true`.

### Fase 2 — KnowledgePage Redesenhada

Layout inspirado em Zendesk Guide / Notion:

```text
┌─────────────────────────────────────────────────┐
│ 🔍 Buscar na Base de Conhecimento...            │
│ ┌─────────────────────────────────────────────┐ │
│ │ [Busca full-width com ícone + atalho /]     │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ 📌 Artigos em Destaque (pinned, carousel)       │
│ ┌────────┐ ┌────────┐ ┌────────┐               │
│ │ Card 1 │ │ Card 2 │ │ Card 3 │               │
│ └────────┘ └────────┘ └────────┘               │
│                                                 │
│ 📂 Categorias                                    │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │
│ │🖥 Infra│ │🌐 Rede │ │📧 Email│ │🔧 Geral│    │
│ │ 12 art.│ │ 8 art. │ │ 5 art. │ │ 15 art.│    │
│ └────────┘ └────────┘ └────────┘ └────────┘    │
│                                                 │
│ 📄 Artigos Recentes                              │
│ ┌───────────────────────────────────────────┐   │
│ │ Título · Categoria · 👁 123 · 2 dias atrás│   │
│ │ Título · Categoria · 👁 89  · 5 dias atrás│   │
│ └───────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

Componentes novos:
- **KnowledgeHero**: Busca centralizada com fundo gradiente, estilo "Help Center"
- **KnowledgeCategoryGrid**: Cards de categorias com ícone, contagem, click para filtrar
- **KnowledgePinnedCarousel**: Artigos fixados em destaque horizontal
- **KnowledgeArticleList**: Lista com filtros (categoria, tags, ordenação por popularidade/data)
- **KnowledgeFilterSidebar**: Sidebar com categorias em árvore + tags como chips

### Fase 3 — ArticleViewer Modernizado

- **Table of Contents (TOC)** lateral automático: extrai headings do Markdown e gera navegação sticky
- **Breadcrumbs**: Categoria > Artigo
- **Feedback widget**: "Este artigo foi útil?" com botões 👍/👎 + campo de comentário opcional
- **Artigos relacionados**: Query por mesma categoria + tags similares (bottom section)
- **Metadata rica**: Autor (com avatar), data de criação, última atualização, contagem de views
- **Copiar link / Compartilhar**: Botão de copiar URL do artigo
- **Tempo de leitura estimado**: Baseado em word count (~200 palavras/min)

### Fase 4 — ArticleForm com Editor Markdown Avançado

Substituir o Textarea por um editor com:
- **Toolbar Markdown**: Bold, Italic, Heading 1-3, Code block, Link, Lista, Quote, Separador
- **Preview split-screen**: Igual ao ClientDocumentation (já existe o padrão)
- **Seletor de tags**: Input de tags com autocomplete (chips)
- **Toggle "Fixar artigo"**: Switch para `is_pinned`
- **Campo de resumo**: Input para `excerpt` com contador de caracteres
- **Seletor de categoria dedicada**: Usando `knowledge_categories` em vez de `ticket_categories`

### Fase 5 — Melhorias de UX Global

1. **Busca com highlight**: Termos buscados destacados em amarelo nos resultados
2. **Ordenação**: Por popularidade (views), data, alfabético
3. **Filtro por tags**: Chips clicáveis para filtrar por tag
4. **Empty state melhorado**: Ilustração + CTA contextual ("Crie seu primeiro artigo")
5. **Animações**: Cards com `animate-in fade-in slide-in-from-bottom` escalonado
6. **Rota dedicada para artigo**: `/knowledge/:slug` em vez de dialog modal (melhor SEO e compartilhamento)
7. **Mobile**: Cards responsivos, busca sticky no topo

## Arquivos

### Novos (7 arquivos)
- `src/components/knowledge/KnowledgeHero.tsx`
- `src/components/knowledge/KnowledgeCategoryGrid.tsx`
- `src/components/knowledge/KnowledgePinnedCarousel.tsx`
- `src/components/knowledge/KnowledgeArticleList.tsx`
- `src/components/knowledge/ArticleFeedback.tsx`
- `src/components/knowledge/ArticleTableOfContents.tsx`
- `src/components/knowledge/MarkdownEditor.tsx`

### Modificados (4 arquivos)
- `src/pages/knowledge/KnowledgePage.tsx` — Layout completamente redesenhado
- `src/components/knowledge/ArticleViewer.tsx` — TOC, feedback, artigos relacionados
- `src/components/knowledge/ArticleForm.tsx` — Editor markdown com toolbar, tags, pinned
- `src/components/layout/AnimatedRoutes.tsx` — Rota `/knowledge/:slug`

### Migração SQL
- 1 migration: novas tabelas + colunas + RLS + índices full-text

