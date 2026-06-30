# Newsletter Automatizada SEPRI

App interna para a Eliana monitorizar legislação e aprovar newsletters antes de serem geradas em HTML pronto para Brevo.

## Stack
- **Lovable Cloud** (Supabase) — base de dados + auth para a Eliana
- **Lovable AI Gateway** (`google/gemini-3-flash-preview`) — resumir achados e gerar HTML da newsletter
- **Firecrawl** (connector) — scraping diário das 6 fontes
- **Lovable Emails** — alertas para joanicapereira@gmail.com com tokens de aprovação/rejeição
- **TanStack Start** — dashboard + server functions + cron diário

## Fontes monitorizadas
DGS, ACT, Diário da República, EU-OSHA, ANEPC, Ordem dos Psicólogos — configuradas numa tabela `sources` (URL + filtros/keywords por fonte), editável no dashboard.

## Fluxo
```text
[Cron diário 07h00 Lisboa]
        │
        ▼
[Firecrawl scrape de cada fonte]
        │
        ▼
[IA filtra novidades vs. histórico + classifica relevância
 com critérios SEPRI: medicina trabalho, SST, riscos psicossociais,
 incêndios, legionella, formação, etc.]
        │
        ▼
[Insere em `detections` (status: pending)]
        │
        ▼
[Email à Eliana com resumo + 2 botões assinados:
  ✅ Aprovar (gera newsletter)   ❌ Rejeitar]
        │
        ├── Rejeitar → status: rejected
        │
        └── Aprovar → IA gera HTML Brevo-ready
                      → status: approved
                      → Eliana vê no dashboard,
                        copia HTML ou faz download
```

## Tabelas (Cloud)
- `sources` — fontes monitorizadas (nome, url, tipo, keywords, active)
- `detections` — novidades detetadas (titulo, resumo, url_origem, fonte_id, status: pending/approved/rejected, detected_at)
- `newsletters` — HTML gerado (detection_id, html, subject, generated_at)
- `approval_tokens` — tokens HMAC para botões de email (token, detection_id, action, expires_at, used_at)
- `scan_runs` — histórico das execuções do cron (timestamp, fonte, novidades, erros)
- `user_roles` + função `has_role` — controlo de acesso (admin = Eliana)

RLS: só `admin` lê/escreve. Tokens de aprovação validados via HMAC sem precisar de sessão.

## Server functions / rotas
- `scanSources` (cron diário, server fn) — chama Firecrawl + IA, popula `detections`, envia email
- `/api/public/approve` (route) — valida token, marca status, dispara geração
- `/api/public/reject` (route) — valida token, marca rejected
- `generateNewsletterHtml` (server fn) — IA produz HTML estruturado
- `triggerManualScan` (server fn admin) — botão "scan agora" no dashboard

## Dashboard (`/_authenticated`)
- **Login** (`/auth`) — email/password Supabase
- **Inbox** (`/`) — deteções pendentes com Aprovar/Rejeitar/Ver fonte
- **Newsletters** (`/newsletters`) — lista de HTMLs gerados, preview iframe, copiar/download
- **Fontes** (`/sources`) — gerir URLs e keywords das 6 fontes
- **Histórico** (`/history`) — scan_runs + tudo o que foi processado

## Template HTML newsletter (gerado pela IA)
Estrutura obrigatória:
1. Topo: `<img>` placeholder do logótipo SEPRI (URL configurável)
2. Título H1
3. Lead (parágrafo destacado)
4. Placeholder `<img>` ilustrativo
5. Corpo do texto neutro
6. Rodapé com disclaimers (texto configurável — placeholder por agora)

Tom: neutro/informativo, serve interno e externo.

## Setup que vou pedir-te
1. Ativar **Lovable Cloud** (auto)
2. Ligar **Firecrawl** connector
3. Criar conta da Eliana no primeiro arranque (seed)
4. Configurar email domain para envio (Lovable Emails) — vou ativar quando chegarmos lá

## Fora de âmbito (podemos adicionar depois)
- Envio direto via Brevo API à lista (ficamos no copy/paste do HTML)
- Logo e disclaimers finais (placeholders por agora)
- Multi-utilizador além da Eliana
- Edição manual do HTML antes de aprovar

Posso avançar?