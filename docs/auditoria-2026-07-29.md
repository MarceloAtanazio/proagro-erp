# Auditoria completa do ProAgro ERP — 29/07/2026

Análise de todo o sistema: `api/index.js` (2.055 linhas, 94 rotas), `public/app.js`
(5.639 linhas), `public/styles.css`, `supabase/schema.sql`, `package.json`,
`vercel.json` e o banco em produção (Supabase).

**Legenda de evidência**
- ✅ **Verificado** — reproduzido/medido neste ambiente
- 📖 **Confirmado por código** — inequívoco na leitura, não executado
- 💡 **Sugestão** — melhoria/ideia, não é defeito

**Legenda de status**
- 🔧 **CORRIGIDO HOJE** — já implantado nesta sessão
- ⬜ **ABERTO** — aguardando decisão

---

## Resumo executivo

| Severidade | Qtd | Corrigidos hoje |
|---|---|---|
| 🔴 Crítico (segurança/integridade) | 4 | 1 |
| 🟠 Alto (bug funcional) | 5 | 3 |
| 🟡 Médio (escala/robustez) | 8 | 0 |
| 🔵 Baixo (qualidade/manutenção) | 7 | 0 |
| 💡 Ideias de produto | 13 | — |

**Pontos fortes encontrados:** nenhuma vulnerabilidade de SQL injection (todas as
queries são parametrizadas; os fragmentos dinâmicos usam apenas identificadores
internos fixos); `esc()` aplicado consistentemente no frontend (nenhum XSS
localizado); `npm audit` com **0 vulnerabilidades**; permissões com dupla trava
(UI + backend `requireEdit`); `requireAuth` recarrega o usuário do banco a cada
requisição (revogação imediata); log de auditoria bem estruturado nas áreas
financeira e de viáticos; conta inativa é bloqueada de fato (verificado).

---

## 🔴 CRÍTICOS

### C1. Anexos de viáticos ignoram o escopo do colaborador — 📖 ⬜ ABERTO
**Onde:** `api/index.js` — `GET /api/attachments/:type/:id` (L637),
`GET /api/attachments/file/:id` (L613), `GET /api/attachments/count/:type` (L623).

As três rotas verificam **somente a permissão de página** (`canView(user,'viaticos')`),
sem aplicar `viaticosEscopo()`. Comparação direta no mesmo arquivo:

```js
// GET /api/viaticos/solicitacoes/:id/despesas  — FILTRA por escopo (correto)
const escopo = await viaticosEscopo(req.user);
if (escopo) { const dona = await query('SELECT 1 FROM erp_viaticos_solicitacoes WHERE id=$1 AND colaborador_id = ANY($2)', ...) }

// GET /api/attachments/viatico/:id — NÃO filtra
if (req.user.role !== 'admin' && !canView(req.user, page)) return res.status(403)...
```

**Impacto:** um usuário com `viaticos: view` (que na tela só vê as próprias
viagens) pode **listar e baixar comprovantes de qualquer colaborador** trocando o
id na URL — notas de hotel, passagens, recibos. `count/viatico` também devolve a
contagem global.

**Correção proposta:** quando `type === 'viatico'`, resolver a solicitação dona da
despesa e comparar com `viaticosEscopo(req.user)`; em `count`, filtrar pelo escopo.

*Nota de método:* não executei o teste end-to-end porque não há usuário restrito
**ativo** no ambiente (a conta com `viaticos: view` está desativada) e não criei
nem reativei contas de produção sem autorização. A evidência de código é direta.

### C2. Nenhuma transação no banco (0 `BEGIN`/`COMMIT` no projeto) — ✅ ⬜ ABERTO
**Onde:** todo o backend. Operações compostas gravam em 2–3 queries independentes.

Exemplo mais grave — `POST /api/suprimentos/compras`:
1. `INSERT` do título em `erp_payables` (se "lançar em Contas a Pagar");
2. `INSERT` do movimento de estoque;
3. `UPDATE` do custo médio.

Se a etapa 2 falhar (timeout do pooler, queda de rede — cenário real em
serverless), fica um **título financeiro a pagar sem a entrada de estoque
correspondente**, e ninguém é avisado. Mesmo padrão em: devolução de envio
(insere movimento + atualiza status), fechamento de viáticos, importação do Flash.

**Correção proposta:** `pool.connect()` + `BEGIN/COMMIT/ROLLBACK` nas operações
compostas (um helper `withTx(fn)` resolve todos os casos).

### C3. Race condition no controle de estoque — 📖 ⬜ ABERTO
**Onde:** `estoqueAtualItem()` + `POST /api/suprimentos/envios` (L1977) e
`/ajustes` (L2016).

O saldo é lido (`SELECT`) e só depois a saída é inserida, sem lock:

```js
const saldo = await estoqueAtualItem(item.id);      // lê 1
if (qtd > saldo) return res.status(400)...          // valida
await query(`INSERT INTO erp_estoque_movimentos ...`); // grava
```

Dois envios simultâneos do último item passam pela validação e **o estoque fica
negativo**. Em serverless há várias instâncias concorrentes, então não é hipotético.

**Correção proposta:** dentro da transação (C2), `SELECT ... FOR UPDATE` na linha
do item; ou um `CHECK` via trigger que rejeite saldo negativo.

### C4. Módulo Suprimentos não era auditado — ✅ 🔧 CORRIGIDO HOJE
Compras, envios, **ajustes de estoque** e cadastro de itens não geravam nenhum
registro em `erp_audit_log` (o `AUDIT_MAP` não tinha nenhuma entrada de
`/api/suprimentos`). Ajuste de estoque é a operação mais sensível a fraude
("desapareceu um notebook" → ajuste de saída sem rastro).

**Feito:** 7 entradas adicionadas ao `AUDIT_MAP`. Verificado: *"Ajustou o estoque
do item ID 10: +5 un. — motivo: 'teste auditoria'"*.

---

## 🟠 ALTOS (bugs funcionais)

### A1. "Valor em estoque" sempre R$ 0,00 — ✅ 🔧 CORRIGIDO HOJE
**Causa:** o custo médio só era atualizado em **compras**. Itens cadastrados com
"preço de custo" e com entrada por **ajuste** ficavam com `custo_medio = 0`, e
`valor = estoque × custo_medio` zerava. Era o caso dos 3 notebooks (estoque 2/6/4,
`preco_ultima_compra` preenchido, `custo_medio` 0,00).

**Feito:** (a) preço de custo do cadastro passa a ser o custo médio inicial;
(b) ajuste de entrada aceita custo unitário (sugerido do cadastro) e entra na
média ponderada; (c) campo de custo só aparece em entradas.
Verificado: cadastro a 5.000 → CMP 5.000; +2 un → valor 10.000; +1 un a 8.000 →
CMP 6.000 = (2×5.000+8.000)/3.

### A2. Fuso horário: "hoje" virava o dia seguinte após 21h — ✅ 🔧 CORRIGIDO HOJE
14 usos de `new Date().toISOString().slice(0,10)`. A função na Vercel roda em
**UTC**; no Brasil (UTC−3) isso devolve **amanhã** depois das 21h.

Verificado no horário crítico (29/07 23:30 BRT): antes `2026-07-30`, depois
`2026-07-29`.

**Impacto que existia:** vencimentos "de hoje" e horizontes 7/15/30 do dashboard
deslocados à noite; status automático de viagem (Em viagem → Aguardando
comprovação) mudando um dia antes; datas padrão dos formulários (compra, envio,
ajuste, devolução) abrindo com a data errada; *aging* de inadimplência com 1 dia
de erro.

**Feito:** helpers `hojeISO()`/`isoMaisDias()` no backend com `timeZone:
'America/Sao_Paulo'`; `todayISO()` do frontend usa o relógio local; datas de
calendário do dashboard normalizadas em UTC (`getUTC*`) para não depender do fuso
do servidor.

### A3. Combustível do carro **alugado** usa o consumo do carro **próprio** — 📖 ⬜ ABERTO
**Onde:** `public/app.js` L4138 e L4189 — `km / w.colab.veiculo_consumo_kml * preco`.

O cálculo do combustível de um carro **alugado** usa o km/L do veículo particular
cadastrado para o colaborador. Consequências: valor incorreto (carros diferentes)
e **impossibilidade de calcular** para quem não tem veículo próprio cadastrado
(a guarda em L3720 bloqueia o cálculo).

**Correção proposta:** campo "consumo do carro alugado (km/L)" por aluguel, com o
consumo do veículo próprio apenas como sugestão inicial.

### A4. Não há como corrigir ou cancelar compra, envio e ajuste — 📖 ⬜ ABERTO
Só existem rotas `POST` para movimentos (nenhum `PUT`/`DELETE`). Um lançamento com
quantidade ou custo errado **não pode ser editado nem estornado** pela interface —
resta um ajuste compensatório, que distorce o histórico e a média ponderada. Pior
quando a compra gerou título em Contas a Pagar: o título fica lá.

**Correção proposta:** "Estornar movimento" (lança o contrário, mantendo a
rastreabilidade e revertendo o custo médio) e, para compras com título, oferecer o
cancelamento do título junto.

### A5. Estoque mínimo padrão 0 nunca alerta — ✅ ⬜ ABERTO
Com `estoque_minimo = 0` (default), a condição `atual < min` nunca é verdadeira:
os 3 notebooks aparecem "OK" mesmo sem política de ressuprimento. O KPI "Abaixo do
mínimo" fica permanentemente 0 e passa falsa segurança.

**Correção proposta:** tornar o mínimo obrigatório no cadastro (ou destacar
"mínimo não definido" em vez de "OK").

---

## 🟡 MÉDIOS (escala e robustez)

### M1. Sem paginação nas listagens — ✅ ⬜
`/api/payables`, `/api/receivables`, `/api/viaticos/solicitacoes` e
`/api/suprimentos/movimentos` retornam **tudo** (nenhum `LIMIT`). Hoje há 346
títulos; com alguns milhares o payload e o render travam. Sugestão: paginação
server-side + filtros de período no backend.

### M2. Dashboard executa ~20 queries em série — 📖 ⬜
Em `/api/reports/dashboard` os `await` são sequenciais. Agrupar em `Promise.all`
reduziria a latência (importante em serverless, onde o tempo é cobrado).

### M3. Índices faltando — ✅ ⬜
Existem 7 índices. Faltam nos caminhos mais usados:
`erp_viaticos_despesas(solicitacao_id)`, `erp_attachments(entity_type, entity_id)`,
`erp_viaticos_solicitacoes(colaborador_id)`, `erp_colaboradores(usuario_id)`,
`erp_estoque_movimentos(data)`, `erp_payables(supplier_id)`.

### M4. Sem restrições de unicidade — ✅ ⬜
Só `erp_users.email` é único. Permite **SKU duplicado** em itens de estoque e
**CNPJ duplicado** em fornecedores. Sugestão: índice único parcial
(`where sku is not null`).

### M5. Anexos gravados como `bytea` no Postgres — 📖 ⬜
Cada arquivo (até 3 MB) fica no banco e trafega em base64 pela função serverless
(`express.json({limit:'12mb'})`). Infla o banco (limite do plano Supabase),
encarece backup e pressiona a memória da função. Sugestão: Supabase Storage com
URL assinada.

### M6. `pool max: 5` por instância serverless — 📖 ⬜
`src/db.js` abre até 5 conexões por instância; com várias instâncias simultâneas
pode esgotar o pooler. Em serverless o usual é `max: 1–2`.

### M7. Sessão fixa de 8h sem renovação — 📖 ⬜
O JWT expira em 8h sem *sliding*: o usuário é deslogado no meio do trabalho e
**perde o formulário aberto** (crítico no assistente de viáticos, que é longo).
Sugestão: renovar o cookie nas requisições ou avisar 5 min antes.

### M8. Sem *healthcheck* e sem monitoramento — ✅ ⬜
Não há `/api/health`. Uma falha de conexão com o Supabase (como a que ocorreu no
início do projeto) só é descoberta pelo usuário. Sugestão: rota de health +
monitor externo (UptimeRobot/Better Stack).

---

## 🔵 BAIXOS (qualidade e manutenção)

### B1. Zero testes automatizados — ✅ ⬜
Nenhuma pasta de testes nem script `test`. Toda validação é manual, o que já gerou
retrabalho nesta sessão. Sugestão: `node:test` cobrindo as regras de negócio
(TUD/tetos, custo médio, saldo de estoque, matriz de permissões, travas de
transporte) — ~200 linhas cobririam o núcleo de risco.

### B2. Sem linter, formatter e CI — ✅ ⬜
Sem ESLint/Prettier e sem GitHub Actions. Erros só aparecem no deploy. Sugestão:
Action mínima rodando `node --check` + testes em cada push.

### B3. Bibliotecas de CDN sem SRI — ✅ ⬜
5 scripts externos (chart.js, jspdf, jspdf-autotable, xlsx, leaflet) sem
`integrity`/SRI. Se um CDN for comprometido, código arbitrário roda no ERP com a
sessão do usuário. Sugestão: adicionar SRI ou servir localmente.

### B4. Sem headers de segurança — 📖 ⬜
Não há CSP, `X-Content-Type-Options`, `Referrer-Policy` nem `X-Frame-Options`
(o ERP pode ser embutido em iframe de terceiros). Sugestão: headers no
`vercel.json` ou `helmet`.

### B5. Rate limit só no login, e por IP — 📖 ⬜
Nenhuma proteção nas demais rotas. O limite de login é por IP: um escritório com
IP compartilhado se bloqueia mutuamente, e um atacante distribuído contorna.
Sugestão: limitar também por e-mail e proteger rotas de escrita.

### B6. Arquivos monolíticos — ✅ ⬜
`app.js` com 5.639 linhas e `api/index.js` com 2.055 concentram tudo (há
duplicação, ex.: várias rotinas de PDF quase idênticas). Sugestão: dividir por
módulo (`viaticos.js`, `suprimentos.js`, `pdf.js`).

### B7. `schema.sql` não é migração versionada — ✅ ⬜
As mudanças foram aplicadas direto no banco e refletidas no arquivo, sem histórico
ordenado. Um banco novo (staging) não reproduz o estado atual com segurança.
Sugestão: `supabase/migrations/NNNN_*.sql` numeradas.

---

## 💡 IDEIAS DE PRODUTO

**Suprimentos**
1. **Termo de responsabilidade em PDF** na entrega de equipamento (colaborador,
   item, nº de série, data) — encaixa no seu caso dos notebooks e fecha o ciclo
   de custódia com documento assinável.
2. **Painel "quem está com o quê"** — visão por colaborador dos equipamentos em
   custódia (hoje só há filtro por situação).
3. **Inventário/contagem física** com relatório de divergências.
4. **Requisição de compra** (pedido → aprovação → compra) para fechar o ciclo.
5. **Importar/exportar itens em Excel** (a lib `xlsx` já está no projeto).
6. **Anexos no item** (nota fiscal, manual, foto) e **etiquetas com QR/código de
   barras** para conferência rápida.

**Transversal**
7. **Alertas por e-mail** (vencimentos, estoque baixo, viáticos a comprovar) — hoje
   tudo depende de alguém abrir o sistema.
8. **Cards de Suprimentos no Dashboard** (estoque baixo, valor em estoque,
   equipamentos em custódia).
9. **Busca global (Ctrl+K)** por título, fornecedor, colaborador, item.
10. **Backup automatizado documentado** + restauração testada (hoje depende só do
    Supabase).
11. **Mobile/responsivo**: as tabelas largas ficam ruins no celular — cards em
    telas pequenas.
12. **Acessibilidade**: foco visível, `aria-label` nos botões de ícone, contraste
    dos badges (útil também para uso em campo, sob sol).
13. **Conciliação inteligente**: sugerir correspondências por valor+data aproximados
    (hoje o match é exato).

---

## Correções aplicadas nesta sessão

| # | Item | Arquivos |
|---|---|---|
| A1 | Valorização do estoque (CMP inicial + custo no ajuste de entrada) | `api/index.js`, `public/app.js` |
| A2 | Fuso horário do Brasil em todo o "hoje" | `api/index.js`, `public/app.js` |
| C4 | Auditoria completa do módulo Suprimentos | `api/index.js` |

**Verificações executadas:** `node --check` nos dois arquivos; helpers de data
testados sob `TZ=UTC` no horário crítico; fluxo de valorização testado via API
(cadastro → ajuste → média ponderada → resumo); auditoria confirmada no log; form
de ajuste checado no navegador (campo de custo, sugestão do cadastro, ocultação em
saídas, data padrão correta). Todos os dados de teste criados foram **removidos**
do banco (verificado: 0 itens/movimentos/logs de teste).

**Pendência de dados:** os 3 notebooks já cadastrados continuam com
`custo_medio = 0` (o novo comportamento vale para cadastros/edições futuras).
Basta abrir cada item e salvar — ou aplicar um `UPDATE` único adotando o
`preco_ultima_compra` como custo médio (aguardando autorização).

---

## Prioridade sugerida

1. **C1** (vazamento de comprovantes) — risco de dados pessoais/financeiros.
2. **C2 + C3** (transações + lock de estoque) — integridade; resolvem juntos.
3. **A4** (estorno de movimentos) — operacional, aparece no primeiro erro de digitação.
4. **A3** (consumo do carro alugado) e **A5** (estoque mínimo).
5. **M1/M3** (paginação e índices) antes do volume crescer.
6. **B1/B2** (testes + CI) — reduz o retrabalho de todas as entregas seguintes.
