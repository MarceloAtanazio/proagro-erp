# Registro de sessões — ProAgro ERP

> Arquivo gerado conforme diretriz da organização: documentar em Markdown
> o que é realizado em cada conversa/projeto no Claude Code.

## 2026-07-28 — Análise da estrutura do projeto e verificação do .env

**Solicitação:** explicar a estrutura do projeto e verificar se o `.env` está configurado corretamente.

### O que foi feito
1. Mapeada a estrutura do projeto (Vercel serverless + Supabase):
   - `api/index.js` — API Express completa (auth JWT via cookie, regras de negócio do módulo financeiro), executada como função serverless na Vercel.
   - `src/db.js` — camada de dados com `pg` (Pool apontando para o Supabase via Transaction Pooler, porta 6543).
   - `public/` — frontend estático (index.html, app.js, styles.css, assets).
   - `supabase/` — `schema.sql` e `seed.sql` para provisionar o banco.
   - `local-dev-server.js` — servidor local de desenvolvimento (`npm run dev`), carrega o `.env` via dotenv.
   - `vercel.json`, `package.json`, `.env.example`, `README.md`.
2. Verificado o `.env` contra o `.env.example` e contra o uso real no código (`DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`).
3. Testada a conexão real com o Supabase usando as credenciais do `.env` — **conexão OK** (banco `postgres`, 17 tabelas no schema `public`). Houve uma falha transitória de autenticação no pooler na primeira tentativa, resolvida ao repetir.

### Conclusões
- `.env` está configurado corretamente: `DATABASE_URL` no formato pooler (porta 6543) e funcional; `JWT_SECRET` com 96 caracteres hex; `NODE_ENV` vazio (correto para uso local).
- Detalhe cosmético: há um espaço após `DATABASE_URL=` — o dotenv remove automaticamente, mas convém tirar para evitar problemas se o valor for copiado para a Vercel.
- **Risco identificado:** o projeto **não possui `.gitignore`** — `.env` (com a senha do banco) e `node_modules/` aparecem como não rastreados e seriam commitados por um `git add .` acidental. Recomendada a criação de um `.gitignore` com `.env` e `node_modules/`.

### Pendências sugeridas
- [x] Criar `.gitignore` (`.env`, `node_modules/`) — criado em 2026-07-28, verificado com `git check-ignore`.
- [x] Remover o espaço após `DATABASE_URL=` no `.env` — feito em 2026-07-28, conexão retestada com sucesso.

## 2026-07-28 — Teste do ERP, correção de login e verificação do deploy Vercel

**Solicitação:** testar o ERP (login não funcionava) e depois viabilizar o acesso de outros usuários (antes usado via Vercel).

### O que foi feito
1. Diagnóstico do login local: usuário super-admin ativo, sem bloqueio de rate limit; API de login respondendo corretamente (401 para senha errada) → causa era senha divergente do hash no banco. Usuário redefiniu a senha (via SQL no Supabase) e o acesso local em http://localhost:3000 voltou a funcionar.
2. Criado `.claude/launch.json` para subir o dev server (`npm run dev`, porta 3000).
3. Verificado o deploy na Vercel: **https://proagro-erp.vercel.app está no ar** e com o mesmo código do repositório (main sincronizada com origin/main).
4. Testado o login na Vercel: retorna **HTTP 500 (“Erro interno”)** — a função serverless não consegue acessar o banco. Localmente o mesmo teste retorna 401, o que isola o problema nas **variáveis de ambiente da Vercel** (DATABASE_URL desatualizada/ausente).

### Pendências
- [x] Atualizar na Vercel (Project Settings > Environment Variables): `DATABASE_URL`, `JWT_SECRET` e `NODE_ENV=production` + Redeploy — feito pelo usuário em 2026-07-28. Retestado: o login na Vercel voltou a responder 401 para senha errada (banco acessível), em vez do 500 anterior. **Deploy operacional em https://proagro-erp.vercel.app**.
- [ ] Cadastrar os demais usuários pela própria interface do ERP (menu de administração, disponível ao super-admin).

## 2026-07-28 — Feature: status Online/Offline na lista de usuários

**Solicitação:** exibir na tela de Usuários quem está "Online" e "Offline".

### Implementação (presença via heartbeat — necessário por ser serverless/stateless)
1. **Banco:** migração `add_last_seen_at_to_erp_users` aplicada via Supabase (coluna `last_seen_at timestamptz` em `erp_users`); `supabase/schema.sql` atualizado. Observação: a conta Supabase tem um projeto antigo INATIVO (`nsmmgguwojdfeyhdmrkm`) — o ativo é `proagro-erp` (`wsieuqzrztlgxwotrjpy`), o que provavelmente explica o 500 anterior na Vercel.
2. **Backend (`api/index.js`):**
   - `requireAuth` grava heartbeat (`last_seen_at = now()`), com throttle de 60s, fire-and-forget;
   - login bem-sucedido grava `last_seen_at = now()`;
   - logout zera `last_seen_at` (usuário fica offline na hora);
   - `GET /api/users` retorna `last_seen_at` e `online` (atividade nos últimos 5 minutos).
3. **Frontend (`public/app.js` + `styles.css`):** badge "Online"/"Offline" com bolinha de status ao lado de Ativo/Inativo; lista recarrega a cada 60s enquanto a página de Usuários está aberta (pausa se houver modal aberto).

### Verificação
- Sintaxe validada (`node --check`), servidor local reiniciado sem erros, endpoints respondendo (401 sem auth, 200 no frontend).
- Consulta SQL do `online` testada direto no banco: usuário com `last_seen_at` recente → `online=true`; demais → `false`.

### Pendência
- [x] Publicar na Vercel — commit `336af57` enviado para `main` em 2026-07-28 (autorizado pelo usuário); deploy automático detectado no ar em ~15s e API smoke-testada (login responde 401 para senha errada). Também versionados: `.gitignore`, `docs/registro-sessoes.md` e `.claude/launch.json` (com `.claude/settings.local.json` ignorado).

## 2026-07-28 — Feature: menu lateral recolhível

**Solicitação:** botão para recolher o menu lateral e dar mais espaço às páginas.

### Implementação
1. **`index.html`:** botão `#btn-side-toggle` (chevron duplo) no cabeçalho da sidebar.
2. **`styles.css`:** estado `.side-collapsed` no `#view-app` — sidebar encolhe de 236px para 64px (transição 0,18s), exibindo só os ícones; textos, rótulos de seção e dados do usuário ficam ocultos (avatar permanece). No layout mobile (≤980px, menu empilhado) o recolhimento não se aplica e o botão fica oculto.
3. **`app.js`:** toggle com preferência persistida em `localStorage` (`proagro_sidebar_collapsed`); título/aria-label alternam entre "Recolher/Expandir menu"; itens do nav ganharam `title` (tooltip ao passar o mouse — essencial no modo só-ícones).

### Verificação
- Layout simulado no navegador local (sem autenticação, via DOM): recolhido = 64px de sidebar e +172px de área útil (1044 → 1216px); textos/seções/e-mail/botão Sair ocultos; ícones e avatar visíveis; tooltip presente; expandir restaura tudo; persistência confirmada.
- Nota de ambiente: transições CSS não avançam no painel de teste sem renderização de quadros — o valor 236px "congelado" era artefato; com `transition: none` a medida confirma 64px.
- Sem erros de console; `node --check` OK.

### Correção pós-validação (mesmo dia)
- **Bug:** ao recolher, o botão de expandir sumia. Causa: o logo da sidebar tinha `style="display:block"` inline, que vence a regra CSS de ocultação — o logo ficava espremido nos 64px e empurrava o botão para fora da área visível (medido: botão em x=62 num sidebar de 64px).
- **Correção:** estilo do logo movido do inline para o CSS (`.sidebar .brand img`), permitindo ao modo recolhido ocultá-lo. Verificado: recolhido → logo oculto, botão centralizado (x=19, largura 26, dentro dos 64px); expandido → tudo restaurado.

## 2026-07-28 — UX da Solicitação de Viáticos (etapa Transporte)

**Solicitação:** (1) melhorar os controles de "Ordem do roteiro" (muito texto junto); (2) mapa acompanhar a rolagem / ocupar mais altura; (3) melhorar a escolha de transportes.

### Implementação (`public/app.js` + `styles.css`)
1. **Ordem do roteiro:** chips apertados (`1º Cidade ▲▼×` inline) viraram lista vertical `.via-route-list` — cada parada em uma linha com número em círculo verde (mesma cor dos marcadores do mapa), nome com reticências + tooltip para endereços longos, e botões ↑ ↓ × de 26×26px com estados de hover (verde para mover, vermelho para remover). Texto explicativo encurtado.
2. **Mapa:** card com `position:sticky; top:88px` (topbar mede 78px) — acompanha a rolagem da coluna esquerda; altura dinâmica `calc(100vh - 240px)` com mínimo de 460px (antes: 500px fixos, sticky em top:16px que ficava sob a topbar).
3. **Transportes:** checkboxes pequenos viraram grade de cartões selecionáveis `.via-transport-tile` (ícone grande + nome), com estado marcado em verde + badge ✓, hover com sombra e foco acessível. IDs dos inputs preservados — nenhuma mudança de lógica.

### Verificação
- Medido no navegador local (estrutura da etapa 3 injetada no DOM): `:has(input:checked)` aplica fundo verde e ✓ (opacity 1); botões 26×26; ellipsis ativa em nome longo; sticky funciona (card fixo em y=88 após rolar 800px); mapa 480px no viewport de teste. Sem erros de console; `node --check` OK.

## 2026-07-28 — Travas de combinação de transportes (Solicitação de Viáticos)

**Solicitação:** bloquear combinações inválidas na etapa Transporte: Avião só combina com Aluguel de Carro e Táxi/Uber; Ônibus idem; Aluguel de Carro combina com Avião, Ônibus e Táxi/Uber; Carro Próprio é exclusivo; Táxi/Uber combina com Avião, Ônibus e Aluguel de Carro. Opções incompatíveis ficam bloqueadas.

### Implementação (`public/app.js` + `styles.css`)
- Mapa de compatibilidade `VIA_TRANSPORTE_COMPAT` + `viaAplicarTravasTransporte()`: ao marcar/desmarcar qualquer cartão, os incompatíveis com o conjunto marcado ficam `disabled` (opacidade reduzida, cursor bloqueado, tooltip dizendo com o que não combina). Cartões já marcados nunca são bloqueados — sempre dá pra desmarcar.
- `viaTransporteConflitos()` valida no "Avançar" (protege rascunhos gravados antes da trava — ex.: Avião+Ônibus marcados juntos geram aviso e bloqueiam o avanço até ajuste).
- Texto de apoio da etapa atualizado explicando as regras.

### Verificação
- Matriz de 8 cenários testada no navegador (grade real injetada no DOM): cada modo bloqueia exatamente o esperado; Carro Próprio bloqueia todos; combinação legada inválida é detectada pelo validador do Avançar; tooltip correto. `node --check` OK.

## 2026-07-28 — Escopo por usuário na tela de Viáticos

**Solicitação:** usuário comum logado deve ver na tela de Viáticos apenas as solicitações/ordens dele, não as de todos.

### Regra implementada
- **Admin ou usuário com EDIÇÃO em Viáticos:** continua vendo tudo (gestores precisam da visão completa).
- **Usuário com apenas LEITURA em Viáticos:** vê somente o que pertence ao colaborador vinculado ao seu usuário (`erp_colaboradores.usuario_id`). Sem colaborador vinculado → lista vazia.

### Implementação — filtro no BACKEND (`api/index.js`), não só na tela
- Helper `viaticosEscopo(user)` → `null` (sem restrição) ou lista de ids de colaborador permitidos.
- Filtrados: `GET /api/viaticos/solicitacoes` (lista principal), `GET /api/colaboradores`, `GET .../despesas` e `GET .../pendencia` (checagem de dono, 403 se de outro), `GET /api/viaticos/dashboard` (KPIs "Aguardando comprovação", "Vencidas" e "Divergentes" contam só as do próprio; valores globais da Carteira Flash são omitidos — `null`).
- Frontend (`app.js`): quando restrito, esconde os 2 cartões de carteira e mostra banner "Você está vendo apenas as suas solicitações de viáticos".

### Verificação
- SQL do filtro validado no banco: usuária de teste (leitura, colaborador 7) passa a ver 1 solicitação em vez das 44 de todos. Servidor reiniciado sem erros; endpoints exigem auth normalmente; `node --check` OK nos dois arquivos.

## 2026-07-28 — Botão "Ver detalhes" da OT para usuário só-leitura (Viáticos)

**Solicitação:** em vez de ocultar, permitir que o usuário só-leitura veja os dados completos da OT e a comprovação (quando houver). Substitui a tarefa antes sugerida de "ocultar botões".

### Implementação (`public/app.js`)
- Lista de Viáticos: para `READONLY`, a coluna de ações mostra só o botão **"Ver detalhes"** (sem Editar/Excluir); toolbar esconde "+ Nova solicitação" e "Configurações" (Exportar continua). Handlers de new/config só ligam fora do modo leitura.
- Modal `viewSolicitacao` ganhou um **bloco-resumo da OT** no topo (nº da OT, destinos, local/tier, período, expiração do Flash, status, motivo/objetivo) — visível para todos.
- Com `somenteLeitura` (nova flag = `READONLY`): o modal abre como **"Detalhes da viagem"** em consulta pura — sem seletor de status, sem importar Flash, sem adicionar/editar/excluir despesa, sem aprovar/reprovar excesso (vira texto "aguardando análise do administrador"); tabela de despesas + anexos (📎) permanecem para consulta. `openAttachments` já era read-only por permissão, então o usuário vê os comprovantes mas não anexa/exclui. Único botão do rodapé: Fechar.

### Verificação
- Templates dos dois modos exercitados no navegador local: modo leitura gera apenas "Ver detalhes"; modo edição mantém Comprovar/Editar/Excluir; labels e `viewSolicitacao` presentes; sem erros de console; `node --check` OK.

## 2026-07-28 — Correção: rota do aluguel de carro partia da cidade-base

**Bug reportado:** no caso "voou até outra cidade e alugou carro lá", a rota do aluguel considerava a cidade-base do colaborador em vez do local de retirada — somando o trecho feito de avião (ex.: Maringá→Goiânia ~2000 km) ao km do carro alugado.

**Causa:** em `viaRenderAluguelBlock` (handler do botão "Calcular rota"), o ponto de partida só usava o "Local de retirada" quando a checkbox `uso_local` estava marcada; desmarcada, partia da cidade-base e ignorava o campo de retirada preenchido.

### Correção (`public/app.js`)
- A rota do carro alugado agora parte **sempre** do "Local de retirada" quando informado; só cai na cidade-base se o campo ficar vazio. O checkbox `uso_local` passou a controlar apenas as **paradas** (listar manualmente vs. usar as cidades da OT), não mais a origem.
- Textos ajustados: hint fixo abaixo dos campos de retirada/devolução ("parte e retorna ao Local de retirada — não à cidade-base"); label do checkbox reescrita para refletir que é sobre listar paradas manualmente.

### Verificação
- Lógica do ponto de partida testada no navegador em 4 cenários: retirada Goiânia + checkbox off → parte de Goiânia (antes: Maringá) ✅; checkbox on → Goiânia + paradas custom; sem retirada → cai na cidade-base; retirada = base → sem regressão. Bloco real renderiza com os textos novos, sem erros de console; `node --check` OK.

## 2026-07-28 — Ajustes no PDF da solicitação + trajeto completo (mapa)

**Solicitação:** (1) título "Voos" quebrado; (2) título "Aluguel de Carro" quebrado/com caracteres estranhos; (3) "Total Geral" do Detalhamento justificado à direita e com fonte maior; (4) adicionar toda a rota da OT (deslocamentos de avião e automóvel, incluindo o mapa) na tela de revisão (etapa 5) e no PDF.

### Implementação (`public/app.js` + `styles.css`)
- **Itens 1 e 2:** os títulos das tabelas de transporte no PDF usavam emojis (`✈`, `🚌`, `🚗`) que a fonte helvetica do jsPDF não possui → imprimia lixo (ex.: "Ø=Þ—"). Emojis removidos dos títulos do PDF (mantidos na versão HTML, que renderiza normalmente).
- **Item 3:** a linha "Total Geral" passou a usar células-objeto no `foot` do autoTable, com `halign:'right'` no valor (alinhado como as demais) e `fontSize:11` nas duas células (maior que o corpo, 9), para diferenciar o fechamento.
- **Item 4 — Trajeto completo:**
  - Geometria/pontos da rota (OSRM) agora são **persistidos** no objeto do aluguel/carro próprio (`rota_pontos`, `rota_geometry`) quando a rota é calculada — via novo parâmetro `meta` em `viaExecutarCalculoRota`; ajuste de repetição não sobrescreve a geometria.
  - Novo helper `viaColetarTrajeto(w)` consolida voos, ônibus e trechos de automóvel (com km e total).
  - **Etapa 5 (tela):** seção "Trajeto completo da viagem" com itinerário (avião/ônibus/carro, cada trecho + subtotal de km por veículo) ao lado de um **mapa Leaflet** com as rotas rodoviárias (polilinhas coloridas + marcadores B/paradas). Voos entram no itinerário (ponto a ponto; aeroportos não têm coordenada na base).
  - **PDF:** seção "Trajeto da viagem" com **mapa vetorial** desenhado direto no jsPDF (projeção lat/lng, sem tiles → sem CORS nem dependência extra) + tabela-itinerário (Modo/Trecho/Detalhe) com rodapé de distância total por automóvel.

### Verificação
- No navegador local: geração completa do PDF chega ao fim sem erro (toast de sucesso); `viaPdfTrajeto`, `viaPdfDesenharMapa` e o autoTable do Total Geral rodam isolados sem exceção. Etapa 5 renderiza a seção com 4 itens de itinerário (voo + 2 trechos de carro + subtotal 216 km), tags de avião e carro, e o mapa Leaflet inicializado. Sem erros de console; `node --check` OK.

### Correção pós-validação — itinerário do PDF quebrado
- **Bug reportado:** no PDF, a coluna "Trecho" saiu com a seta virando lixo ("!'") e com as letras espaçadas; endereços de retirada muito longos deixaram a tabela feia; o total aparecia repetido em cada página.
- **Causa:** o caractere "→" (U+2192) não existe na fonte helvetica do jsPDF — além de imprimir lixo, corrompia o espaçamento de toda a célula que o continha (só as células com seta eram afetadas). Os rótulos de trecho usavam o endereço geocodificado completo.
- **Correção:** a coluna "Trecho" virou duas colunas **Origem/Destino** (sem seta). Novo helper `viaLabelCurto` encurta o rótulo (primeiro trecho antes da vírgula — "Alameda Aeroporto"), com o endereço completo preservado no mapa e no tooltip (tela). `showFoot:'lastPage'` + `rowPageBreak:'avoid'` eliminam o total duplicado e evitam linha partida entre páginas. Mesma abreviação aplicada ao itinerário da tela (mantendo "→", que o HTML renderiza).
- **Verificação:** linhas do PDF sem nenhum "→", 4 colunas, endereço encurtado, PDF gera de ponta a ponta sem erro; tela mostra rótulo curto com tooltip completo e mapa inicializado; `node --check` OK.

## 2026-07-28 — Mapa real (tiles OSM) no PDF do trajeto

**Solicitação:** no PDF, o "mapa" era só a linha do trajeto sobre um fundo cinza; o usuário quer ver o mapa de fato (ruas/cidades), não apenas o traçado.

### Implementação (`public/app.js`)
- Novo `viaPdfMapaImagem(comGeo, boxW, boxH)` (async): calcula o bounding box do trajeto, escolhe o zoom que melhor enquadra, baixa os tiles do OpenStreetMap (`tile.openstreetmap.org`, `crossOrigin='anonymous'`) que cobrem a área, desenha-os num canvas (~168 dpi), traça a rota (halo branco + linha colorida) e os marcadores (B/números) por cima, adiciona o crédito "© OpenStreetMap contributors" e devolve um PNG dataURL.
- `viaPdfTrajeto` virou async: usa `doc.addImage` com a imagem do mapa (box 82 mm); se a geração falhar (rede/CORS), cai no desenho vetorial antigo `viaPdfDesenharMapa` (mantido como fallback). Legenda movida para baixo do mapa.
- `viaGerarPDF` virou async (`await viaPdfTrajeto`); botão "Gerar PDF" mostra "Gerando mapa…" e fica desabilitado enquanto os tiles carregam.

### Verificação (sem disparar download — save sobrescrito no teste)
- `viaPdfMapaImagem` retorna PNG válido de ~970 KB em ~250 ms; canvas **não** fica *tainted* (CORS do OSM OK). Análise de pixels da imagem: **108 tons distintos** e cor média bege/branca típica do OSM → mapa real, não fundo liso. Dimensões 1201×541 (formato do box). Pipeline completo do PDF roda sem erro; sem erros de console; `node --check` OK.
- Observação de cortesia: testes de PDF passaram a rodar com `doc.save` sobrescrito, para não gerar downloads no ambiente (conforme pedido do usuário).
  - **Correção da regra de teste:** a sobrescrita de `doc.save` no protótipo NÃO funcionou (o jsPDF não expõe `save` ali) e o download disparou de novo na máquina do usuário. Nova regra firme: **não executar `viaGerarPDF` no navegador** em teste algum — validar apenas funções que retornam dados sem salvar (ex.: `viaPdfMapaImagem`) ou espionar `viaGerarPDF` com um stub que substitui a função inteira.

## 2026-07-28 — Botão "Baixar PDF" nos detalhes da solicitação

**Solicitação:** na tela de detalhes da viagem (vista por todos os usuários), adicionar um botão para extrair o PDF gerado no momento da solicitação. As que não têm PDF (antigas, antes do novo modelo) devem exibir uma mensagem ao tentar baixar.

### Implementação (`public/app.js`)
- `viaTemPdfSolicitacao(s)`: "tem PDF" quando `s.origem === 'colaborador'` (criada pelo assistente de autosserviço, o novo modelo que gera PDF). As `origem = 'admin'` são o modelo antigo.
- `viaBaixarPdfSolicitacao(s)`: se não tem PDF, `toast('Esta solicitação não possui PDF…')`; senão, reconstrói `w` (dados da OT + `transporte_detalhes`, que já guarda a geometria da rota) e `r` (a partir de `previsao_por_categoria`) e chama `viaGerarPDF`, passando `opts.dataEmissao = s.created_at`.
- `viaGerarPDF(w, r, opts={})`: novo `opts.dataEmissao` faz o PDF regerado usar a **data original** da solicitação (campo "Data" e assinatura), em vez de hoje. Na solicitação nova, sem opts → hoje.
- Botão **"Baixar PDF"** adicionado ao modal `viewSolicitacao` para todos (inclusive só-leitura).

### Verificação (sem gerar download — `viaGerarPDF` espionado por stub)
- Gating: admin → `false`/mensagem "não possui PDF" (não chama o gerador); colaborador → `true`. Reconstrução do colaborador: 2 destinos, avião+aluguel, total R$ 1.360, 3 dias, `dataEmissao` = created_at original. Trajeto reconstruído dos dados salvos: 1 voo + 1 carro com geometria (mapa/rota voltam no PDF). Sem erros de console; `node --check` OK.

## 2026-07-28 — Novo módulo: Suprimentos (Estoque · Compras · Envios)

**Solicitação:** seção para registrar compras de materiais, controle de estoque e controle de envio de equipamentos/materiais a funcionários.

**Decisões (via perguntas ao usuário):** (1) compra com opção de lançar em Contas a Pagar (checkbox por compra); (2) envios só para colaboradores cadastrados; (3) equipamentos com custódia e devolução.

### Modelo de dados (migração `suprimentos_estoque_compras_envios`)
- `erp_estoque_itens`: catálogo (nome, sku, categoria, tipo material/equipamento, unidade, estoque_minimo, custo_medio, ativo).
- `erp_estoque_movimentos`: **livro-razão** e fonte da verdade do estoque — `tipo` entrada/saida, `origem` compra/envio/ajuste/devolucao, quantidade, custo/valor, supplier_id, colaborador_id, status de custódia, payable_id (se virou Conta a Pagar), devolucao_de. Estoque atual = SUM(entrada) − SUM(saida). Também refletido em `supabase/schema.sql`.

### Backend (`api/index.js`)
- `suprimentos` adicionado ao whitelist `PERM_PAGES` (permissão configurável por usuário).
- Rotas `/api/suprimentos/*`: itens (CRUD), colaboradores, resumo (KPIs), movimentos (histórico), compras (entrada + custo médio ponderado + Conta a Pagar opcional), envios (saída com checagem de saldo), envios/:id/status (entregue/devolvido; devolução repõe estoque), ajustes (entrada/saída com motivo). `requireViewAny(['suprimentos'])` / `requireEdit('suprimentos')`.

### Frontend (`app.js` + `styles.css`)
- Nova seção "Suprimentos" no menu (ícone `box`), permissão `suprimentos` em `PERM_PAGES`/`PAGE_LABELS`, rota `renderSuprimentos`.
- Uma página com 3 abas: **Estoque** (KPIs, tabela com alerta de estoque baixo, item/ajuste/histórico), **Compras** (registrar com fornecedor/NF e opção de Contas a Pagar), **Envios a funcionários** (saída para colaborador, custódia enviado→entregue→devolvido para equipamentos).

### Verificação (dados de teste criados e depois REMOVIDOS do banco)
- Fluxo real via API (JWT de teste + servidor local): compra +10@5 → estoque 10, custo médio 5; envio 3 → 7; envio de 999 bloqueado ("estoque insuficiente"); devolução → 10; resumo valor R$50. Compra com `lancar_pagar` criou Conta a Pagar (id 346) e custo médio ponderado 6,43 = (10×5+4×10)/14. **Todos os dados de teste (item, movimentos, título 346) foram apagados** — banco confirmado limpo (0/0/0).
- Frontend (stub do `api`, sem tocar no banco): 3 abas; Estoque com 2 itens, KPIs, badges "Baixo"/"OK" corretos, valor total certo; Compras com badge "Em Contas a Pagar" e botão; Envios com "Marcar entregue"/"Registrar devolução" e formulário com disponibilidade + colaborador. Sem erros de console; `node --check` OK nos dois arquivos.

## 2026-07-30 — Fase 0 da auditoria: fechamento dos riscos críticos

**Contexto:** execução da Fase 0 recomendada em [AUDITORIA_ERP_2026-07-29.md](../AUDITORIA_ERP_2026-07-29.md).

### 1. C1 — Base de produção exposta fora do backend (o mais grave)
- **Antes:** 9 tabelas sem RLS num schema exposto ao PostgREST + `anon`/`authenticated` com `SELECT/INSERT/UPDATE/DELETE/TRUNCATE` em todas as `erp_*`. Com a chave anon (publicável, ativa até 2036) era possível ler `erp_users` **com `password_hash`**, `erp_payables`, `erp_receivables`, `erp_bank_transactions`, `erp_suppliers` (com `pix_key`), `erp_budgets`, `erp_login_attempts` e o estoque — contornando toda a camada de permissão do Express.
- **Verificação prévia de segurança:** confirmado que o backend conecta como `postgres` com `rolbypassrls = true`, logo ligar RLS não o afeta (as 10 tabelas que já tinham RLS provavam isso na prática).
- **Feito** (migração `seguranca_rls_todas_tabelas_erp_e_revoke_anon`): `ENABLE ROW LEVEL SECURITY` nas 9 tabelas; `REVOKE ALL` de `anon`/`authenticated` em tabelas e sequences; `ALTER DEFAULT PRIVILEGES` para tabelas futuras não nascerem abertas.
- **Depois:** as 9 tabelas retornam `HTTP 401 permission denied` para a chave anon; backend lê as 12 tabelas e grava normalmente; linter Supabase sem nenhum erro `rls_disabled_in_public` (só os INFO de "RLS sem política", que é o estado desejado).

### 2. C2 — Anexos de viáticos ignoravam o escopo do colaborador
Novo helper `anexoViaticoNoEscopo()` (`api/index.js`) aplicado nas 5 rotas de anexo (download, lista, contagem, upload e exclusão). A contagem passou a ser filtrada por escopo via JOIN. Verificado: a despesa 235 (de outro colaborador) fica fora do escopo `[7]`; super-admin segue baixando normalmente (anexo 45, PDF de 170 KB).

### 3. C4 — XSS armazenado via anexo SVG
- Whitelist `ATTACH_MIMES` (PDF, JPG, PNG, WEBP, XML de NFe, XLSX/XLS, DOCX — SVG e HTML fora) e `mimeDoConteudo()`, que confere a **assinatura do arquivo** em vez de confiar no MIME informado.
- No front, `previewable` virou lista explícita (`app.js`): SVG nunca vai para `<iframe>`.
- **Nota de escopo:** a primeira versão da whitelist só aceitava PDF e imagens, o que quebraria o anexo de **XML de NFe e planilhas** (uso real, previsto no `accept` do input). Corrigido antes de publicar: bloqueia o que o navegador executa, sem proibir documento legítimo.
- Verificado: SVG declarado → 415; **SVG renomeado para `.png` → 415**; PDF e PNG válidos → 200. Os 2 anexos de teste foram removidos (45 anexos, igual a antes).

### 4. A4 — Autosserviço exposto por obscuridade
`requireAutosservico` nas 2 rotas: liberado apenas para o super-admin (que está validando a tela) ou com `AUTOSSERVICO_VIATICOS=on`. Assim o recurso continua testável por você e fecha para os demais até o recálculo server-side da previsão (Fase 1).

### 5. A1 — Hospedagem unificada em NOITES (decisão do usuário) + B1 e B2
Decisões tomadas pelo usuário: hospedagem por **noites nas duas pontas** e pedágio **multiplicado pelas repetições**.
- **A1:** o teto de conferência passou de `valor_diaria × dias` para `× noites`, a mesma base da previsão. Viagem de 2 dias com TUD R$ 120: previsto R$ 120 e teto R$ 120 (antes o teto era R$ 240). Viagem de 1 dia não prevê pernoite — a mensagem de excesso explica isso em vez de citar um teto zerado.
- **B1 (de brinde):** criada a fonte única `viaDiasNoites(inicio, fim)` e eliminadas as 3 cópias literais da contagem de dias (previsão, conferência e regeração de PDF) — era justamente essa duplicação que permitiu a divergência do A1.
- **B2:** pedágio saiu do campo único e virou coluna **por trecho** na tabela de rota, ao lado de repetições e combustível: informa-se o valor de **uma passagem** e o total é `Σ(pedágio × repetições)`. O campo "Pedágio total" fica somente-leitura quando há detalhamento por trecho (evita dupla contagem) e continua editável quando a rota não foi calculada. `viaPedagioTotal()` mantém compatibilidade com solicitações antigas (usa o campo único quando não há pedágio por trecho).

**Verificação:** cenários de dias/noites (mesmo dia, 2 dias, 3 dias, virada de mês) com previsão e teto sempre iguais; pedágio R$ 8 × 6 repetições = R$ 48 e total R$ 80,50 na tabela real renderizada no navegador; 6 colunas presentes; compatibilidade com registro antigo (usa `pedagio_valor`) e novo (usa trechos). Sem erros de console; `node --check` OK.

### 6. Regra nova: viagem na própria cidade-sede não gera hospedagem
**Pedido do usuário:** quando o destino é a mesma cidade-sede cadastrada para o colaborador, não há hospedagem (ele dorme em casa). Exemplo dado: sede São Paulo/SP, visita comercial em São Paulo/SP de 18 a 20 → 3 dias de alimentação e **nenhuma** diária de hospedagem.

**Implementação** (`public/app.js`, seguindo o padrão de fonte única):
- `viaMesmaCidade(ufA, munA, ufB, munB)` — compara UF+município normalizando acento, caixa e espaços (registro antigo com grafia diferente não pode gerar falso negativo e pagar hospedagem indevida). A comparação é por **UF + município**, então homônimos não se confundem (Palmas/PR ≠ Palmas/TO).
- `viaHospedagemDevida(destinos, baseUf, baseMun)` — `false` só quando **todos** os destinos são a cidade-sede. Basta um destino fora para a hospedagem voltar a ser devida (há pernoite nesse trecho). Sem cidade-sede cadastrada ou sem destinos, mantém o comportamento normal — não dá para afirmar que é local, e o erro seria subestimar o viático por falha de cadastro.
- `viaNoitesFaturaveis(...)` aplicado nos **três** pontos que calculam hospedagem: previsão (`viaComputeResumo`), etapa 4 do assistente e **conferência/excesso** (`viewSolicitacao`) — se ficasse só na previsão, o teto voltaria a divergir, repetindo o achado A1.
- Etapa 4 mostra "Hospedagem — não se aplica: viagem na própria cidade-sede (São Paulo/SP) · R$ 0,00" em vez de "0 diária(s)". Na conferência, hospedagem lançada nesse caso gera excesso com mensagem específica citando a cidade-sede.
- **Backend:** `GET /api/viaticos/solicitacoes` passou a devolver `colaborador_cidade_base_uf`/`colaborador_cidade_base_municipio` (a tela de conferência não tinha esse dado).

**Verificação (7 cenários, funções reais no navegador):** caso do usuário → 3 dias de alimentação R$ 300 e hospedagem R$ 0 ✅; destino fora → hospedagem normal (2 noites); sede + destino fora → hospedagem devida; grafia "Sao Paulo" sem acento → reconhecida como mesma cidade; Palmas/PR vs Palmas/TO → cidades diferentes, hospedagem devida; sede não cadastrada e sem destinos → mantém hospedagem. Conferência: teto R$ 0 na cidade-sede e R$ 500 com destino fora. Sem erros de console.

### 7. Memória de cálculo no Resumo e no PDF
**Pedido:** levar a composição que aparecia só na etapa 4 ("Alimentação — 3 dia(s) × R$ 140,00 (teto da TUD)") para o quadro **Detalhamento de Viáticos** do resumo e do PDF, ao lado de cada conceito.

**Implementação** (`public/app.js`, fonte única para as três saídas):
- `viaMemoriaCategorias(w, cat)` gera a composição por categoria: hospedagem (`N diária(s) × R$ X` ou o motivo de não se aplicar), alimentação (`N dia(s) × R$ X`), voos/ônibus (`N trecho(s)`), aluguel (`N diária(s) × R$ X — locadora`), combustível (`km ÷ km/L × R$/L`), pedágio (`N trecho(s) com pedágio`), estacionamento e táxi (`N corrida(s)`). Devolvida em `viaComputeResumo` → usada pelo resumo e pelo PDF.
- `viaLinhasDetalhamento(r)` monta as linhas da tabela e **inclui Hospedagem com R$ 0,00** quando ela foi zerada por regra (cidade-sede ou mesmo dia). Antes o conceito desaparecia da tabela e o aprovador não distinguia "descartado por regra" de "esquecido".
- Nova coluna "Como foi calculado" no resumo (etapa 5) e no PDF (com fonte menor e cinza, largura das colunas ajustada).
- **PDF regerado:** `viaBaixarPdfSolicitacao` passou a montar `colab` com cidade-base e consumo (a lista de solicitações agora devolve `colaborador_veiculo_consumo_kml` também), então a memória sai correta em documentos históricos. Sem `tud` salva, os valores unitários são **derivados do que foi gravado** — o documento reflete a TUD da época, não a de hoje.
- **Preço do combustível** não é gravado na solicitação (achado B3): ele é **reconstruído** da própria fórmula (`preço = combustível × consumo ÷ km`). Guarda-chuva: se o valor reconstruído ficar fora da faixa R$ 2–15/L, significa que o combustível foi digitado à mão e não segue a fórmula — nesse caso exibe "Informado manualmente" em vez de mostrar uma premissa falsa.

**Verificação:** 3 cenários (assistente com TUD e preço; viagem fora com voo/aluguel/pedágio/estacionamento; PDF regerado sem TUD e sem preço). Dado consistente reconstrói exatamente R$ 6,50/L; valor editado à mão cai em "Informado manualmente". Tabela do resumo renderizada com as 3 colunas e a linha de hospedagem explicando o zero. Um teste intermediário acusou R$ 5,87/L — era inconsistência dos meus dados de teste, e foi o que motivou a faixa de plausibilidade. Sem erros de console.

### Pendências desta fase
- **Painel do Supabase (ação do dono):** rotacionar a chave anon legada e confirmar a janela de backup.
- **Fase 1** (não iniciada): mover as regras de viáticos para o backend com recálculo server-side, `withTx` + `FOR UPDATE`, guarda de status em `/fechar`, validação de chave em `/excesso-status`, parsers de dinheiro (A5/A6).

## 2026-07-29 — Auditoria completa do ERP + 3 correções

**Solicitação:** (1) por que "Valor em estoque" ficava R$ 0,00; (2) análise completa do sistema em busca de erros, bugs, melhorias e ideias.

**Relatório completo:** [auditoria-2026-07-29.md](auditoria-2026-07-29.md) — 24 achados classificados por severidade + 13 ideias de produto, com nível de evidência de cada um.

### Corrigido e verificado nesta sessão
1. **Valor em estoque zerado (A1):** o custo médio só era atualizado em compras; itens com entrada por *ajuste* ficavam com custo 0. Agora o preço de custo do cadastro vira o CMP inicial e o ajuste de entrada aceita custo unitário (entra na média ponderada). Testado: 5.000 → +2 un = R$ 10.000 → +1 un a 8.000 = CMP 6.000.
2. **Fuso horário (A2):** 14 usos de `toISOString()` faziam "hoje" virar o dia seguinte após 21h (função roda em UTC) — afetava vencimentos, horizontes do dashboard, status automático de viagem, *aging* e datas padrão dos formulários. Criados `hojeISO()`/`isoMaisDias()` com `America/Sao_Paulo`; `todayISO()` do frontend passou a usar o relógio local. Verificado no horário crítico (23:30 BRT → data correta).
3. **Auditoria do módulo Suprimentos (C4):** nenhuma ação de estoque/compra/envio/ajuste era registrada em `erp_audit_log` (lacuna introduzida quando o módulo foi criado). 7 entradas adicionadas ao `AUDIT_MAP`; confirmado no log.

### Principais achados em aberto (detalhes no relatório)
- **C1 (crítico):** rotas de anexo (`/api/attachments/*`) não aplicam `viaticosEscopo` — usuário com `viaticos: view` poderia baixar comprovantes de outros colaboradores trocando o id.
- **C2/C3 (crítico):** nenhuma transação no projeto (compra + Conta a Pagar podem divergir) e race condition no saldo de estoque (check-then-insert sem lock).
- **A3/A4/A5 (alto):** combustível do carro alugado usa o consumo do carro próprio; não há estorno/edição de movimentos; estoque mínimo 0 nunca alerta.
- Médios/baixos: paginação, índices, unicidade de SKU/CNPJ, anexos em `bytea`, `pool max`, sessão sem renovação, healthcheck, testes, CI, SRI nos CDNs, headers de segurança, arquivos monolíticos, migrações versionadas.

**Dados de teste:** todos criados durante a auditoria foram removidos (0 itens/movimentos/logs de teste). Nenhuma conta de produção foi criada ou alterada.

### Segunda passada (mesmo dia) — cobertura do frontend concluída
Ao ser questionado se a análise estava completa, revi a cobertura: o backend havia sido auditado de forma sistemática, mas no frontend só Suprimentos, Viáticos/PDF, navegação e helpers foram lidos a fundo. Completei a revisão das telas financeiras — Dashboard, Contas a Pagar/Receber, Fluxo de Caixa, Conciliação, Orçamento Anual, Orçado × Realizado, Relatórios Gerenciais, importação do Flash, Categorias/Config, exportações e CSS. **12 achados novos** (Parte 2 do relatório), com destaque para:
- **F1 (alto):** na grade do Orçamento Anual, digitar `1234.50` (ponto como decimal) grava **123.450,00** — o helper `num()` remove todos os pontos. Silencioso, e o orçamento alimenta o Orçado × Realizado e os alertas do Dashboard. (Contas a Pagar/Receber usam `input type=number` e não sofrem disso.)
- **F2/F3/F4 (médios):** edições não salvas do orçamento descartadas sem aviso; importação do Flash duplica lançamentos se o arquivo for importado 2× e silencia os erros individuais; importação faz um POST por linha.
- **Baixos:** revogação prematura do blob no CSV, KPI "maior desvio" sempre vermelho (mesmo quando é economia), código morto na grade do orçamento, `confirm()` nativo em 1 ponto, acessibilidade (poucos `aria-*`), paleta de 11 cores nos gráficos, conciliação carregando todos os títulos para um KPI, categoria de Suprimentos em texto livre fora da lista gerenciada.

Também registrei o que foi verificado e está **correto** (rename de categoria propaga para o histórico; DRE em regime de caixa consistente; critério rigoroso do KPI de conciliação; CSV com BOM/`;` para Excel BR; nenhum XSS) e o que segue **fora de escopo** (testes clicando na interface, medição de performance com `EXPLAIN`, conferência das regras de negócio contra a política interna).

## 2026-07-28 — Cadastro de item detalhado (Suprimentos)

**Solicitação:** ampliar o "Novo item" com identificação básica, classificação, logística/estoque, financeiro, fiscal (NCM/CEST/origem) e rastreabilidade (nº de série).

### Modelo de dados (migração `estoque_itens_campos_detalhados`)
- Novas colunas em `erp_estoque_itens`: `descricao`, `subcategoria`, `marca`, `estoque_maximo`, `peso_liquido`, `peso_bruto`, `dim_altura/largura/profundidade`, `preco_ultima_compra`, `ncm`, `cest`, `origem_mercadoria`, `numero_serie`. Refletido em `supabase/schema.sql`.

### Backend (`api/index.js`)
- `validItemEstoque` valida NCM (8 díg.), CEST (7 díg.), não-negativos e máx ≥ mín. `itemValues` monta as colunas (nomes fixos internos) para INSERT/UPDATE dinâmicos. `preco_ultima_compra` é atualizado automaticamente a cada compra (junto do custo médio).

### Frontend (`app.js` + `styles.css`)
- `supFormItem` reescrito em 6 seções (modal wide) + textarea de descrição + select de origem (tabela B do SPED). Nova **Ficha do item** (`supFichaItem`, só leitura) acessível por botão na tabela — disponível inclusive para usuários só-leitura. Quantidade em estoque exibida como somente-leitura (gerida por movimentações).

### Verificação (dados de teste criados e REMOVIDOS)
- **Importante:** o dev server não faz hot-reload — foi necessário reiniciá-lo para carregar o novo backend (na 1ª tentativa os campos voltaram null). Após reiniciar: NCM "123" → erro; CEST "12" → erro; máx<mín → erro; item completo criado e **todos os campos persistiram** (marca, subcategoria, NCM, origem, pesos, dimensões, preço, série, estoque máximo). Itens de teste apagados (0 restantes). Frontend: 6 seções presentes, 14 campos-chave, select de origem com 10 opções, Ficha renderizando dimensões/origem/série. Sem erros de console; `node --check` OK.

## 2026-07-30 — Menu lateral: densidade e agrupamento

**Solicitação:** o menu lateral estava grande e com UX ruim.

**Diagnóstico medido (1366×720):** conteúdo de **787px** em 587px de área útil → excedia 200px e forçava rolagem no menu. Dos 787px, **196px (25%) eram apenas títulos de seção**, e duas seções tinham um único item ("Visão geral" só com o Dashboard; "Suprimentos" sozinho).

### O que mudou
- **Agrupamento (`public/app.js`, `PAGES`):** de 6 rótulos para 4. Dashboard abre a lista sem título; "Movimentação" virou **Financeiro**; Viáticos saiu de Planejamento e foi com Suprimentos para **Operações**; o subtítulo "Cadastros" saiu (os itens ficaram diretos em Administração). Nada foi escondido nem virou clique extra.
- **Densidade (`public/styles.css`):** item 38,3 → 32,3px; título de seção 33,8 → 28px; logo 72,5 → 63px; rodapé do usuário 61 → 53px.
- **Mobile:** a media query de 980px repetia os paddings antigos e desfazia a compactação no celular — valores alinhados (comentário no CSS alerta para manter os dois lados iguais).

### Verificação
- Conteúdo: **787 → 592px (−25%)**; títulos: 196 → 112px (−43%). Sem rolagem em 720/768/900/1080px de altura (em 700px sobra 7px, tela fora do uso real).
- Item ativo mantém destaque (fundo verde, texto branco, 32,3px de altura — dentro do padrão de 32–40px para desktop).
- Modo recolhido intacto: 64px, rótulos e títulos ocultos, sem rolagem.
- **Falso positivo investigado:** o modo recolhido media 236px nos testes. Causa: a aba em background não avança transições CSS (`transition: width .18s`), então o valor ficava preso no inicial. Com a transição desligada, mede 64px — **não era bug**.
- Sem erros de console.

## 2026-07-30 — Lançamento da Solicitação de Viáticos (autosserviço) dentro de Viáticos

**Solicitação:** tirar `#via-solicitar` do modo "escondido" e colocar no ar, **embutida dentro da tela Viáticos** (não como rota solta) — o acesso do colaborador será restrito à página Viáticos.

**Pré-requisito de segurança apontado antes de abrir:** a auditoria (achado A4) registrou que o servidor aceitava a previsão de valores calculada no navegador sem recalcular contra a TUD. Enquanto só o dono do sistema usava, não importava; abrindo para colaboradores, um POST direto à API poderia inflar a previsão. Implementado o recálculo server-side **antes** de liberar o acesso.

### Backend (`api/index.js`)
- `requireAutosservico` virou passthrough (sem mais gate por super-admin/env var) — a rota inteira agora depende só de `requireAuth` + vínculo com colaborador ativo.
- **`viaRecalcularPrevisao(b, colab, tud)`** (nova): recalcula `categoria_local` (duplicando a pequena tabela de capitais do front, comentado que precisa ficar em sincronia — não há bundler/módulo compartilhado no projeto) e `previsao_por_categoria` a partir dos itens BRUTOS enviados (destinos, período, itens de transporte), nunca dos totais que o cliente já somou. Reaplica a mesma regra de hospedagem-na-cidade-sede do achado A1 (`viaHospedagemDevidaServer`).
- `POST /api/viaticos/solicitacoes/autosservico`: `categoria_local` e `previsao_por_categoria` do payload são ignorados para gravação — o que fica salvo é sempre o recálculo do servidor. `valor_liberado` continua sempre `0` (like antes).

### Frontend (`public/app.js` + `styles.css`)
- Rota `#via-solicitar` removida como tela própria; um acesso a ela agora seta uma flag e redireciona para `#viaticos`, abrindo o assistente sozinho (compatibilidade com bookmarks antigos).
- `renderViaticos()` busca `GET /api/viaticos/autosservico/meu-colaborador` em paralelo (404 tratado como "sem vínculo", silencioso) e mostra o botão **"✈️ Solicitar viagem"** quando há vínculo — inclusive para usuário `READONLY` (autosserviço da própria viagem é diferente de editar dados de terceiros).
- Assistente ganhou um link **"← Voltar para Viáticos"** (visível em todas as etapas, com confirmação antes de descartar) e o envio final retorna para `renderViaticos()` em vez de reiniciar o assistente.

### Verificação
- **Recálculo server-side** testado via API com JWT real contra um payload deliberadamente malicioso (`previsao_por_categoria` inflada + `categoria_local` forjada): o servidor gravou o valor recalculado correto e ignorou por completo os campos injetados. Registro de teste removido do banco.
- **Frontend** testado no navegador com sessão real (cookie válido): botão aparece, assistente abre com os dados do colaborador, "Voltar para Viáticos" funciona (com confirm), e o redirecionamento de `#via-solicitar` para `#viaticos` abre o assistente sozinho.
- Dois falsos alarmes descartados durante o teste, documentados para não confundir sessões futuras: (1) o modo recolhido do menu media 236px por causa de transições CSS não avançarem em aba de background — não é bug; (2) checar `window.USER` sempre dá `false` porque a variável real é `let USER` de escopo de módulo, que não vira propriedade de `window` — a variável correta (`USER` "nua") sempre esteve certa.
- Sem erros de console; `node --check` OK nos dois arquivos.

### Documento de auditoria atualizado
`AUDITORIA_ERP_2026-07-29.md` — achado **A4 marcado como fechado** (estava "contido" desde a Fase 0).

## 2026-07-31 — Cadastro de colaborador: município da cidade-base em lista suspensa

**Solicitação:** o campo "Município (cidade-base)" era de digitação livre; trocar por lista suspensa filtrada pelo estado, para evitar erro de digitação.

### Implementação (`public/app.js`, `formEditarColaborador`)
- Campo virou `<select>` (reaproveitando o dataset `BR_LOCALIDADES.municipios`, já usado no cadastro de destinos da viagem).
- Cascata: ao escolher/trocar o Estado, a lista de municípios é populada; se o UF selecionado for o mesmo já salvo, o município atual vem pré-selecionado — trocar de estado limpa a seleção.

**Por que importa:** a regra de "viagem na própria cidade-sede não gera hospedagem" (`viaHospedagemDevida`) compara o texto do município cadastrado com o do destino da viagem. Erro de digitação/acento no cadastro livre faria essa comparação falhar silenciosamente e cobrar hospedagem indevida (ou o contrário).

### Verificação
- Colaborador com cidade-base já cadastrada (PR/Marialva): select carrega 399 municípios do PR e vem com "Marialva" pré-selecionado.
- Trocar o estado para SP: lista atualiza para 645 municípios, "São Paulo" presente, "Marialva" não aparece mais.
- Colaborador novo (sem cidade-base): mostra "— escolha o estado primeiro —" até um UF ser selecionado.
- Sem erros de console; `node --check` OK.

## 2026-08-04 — Correção: data quebrando em duas linhas no PDF de Contas a Pagar

**Solicitação:** no relatório PDF de Contas a Pagar, a data de vencimento ("07/08/2026") estava quebrando em duas linhas na coluna "Venc.".

**Causa:** `exportPagarPDF` (`public/app.js`) fixava a coluna "Venc." em 18mm; medido com `doc.getTextWidth()` na mesma fonte/tamanho usados no PDF (Helvetica 8pt), a data + padding da célula precisam de 18,4mm — 0,4mm a mais do que a coluna tinha, forçando a quebra.

**Correção:** largura da coluna "Venc." de 18mm para 22mm (mesma largura já usada na coluna "Valor", ao lado). Sobra 3,6mm de folga; o total da tabela cresce só 4mm, sem risco de estourar a página A4 paisagem (273mm úteis).

### Verificação
- Sem executar a geração do PDF (que termina em `doc.save`, disparando download): medição isolada com `doc.getTextWidth()` no mesmo jsPDF/fonte/tamanho, para 3 datas diferentes — todas cabem nos novos 22mm, nenhuma cabia nos 18mm antigos. Sem erros de console; `node --check` OK.

## 2026-08-04 — Correção: data quebrando em duas linhas na tela de Contas a Pagar

**Solicitação:** na tabela de Contas a Pagar (tela, não o PDF), a data de vencimento quebrava em duas linhas com o menu aberto ou recolhido.

**Causa:** `.tbl-pagar` usa `table-layout: fixed` com a coluna "Vencimento" em 7% da largura da tabela; a regra genérica de célula (`white-space: normal`) permite quebra — ao contrário das colunas de ID e Valor, que já tinham `nowrap` dedicado.

**Correção:**
- `public/styles.css`: nova classe `.tbl-pagar td.venc-cell { white-space: nowrap }`; coluna "Vencimento" de 7% para 8% (compensado tirando 1% de "Fornecedor", de 17% para 16% — soma das colunas continua 100%).
- `public/app.js`: célula da data em `renderPagar` ganhou a classe `venc-cell`. Aproveitado para adicionar `nowrap` também na data de Contas a Receber (`renderReceber`), por consistência preventiva (tabela sem `table-layout: fixed`, risco menor, mas mesmo princípio).

### Verificação
- Estrutura real da tabela injetada no DOM com os 3 títulos do print do usuário, nos dois estados do menu (expandido e recolhido): `cell.getClientRects().length === 1` nos dois casos — confirma que a data ("07/08/2026") renderiza numa única linha. Sem erros de console; `node --check` OK.

## 2026-08-04 — Novo módulo: Gestão de Contratos

**Solicitação:** gerenciar fornecedores com vínculo recorrente (aluguel, contabilidade, meteorologia etc.), com geração automática das parcelas em Contas a Pagar.

**Decisões (via perguntas ao usuário):** (1) geração automática permitida, com atenção especial à duplicidade — o usuário já tinha parcelas lançadas manualmente até dezembro/2026; (2) alerta focado em vencimento/renovação do contrato; (3) página própria "Contratos" no menu (não uma aba dentro de Fornecedores).

### Proteção contra duplicidade (dupla camada)
1. **Portão de entrada (`proxima_geracao`):** o usuário define a partir de que data o sistema pode gerar sozinho. Quem já lançou manualmente até dez/2026 define essa data para jan/2027 — nada anterior é tocado.
2. **Trava no banco:** índice único parcial `(contract_id, due_date) WHERE contract_id IS NOT NULL` em `erp_payables`; o INSERT usa `ON CONFLICT DO NOTHING`, garantindo idempotência mesmo sob chamadas concorrentes.

### Modelo de dados (migração `gestao_contratos`)
- `erp_contratos`: fornecedor, título, categoria, centro de custo, valor da parcela, periodicidade (mensal/bimestral/trimestral/semestral/anual), vigência (início/fim opcional), renovação automática (informativo), `gerar_parcelas` + `proxima_geracao`, documento, observações, status (ativo/suspenso/encerrado).
- `erp_payables.contract_id`: vincula a parcela gerada ao contrato de origem.
- Refletido em `supabase/schema.sql` (nota: o arquivo já tinha drift anterior — `payment_method`/`pix_key` ausentes — não reconciliado agora, fora de escopo).

### Backend (`api/index.js`)
- `contratos` no whitelist `PERM_PAGES`. Rotas `/api/contratos/*`: listar (dispara `gerarParcelasPendentes` — mesmo padrão do status automático de viáticos), criar, editar, mudar status, **gerar agora** (bypassa o horizonte de 5 dias, gera 1 parcela por clique) e excluir (bloqueado se já houver parcela gerada — mesmo padrão de Fornecedores).
- `gerarParcelasPendentes()`: gera parcelas com vencimento nos próximos 5 dias para contratos ativos com geração automática ligada, avançando `proxima_geracao` a cada ciclo (`proximoCiclo`, com correção de mês curto — dia 31 rolando para o último dia do mês seguinte).
- Auditoria: 5 ações registradas em `AUDIT_MAP`.

### Frontend (`app.js`)
- Página "Contratos" (ícone de documento com check) logo após Fornecedores no menu; permissão de acesso configurável por usuário (aparece automaticamente no editor de permissões, que itera `PERM_PAGES`).
- KPIs (ativos, valor recorrente equivalente mensal, vencendo em 60 dias) + alerta de vencimento/renovação; tabela com ações (Gerar agora, Editar, Suspender/Reativar, Encerrar, Excluir quando sem parcela).
- Formulário com sugestão automática da 1ª data de geração (início + 1 ciclo), texto explícito orientando a ajustar para pular parcelas já lançadas manualmente.

### Verificação (dados de teste criados e REMOVIDOS do banco)
- **Bug pego e corrigido durante o teste:** a sugestão de "próxima geração" só atualizava o campo se estivesse vazio — como a 1ª sugestão já o preenche, trocar depois Início/Periodicidade não recalculava mais nada (ficava desatualizado em silêncio). Corrigido com uma flag "campo tocado pelo usuário": atualiza automaticamente até o usuário editar à mão; a partir daí, respeita o valor manual.
- Via API: validações (sem fornecedor, sem `proxima_geracao` com geração ligada); contrato com vencimento em 2030 **não gerou nada** no GET (fora do horizonte de 5 dias); contrato com vencimento hoje gerou exatamente 1 parcela e avançou o ciclo; **2º GET não duplicou** (idempotência confirmada); "gerar agora" bypassa o horizonte e avança 1 ciclo por clique; contrato com `data_fim` vencida recusa gerar; exclusão bloqueada quando há parcela vinculada (409); toggle de status; log de auditoria cobrindo todas as ações.
- Via UI (sessão real autenticada): contrato criado pelo formulário aparece corretamente na tabela e nos KPIs; "Gerar agora" e "Suspender" confirmados no servidor (o teste inicial só não esperou o re-render assíncrono — não era bug real).
- Todos os contratos, parcelas e logs de teste foram apagados do banco (confirmado: 0 restantes). Sem erros de console; `node --check` OK nos dois arquivos.

## 2026-08-04 — Preço do combustível automático via ANP (+ margem discriminada)

**Solicitação:** o preço do combustível usado no cálculo de rota (Viáticos) deveria vir automaticamente da ANP, sem depender de preenchimento manual, com 10% de margem sobre o valor da ANP — e discriminar todos os valores na tela.

### Pesquisa prévia (antes de implementar)
A ANP não tem uma API JSON pública e estável. O dado oficial é publicado semanalmente (domingo–sábado) como planilha XLSX em URL previsível:
`https://www.gov.br/anp/.../arquivos-lpc/{ano}/resumo_semanal_lpc_{inicio}_{fim}.xlsx`, com uma aba "BRASIL" contendo a linha `GASOLINA COMUM` (preço médio nacional). Confirmado via `curl` real (200 OK, XLSX genuíno) e leitura da planilha. Adotado **Gasolina Comum** como referência (o cadastro de veículo não distingue combustível; o usuário pode pedir troca se a frota for a diesel/etanol).

**Dependência:** `xlsx` (SheetJS) precisou ser instalada para o parsing no backend. A versão do npm (0.18.5, mesma já usada no frontend via CDN) tem 2 vulnerabilidades conhecidas de alta severidade (Prototype Pollution CVE-2023-30533, ReDoS) sem correção publicada no npm — a SheetJS move os builds corrigidos para o CDN próprio. Instalada a versão corrigida direto de `cdn.sheetjs.com` (`xlsx@0.20.3`, acima do piso de correção das duas CVEs) — `npm audit` confirma 0 vulnerabilidades.

### Backend (`api/index.js`)
- `buscarPrecoANP()`: calcula a última semana (dom–sáb) já concluída, monta a URL, baixa e faz parse da aba BRASIL; se a semana ainda não foi publicada, recua semana a semana (até 6 tentativas).
- `atualizarPrecoANPSeNecessario(forcar)`: só rebusca se desatualizado (> 3 dias) ou se forçado. Em falha automática, **mantém o último valor bom** e só registra o erro para diagnóstico (nunca deixa o cálculo de rota sem preço); em falha forçada (botão manual), propaga o erro ao usuário.
- `GET /api/viaticos/config`: dispara a checagem de atualização e devolve o detalhamento completo (valor ANP, margem, preço final, semana de referência, data de atualização, erro se houver).
- `POST /api/viaticos/config/atualizar-anp` (novo): força a busca agora, ignorando a janela de 3 dias.
- `PUT /api/viaticos/config`: repropósito — agora ajusta só a **margem** (não mais o preço final digitado); o preço final é sempre recalculado a partir do último valor bruto da ANP.
- Migração `combustivel_anp_automatico`: novas colunas em `erp_viaticos_config` (`combustivel_anp_valor`, `combustivel_margem_pct` default 10, `combustivel_anp_semana_fim`, `combustivel_anp_atualizado_em`, `combustivel_anp_erro`). Não refletido em `schema.sql` — a tabela já não constava lá (drift anterior).

### Frontend (`app.js`)
- Painel "Combustível — preço automático (ANP)" em Viáticos → Configurações: tabela com os 3 valores discriminados (ANP, margem, final), data/semana de referência, alerta se a última busca falhou, botões "Salvar margem" e "Atualizar agora" (com feedback "Buscando na ANP…"). Campo de digitação manual do preço final foi removido.

### Verificação (dados reais — sem dados de teste a limpar; o valor real de produção FOI atualizado de propósito, é a própria feature)
- Busca real executada contra o site da ANP: retornou R$ 6,56/L (Gasolina Comum, semana encerrada em 01/08/2026) — confirmado como o valor real vigente. Preço final calculado: 6,56 × 1,10 = **R$ 7,22** (bate com o cálculo manual).
- 2ª chamada ao GET não rebuscou (mesmo timestamp de atualização) — cache de 3 dias funcionando.
- Validação de margem (negativa e > 200 rejeitadas); troca de margem para 15% recalculou sem rebuscar a ANP (7,54 = 6,56×1,15); "Atualizar agora" rebuscou de fato (novo timestamp) e **preservou** a margem configurada (não voltou para 10% sozinho). Margem devolvida a 10% ao final do teste (único ajuste revertido — os demais valores são o estado real desejado).
- Log de auditoria cobrindo as 3 ações (ajuste de margem, atualização manual, atualização automática).
- Frontend testado com sessão real autenticada: painel renderiza os 3 valores corretos, sem o campo antigo de preço manual; botão "Atualizar agora" muda para "Buscando na ANP…" durante a chamada e reabre o modal com os dados atualizados. Sem erros de console; `node --check` OK nos dois arquivos.

## 2026-08-10 — Correção: status das ordens de Viáticos não avançava sozinho

**Problema reportado:** ordens com o período já encerrado continuavam em "Transferência Agendada" (e uma em "Liberado", outra em "Em viagem"). Regra de negócio esclarecida pelo usuário: **"Transferência Agendada" é o único status marcado à mão** (o agendamento é feito na plataforma do Flash); todos os outros devem seguir as datas automaticamente.

**Causa raiz (confirmada no banco antes de alterar):** a rotina automática tinha `WHERE status_manual = false`. Como `POST /:id/status` grava `status_manual = true` em qualquer ajuste manual, marcar "Transferência Agendada" **congelava o registro para sempre**. Evidência: os 6 registros errados tinham `status_manual = true`; os 2 corretos tinham `false` — correlação perfeita.

### Correção (`api/index.js`, rotina no `GET /api/viaticos/solicitacoes`)
- Removida a trava por `status_manual`: a faixa de status por calendário (`liberado`, `em_viagem`, `aguardando_comprovacao`, `transferencia_agendada`) volta a ser sempre recalculada pelas datas.
- `transferencia_agendada` é preservada **enquanto a viagem não começou** (`hoje < data_inicio`) — é a marcação manual do Flash. A partir da data de início, o registro volta a seguir o calendário.
- `status_manual` é resetado para `false` quando a regra assume o registro, para a tela não seguir exibindo "definido manualmente".
- `em_approvals` continua fora da faixa (é decisão de aprovação, não de calendário) — marcação manual ali segue preservada.
- Ganho extra: o `UPDATE` agora tem `AND status <> <status calculado>`, então não grava nada quando não há mudança (antes reescrevia as linhas a cada abertura da tela — apontado na auditoria de 29/07).

### Verificação
- **Dados reais corrigidos:** os 6 registros presos passaram para `aguardando_comprovacao` com `status_manual=false` (ids 38, 42, 43, 46, 48, 55).
- **3 casos de teste** criados no banco e removidos depois: (A) transferência agendada em viagem futura → **preservada** com `manual=true`; (B) "liberado" manual em viagem em andamento → `em_viagem`; (C) transferência agendada em viagem em andamento → `em_viagem`.
- **Eficiência:** após a rotina rodar, a consulta que simula o `WHERE` retorna **0 linhas** — confirma que não há escrita desnecessária a cada GET.
- Dados de teste removidos (0 restantes); `node --check` OK.

**Observação levada ao usuário:** a solicitação id=41 (Marcelo, 15/06/2026) está com `data_fim = 3000-12-31`, o que a mantém eternamente "Em viagem". Parece erro de digitação — não alterado sem autorização.

## 2026-08-10 — Correção: importação do Flash não trazia dados (arquivo em espanhol)

**Problema reportado:** ao importar o arquivo de despesas da OT 156 ("Comprobación de Viáticos … Gustavo do Amaral.xlsx"), a tela não trazia nenhum dado — e **sem nenhuma mensagem**.

### Duas falhas encontradas (ambas reproduzidas antes de corrigir)
1. **Descarte silencioso:** em `importarFlashModal`, `if (!rows.length) { box.innerHTML = avisosHtml; return; }` deixava a área vazia quando o arquivo era lido mas nenhuma linha passava pelos filtros. O usuário não tinha como saber se o arquivo estava errado ou se o sistema falhou.
2. **Parser assumia formato brasileiro.** O arquivo vem da conta do Flash da matriz, em espanhol:
   - Cabeçalhos `Fecha`/`Movimiento`/`Importe` não eram reconhecidos (buscava só `data`/`movimenta`/`valor`) → erro em toast que desaparece;
   - Valor em formato mexicano `1,250.50` virava `NaN` → **todas as linhas descartadas** → tela em branco (este é o sintoma exato do print).

Reprodução registrada: planilha pt-BR → 2 linhas OK; cabeçalho es → "CABECALHO NAO RECONHECIDO"; valor `1,250.50` → 0 linhas com `descartes.semValor = 1`.

### Correção (`public/app.js`)
- **`flashParseValor`** (nova): interpreta o valor sem assumir idioma. Havendo vírgula e ponto, o separador que aparece por último é o decimal; havendo só um, 3 dígitos depois indicam milhar (`1.250` = 1250) e 1–2 dígitos indicam decimal (`250.50`). Também remove símbolos de moeda (R$, $, MXN/BRL/USD) e usa valor absoluto.
- **`flashParseData`** (nova): aceita `Date`, `dd/mm/aaaa`, `dd-mm-aaaa`, `aaaa-mm-dd`, `dd/mm/aa` e o número serial do Excel.
- **`FLASH_COLUNAS`**: rótulos aceitos em pt-BR e es-MX (data/fecha; movimenta/movimient/concepto/descri; valor/importe/monto; pessoa/persona/colaborador/empleado; presta/rendi/estado/situa). Cabeçalho procurado nas 15 primeiras linhas (era 10).
- **`FLASH_STATUS_OK`**: situações aceitas como concluídas em pt e es (finaliz, aprovad/aprobad, conclu, complet, pago/pagad) — `Pendiente`/`Rechazado` seguem descartados.
- **`flashDiagnosticoHtml`** (nova): quando nada é importado, a tela passa a mostrar aba lida (e quantas abas o arquivo tem), linhas encontradas, colunas identificadas, contagem de descartes por motivo e exemplos concretos. O erro de cabeçalho também exibe as primeiras linhas do arquivo, para identificar o formato na hora.
- `parseFlashXLSX` passou a retornar `{ linhas, diag }` (chamador atualizado); o `catch` escreve o erro **na tela**, não só num toast.

### Verificação
- **34 casos unitários** nas funções reais extraídas do arquivo (não reimplementadas): 12 formatos de valor, 9 de data, 3 cabeçalhos (pt-BR, es-MX e variante `Fecha de gasto`/`Concepto`/`Monto`), 10 situações de status — todos corretos.
- **Ponta a ponta no navegador**, com 3 planilhas `.xlsx` reais geradas e carregadas via File API: pt-BR → 2 linhas (baseline preservado); **es-MX com `1,250.50` → 2 linhas importadas com valor correto** e a linha `Pendiente` descartada; planilha com cabeçalho inválido → erro claro com as primeiras linhas do arquivo.
- Diagnóstico visual conferido: menciona aba, nº de linhas, colunas, descartes e exemplos.
- Arquivos temporários de teste removidos; `node --check` OK.

**Observação:** a correção cobre os formatos mais prováveis, mas não vi o arquivo real da OT 156. Se ainda não importar, a tela agora dirá exatamente o motivo (colunas lidas e descartes) — basta enviar essa mensagem.

---

## 2026-08-11 — Solicitação de Aporte no Fluxo de Caixa (PDF + Excel, Resumido/Completo)

**Pedido:** dentro de Fluxo de Caixa, poder gerar uma solicitação de aporte à matriz **de acordo com os filtros aplicados** — 01/08 a 31/08 pede R$ 244.208,72; 01/08 a 30/09 pede R$ 652.071,50 — com PDF e Excel, nas opções Resumido e Completo.

### Backend (`api/index.js`, `/api/reports/fluxo-caixa`)
O endpoint já calculava um `alerta` olhando **90 dias fixos à frente**, o que não responde ao pedido: o valor precisa refletir a janela filtrada. Foi adicionado um objeto `aporte` calculado **dentro do período**:

- varre cada dia do intervalo com o `saldoNaData()` já existente e guarda o **pior saldo** e **o dia em que ele ocorre**;
- `necessario` = valor absoluto do pior saldo quando negativo (zero se o caixa nunca fica negativo);
- devolve também `saldoFinalPeriodo`, para o documento mostrar como o mês fecha depois do aporte.

O `alerta` de 90 dias foi mantido — passou a ser usado como **aviso de horizonte** no modal (ver abaixo), não como o valor do pedido.

### Frontend (`public/app.js`)
- Botão **"💰 Solicitar aporte"** na barra de ferramentas do Fluxo de Caixa, ao lado das exportações; usa exatamente o `d` (payload) do filtro em tela — nenhuma segunda consulta, nenhum recálculo no cliente.
- Modal `abrirSolicitacaoAporte(d)`: tabela com **pior momento de caixa**, **saldo no pior momento** e **aporte necessário no período**; valor já preenchido e editável (o usuário pode arredondar para cima), solicitante preenchido com o usuário logado e campo de justificativa.
- **Aviso de horizonte:** se a necessidade de 90 dias for maior que a do período filtrado, o modal alerta com os dois números e sugere ampliar o pedido — evita pedir R$ 244 mil hoje e precisar de mais R$ 400 mil em setembro.
- Quatro geradores: `aportePDF` e `aporteExcel`, cada um em Resumido e Completo, na mesma linguagem visual dos outros relatórios (cabeçalho ProAgro, moeda pt-BR, jsPDF + autotable / SheetJS).
  - **Resumido:** identificação, período, valor solicitado, pior momento, saldo final projetado, solicitante e justificativa.
  - **Completo:** o resumido + evolução do saldo dia a dia, quebra por categoria e a relação de títulos pendentes que compõem a necessidade.

### Verificação
- Backend conferido contra os números do próprio pedido: **31/08 → R$ 244.208,72** (pior dia 30/08) e **30/09 → R$ 652.071,50** (pior dia 30/09), **iguais aos informados**, e estáveis nas granularidades dia/semana/mês.
- Ponta a ponta no navegador com dados reais da API: os 4 documentos foram gerados sem erro; abas do Excel corretas (`Solicitação` no resumido; `Solicitação`, `Evolução do saldo`, `Por categoria`, `Títulos pendentes` no completo).
- Modal conferido nos dois filtros: tabela, valor pré-preenchido, solicitante e a coleta dos campos editados; o aviso de 90 dias aparece no filtro de agosto e **não** aparece no de setembro (correto, pois lá o período já cobre o pior cenário).
- `node --check` OK nos dois arquivos.

### Registro de uma falha minha
Durante o teste de geração, **dois PDFs de teste foram efetivamente baixados** para a pasta Downloads do usuário (arquivos `.tmp` de 138 KB e 47 KB). Eu havia tentado bloquear o download por dois caminhos e **ambos falharam**, por motivos que só descobri depois:
- sobrescrever `doc.save` no *prototype* não funciona — no jsPDF `save` é **propriedade própria da instância**;
- interceptar `HTMLAnchorElement.prototype.click` e `window.open` não funciona — o FileSaver dispara `dispatchEvent(new MouseEvent('click'))`, que não passa por `.click()`.

Os dois arquivos foram identificados com certeza (PDFs contendo "Solicitação"/"Aporte", gravados um minuto antes) e **removidos**. **Regra para as próximas vezes:** não invocar o caminho de salvamento em teste. Validar a montagem do documento (dados, tabelas, formatação) sem chamar `save`/`writeFile`; a interceptação por fora não é confiável.

---

## 2026-08-11 — Solicitação via autosserviço aparecia zerada (Liberado R$ 0,00)

**Problema reportado:** solicitação feita pelo botão "Solicitar viagem" (OT 35, em nome do próprio usuário); ao mudar o status para "Transferência Agendada", o valor não apareceu na coluna **Liberado** nem no detalhe aberto pelo botão **Comprovar**.

### Investigação (SELECT em produção, sem alterar nada)
Registro id 62 / OT 35:
```
origem: colaborador   status: transferencia_agendada
valor_solicitado: NULL      valor_liberado: 0.00
previsao_por_categoria: { taxi_uber: 555, alimentacao: 420 }
```
O cálculo estava **correto** — alimentação R$ 140 × 3 dias = 420, táxi (85+100) × 3 = 555, total **R$ 975,00**; hospedagem zero porque a base do colaborador e o destino são ambos São Paulo/SP (regra de hospedagem só quando há pernoite fora da cidade base). O valor simplesmente **não era gravado nem exibido em lugar nenhum**.

### Três defeitos encontrados
1. **`api/index.js:1925` — o INSERT do autosserviço não gravava `valor_solicitado`.** O total ficava apenas dentro de `previsao_por_categoria`, um JSONB que nenhuma tela lia. A solicitação nascia sem valor visível.
2. **`public/app.js` — a lista não tinha coluna "Solicitado".** Mostrava só `valor_liberado`, que legitimamente é 0 até a Tesouraria transferir no Flash. Resultado: solicitação legítima parecendo vazia.
3. **`POST /:id/status` não pedia o valor liberado.** Como a transferência é feita na plataforma do Flash, agendar é justamente o momento em que o valor passa a existir — mas a tela mudava só o status, deixando `valor_liberado` em 0 e sem como fechar a comprovação depois.

### Correções
- **Backend:** o autosserviço passa a gravar `valor_solicitado` = soma da previsão recalculada no servidor (o recálculo servidor-side do achado A4 continua sendo a fonte da verdade; `valor_liberado` segue 0 de propósito). A rota de status aceita `valor_liberado` opcional, **somente** na transição para `transferencia_agendada`, com validação de número ≥ 0; o log de auditoria passa a registrar o valor junto da mudança de status.
- **Frontend:** helper `viaTotalSolicitado(s)` — usa `valor_solicitado` e, quando vazio, soma `previsao_por_categoria`, de modo que **as solicitações já existentes passam a exibir o valor sem precisar migrar o banco**. Nova coluna **Solicitado** na lista, com "a transferir" sob o Liberado zerado. No detalhe: KPI **Solicitado** + bloco **Memória de cálculo** (valor por categoria e total) que antes ficava invisível. Ao escolher "Transferência Agendada" com Liberado zerado, abre modal pedindo o valor transferido, pré-preenchido com o solicitado e com a opção de deixar zerado. O campo "Valor solicitado" do formulário de edição passou a vir pré-preenchido com o total calculado (antes vinha vazio nos registros antigos).

### Verificação
- Telas testadas ponta a ponta com o **registro real da OT 35 exportado do banco** e injetado via stub do `api` (o stub **bloqueia qualquer POST/PUT**, então nada foi gravado): lista mostra **Solicitado R$ 975,00** / Liberado R$ 0,00 "a transferir", com cabeçalho e corpo alinhados em 9 colunas; detalhe mostra os 4 KPIs e a memória "Táxis/Uber R$ 555,00 · Alimentação R$ 420,00 · Total R$ 975,00".
- Modal de agendamento: título e texto corretos, campo pré-preenchido com 975, **valor negativo recusado sem chamar a API**, e o payload capturado foi exatamente `POST /api/viaticos/solicitacoes/62/status { status: 'transferencia_agendada', valor_liberado: 975 }`.
- SQL novo validado com **`PREPARE`/`DEALLOCATE`** (o Postgres analisa a instrução sem executá-la): INSERT com 14 parâmetros e `valor_solicitado` como `numeric` na posição 10; UPDATE com 3 parâmetros. Nenhum dado inserido ou alterado.
- `node --check` OK nos dois arquivos; arquivos de teste removidos.

**Não alterado:** o registro id 62 continua com `valor_solicitado` NULL no banco — a tela já exibe R$ 975,00 pelo fallback, e o campo é gravado na primeira vez que a solicitação for salva em "Editar". Um UPDATE de backfill não foi executado por não ter autorização para escrever em produção.

---

## 2026-08-11 — Card do combustível (ANP) ocupando a largura toda das Configurações

**Pedido:** expandir o quadro do preço automático da ANP para preencher o espaço vazio à direita, na tela de Configurações de Viáticos.

**Causa:** o card tinha `max-width:520px` fixo, dentro de um modal `modal-wide` de 900px (≈856px úteis) — sobravam ~336px vazios à direita.

### Mudança
- Removido o `max-width`; o card passa a usar a largura disponível.
- Os três valores saíram da tabela estreita (`via-resumo-tbl`, que empilhava as linhas e quebrava o rótulo "Preço médio ANP (Gasolina Comum, Brasil)" em três linhas) e foram para **três colunas lado a lado**: preço da ANP · margem de segurança · preço final. O preço final continua destacado em verde, agora como bloco próprio.
- Rodapé reorganizado: a data da última atualização à esquerda e os botões "Salvar margem" / "Atualizar agora" à direita, na mesma linha.
- Novas classes em `styles.css` (`.anp-card`, `.anp-grid`, `.anp-box`, `.anp-margem`, `.anp-rodape`), com números em `tabular-nums` e as três colunas virando uma só abaixo de 720px.

### Verificação
Medido no navegador com a tela renderizada:
- card em **856px = exatamente o espaço útil do modal, zero sobra** (era 520px);
- três colunas de ~265px, mesma altura, **sem vazamento horizontal** em nenhuma delas, e os valores cabendo numa linha;
- rodapé com data e botões na mesma linha;
- estado **"ainda não buscado"** (ANP nunca consultada, com erro na última tentativa) conferido: layout intacto, alerta de falha aparecendo, preço final como "—";
- **mobile 375px**: as três colunas empilham (`grid-template-columns: 257px`), rodapé empilha, e a página **não rola lateralmente**;
- console sem erros de layout ou JS.

---

## 2026-08-11 — Documentos do colaborador: anexos, validadores e seção de apólice

**Pedido:** ampliar a caixa de "Editar colaborador" (Viáticos → Configurações), e adicionar em "Habilitação do motorista (CNH)" e "Veículo próprio" um botão de anexo com algum tipo de validador, além de criar uma seção equivalente para a **apólice de seguro do veículo**.

**Descoberta:** os campos de seguro (`veiculo_seguradora`, `veiculo_apolice`, `veiculo_seguro_validade`) **já existiam**, mas ficavam escondidos atrás do checkbox "Possui seguro do veículo" — por isso não apareciam na tela. Não foi preciso criar coluna nenhuma; o seguro virou seção própria, no mesmo padrão das outras duas.

### Largura
Modal ia a 560px. Criada a classe `.modal-xwide` (1040px) e a opção `xwide` em `openModal` — o `wide` existente (900px) ainda apertava as linhas de 4 campos.

### Anexos (3 seções)
`erp_attachments` tinha um **CHECK constraint** aceitando só `payable`/`receivable`/`viatico`. Migração em `supabase/migrations/2026-08-11-anexos-colaborador.sql` amplia o conjunto com `colab_cnh`, `colab_veiculo` e `colab_seguro`, e cria índice `(entity_type, entity_id)`. **Operação aditiva** — nenhuma linha alterada; o rollback está comentado no próprio arquivo. Aplicada em produção dentro de transação, com contagem antes/depois conferida (73 = 73).

Assim os documentos reaproveitam toda a máquina que já existia: limite de 3 MB, whitelist de MIME, conferência da assinatura do arquivo (impede SVG/HTML renomeado), download, exclusão e log de auditoria (a mensagem do log passou a nomear a seção em vez de dizer sempre "título a pagar/a receber").

**Privacidade:** CNH e apólice são documentos pessoais. Os tipos `colab_*` exigem permissão de **edição** em Viáticos até para *visualizar* — diferente dos comprovantes de despesa, que quem tem só leitura pode ver. Sem isso, um colaborador de campo baixaria a CNH de um colega trocando o id na URL.

**UX:** os anexos são embutidos na própria seção (`colabAnexosInline`), **não** via `openAttachments`. Aquele fluxo abre outro modal e substituiria o formulário, jogando fora tudo que estivesse digitado e não salvo. Visualizar abre em aba nova (blob), mantendo o formulário aberto por trás. Excluir pede confirmação em dois cliques no próprio botão.

### Validadores
- **CNH:** confere os 11 dígitos e os **dois dígitos verificadores**. É **aviso**, não trava: existem variações de implementação do DV, e recusar uma CNH legítima seria pior que pedir uma reconferência. O backend barra apenas o inequívoco (quantidade de dígitos, dígitos todos repetidos).
- **Placa:** aceita modelo antigo (ABC-1234) e Mercosul (ABC1D23), normaliza para maiúsculas sem separador no banco.
- **Ano** (1950 até ano+1) e **consumo km/L** (0 a 100).
- **Vigências** (CNH, CRLV, seguro) com o `viaStatusValidadeDoc` já existente: vencido (vermelho), vence em ≤30 dias (amarelo), válido (verde).
- **Apólice:** marcar "possui seguro" torna seguradora, nº e vigência obrigatórios — antes dava para marcar o checkbox e não preencher nada, o que anulava o controle. Validado nas duas pontas.
- O estado de cada seção aparece em **badges no cabeçalho dela**, atualizando conforme se digita.

### Verificação
- **21 casos** nos validadores do front e **25 casos** nos do backend, com as funções reais extraídas dos arquivos (não reimplementadas) — todos corretos. Inclui as duas placas que já existem no banco (`QXY3B60`, `ACN-8164`), que **continuam sendo aceitas**.
- Conferidor de CNH: testado contra **486 mutações de um dígito**, detecta **484 (99,6%)** — as 2 que passam são limitação inerente do módulo 11 com a regra de "DV ≥ 10 vira 0", aceitável para um aviso.
- Banco: INSERT real dos três tipos novos **dentro de transação com ROLLBACK** — os três aceitos, um tipo inventado corretamente recusado pelo CHECK, e 73 linhas antes = 73 depois (nada gravado).
- Tela, com `api` stubado bloqueando toda gravação: modal em **1040px**, três seções com validador e área de anexo; badges corretos em vencido/vencendo/válido, placa nos dois formatos, obrigatoriedade progressiva do seguro; payload do Salvar com a placa normalizada; upload enviando `colab_seguro` com kind `contrato` e `colab_cnh` com `outro`; exclusão só chamando a API no segundo clique; **e o formulário intacto depois de mexer nos anexos**.
- Modo leitura conferido: sem permissão de edição, a área de anexo não mostra o seletor de arquivo.
- **Mobile 375px:** achado e corrigido um vazamento de 21px — `input[type=file]` tem largura intrínseca própria e precisava de `min-width:0`. Depois: vazamento zero nas três seções, sem rolagem lateral.

---

## 2026-08-11 — Valores negativos em vermelho no relatório de Solicitação de Aporte

**Pedido:** destacar os valores negativos em vermelho no relatório gerado em Fluxo de Caixa → Solicitar aporte.

**Situação:** só a tabela "Resumo financeiro do período" pintava negativos, e apenas na coluna de valor. A tabela **"Evolução do saldo no período"** — justamente a que mostra o dia em que o caixa vira negativo, a informação central do pedido — saía toda em preto. O Excel já estava correto: o formato numérico `APORTE_MONEY_FMT` inclui `[Red]` para negativos.

### Correção (`public/app.js`)
- Novo `aportePintarNegativos(hook)`, aplicado como `didParseCell` nas **três** tabelas do PDF (dados do aporte, resumo financeiro e todas as seções do modo Completo, que passam pelo helper `secao()`). Negativos saem em **vermelho e negrito**.
- O critério não é "começa com hífen": uma descrição de título como "- ajuste de contrato" ficaria vermelha sem motivo. Só casa valor monetário — `APORTE_NEGATIVO_RE = /^-\s*(R\$\s*)?\d[\d.]*(,\d+)?$/`.
- Só pinta o corpo da tabela (`section === 'body'`), nunca cabeçalho ou rodapé.
- Removido o `const VERMELHO` da função, que ficou órfão depois de a cor migrar para o helper.

### Verificação
- **19 casos** no detector, com a função real extraída do arquivo: pinta `-R$ 244.344,54`, `-1.234,56`, `-R$ 0,01`, valor com espaços em volta; **não** pinta positivo, zero, data, texto, `- ajuste de contrato`, `Porto Seguro - parcela 3`, vazio, `null`, só-hífen, travessão, nem negativo em cabeçalho/rodapé.
- **Integração com o autoTable real**, no navegador, usando os mesmos dados do print (saldo virando em 30/08): exatamente **4 células** vermelhas e em negrito — as quatro negativas —, e numa segunda tabela com descrições contendo hífen, apenas o `-R$ 90,00` do estorno ficou vermelho.
- Os três `didParseCell: aportePintarNegativos` conferidos no código da função.
- **Nenhum arquivo foi baixado:** o teste monta o documento e inspeciona as células, sem nunca chamar `doc.save` — que é a única forma confiável de testar geração de PDF aqui, conforme registrado na sessão anterior.

---

## 2026-08-11 — Logo alinhado ao texto no cabeçalho da Solicitação de Aporte

**Pedido:** alinhar o logo com as letras no relatório de Solicitação de Aporte — estava visivelmente deslocado para cima.

**Causa:** o cabeçalho do Aporte é o único com logo **à direita** e um bloco de texto de **três linhas** (título em y=18, razão social em 23.5, "Emitida em…" em 28). O logo estava fixo em `y=10`, herdado do padrão dos outros relatórios — que têm o logo à esquerda com apenas duas linhas curtas ao lado, onde o topo fixo funciona. Aqui o texto descia até ~28,6 mm e o logo terminava em 16,95 mm: o centro do logo ficava **7,81 mm acima** do centro do bloco de texto.

### Correção
O `y` do logo passou a ser **calculado**, centralizando-o verticalmente em relação ao bloco de texto, a partir dos próprios tamanhos de fonte (altura de caixa alta do título e descida da última linha) — se o cabeçalho mudar de tamanho, o alinhamento acompanha. As três baselines viraram constantes (`TIT_BASE`, `LIN1_BASE`, `LIN2_BASE`) para não haver número solto repetido.

Resultado: logo de 17,82 a 24,77 mm, centro em **21,30 mm** contra **21,29 mm** do texto — diferença de 0,004 mm. Folga de 6,23 mm até a linha separadora (y=31) e 14,82 mm até a faixa verde do topo, sem sobreposição.

### Verificação
Rodada a função **real** `aportePDF` no navegador, com `addImage` e `text` instrumentados para capturar as coordenadas efetivamente usadas — confirmando logo em `y=17.82` e as três baselines em 18 / 23,5 / 28.

**Sobre o download:** desta vez a interceptação do `save` funcionou. O ponto que faltava nas tentativas anteriores era substituir o **construtor** `jspdf.jsPDF` e sobrescrever `save` **na instância** logo após o `new` — `save` é propriedade própria do objeto, não do prototype, então mexer no prototype nunca surtia efeito. Conferido no disco: nenhum arquivo criado nos 2 minutos do teste (os arquivos de 17:32/17:34 na pasta Downloads são os que o próprio usuário gerou).

---

## 2026-08-11 — Solicitação de Aporte passa a listar todas as contas a pagar do período

**Pedido:** no quadro "Próximos títulos a pagar (pendentes)" do relatório de Aporte, listar **todas as contas a pagar do período selecionado** para a extração (sem as já pagas/baixadas), no PDF e no Excel.

**Causa:** a tabela vinha de `d.futuras.pagar`, que no backend é `status='pendente' ORDER BY due_date LIMIT 20` — **sem nenhum filtro de data e cortando em 20 linhas**. No período 01/08–30/09 existem **97 títulos pendentes (R$ 1.042.241,05)**: o relatório mostrava 20, e os 20 primeiros pendentes de qualquer data, não os do período pedido. É por isso que o print terminava em 25/08.

### Backend (`api/index.js`)
Novo bloco `pendentesPeriodo` no `/api/reports/fluxo-caixa`, com `pagar`, `receber`, `totalPagar` e `totalReceber`: `status='pendente' AND due_date BETWEEN de AND ate`, **sem LIMIT**, ordenado por vencimento → fornecedor → descrição, respeitando o filtro de centro de custo. Passou a trazer também `category`.

O `futuras` **não foi alterado**: ele alimenta os cards "Contas a pagar/receber futuras" da tela do Fluxo de Caixa, onde "os 20 próximos" é exatamente o comportamento desejado.

Só `status='pendente'` — na base existem apenas `pago` e `pendente`, então pago/baixado fica de fora por construção (no período há 12 títulos pagos, corretamente excluídos). O recorte por vencimento é o mesmo que o ledger usa para título pendente, então a soma da tabela é a saída projetada que sustenta o valor do aporte. Totais arredondados a 2 casas: somar dezenas de valores acumulava erro de ponto flutuante (`…,0500000005`) e o número ia cru para a célula do Excel.

### PDF e Excel
- Título passou a ser **"Contas a pagar no período (N títulos em aberto)"**, com **linha de total** (o helper `secao()` ganhou suporte a rodapé, com fundo verde-claro).
- Excel: aba renomeada para **"Contas a pagar do período"**, com cabeçalho no padrão + coluna **Categoria**, linha de **Total (N títulos)** e **autofiltro** na faixa de dados. A formatação de moeda passou a varrer qualquer célula numérica, em vez de fixar letras de coluna — os dois blocos (pagar/receber) têm larguras diferentes.
- A tabela de "a receber" seguiu o mesmo critério de período, para o documento não misturar dois recortes diferentes.
- O modo **Resumido** continua sem essas tabelas (é o de uma página).

### Verificação
- SQL testado direto no banco: **01/08–31/08 → 45 títulos / R$ 488.842,27** e **01/08–30/09 → 97 / R$ 1.042.241,05**; **zero** registros fora do período, ordenação por vencimento correta, e o filtro por centro de custo devolvendo só o centro pedido (27 títulos em "Administrativo").
- PDF e Excel gerados com os **97 títulos reais** exportados do banco: PDF com **97 linhas** e rodapé "Total a pagar no período — R$ 1.042.241,05"; Excel com 100 linhas (título + cabeçalho + 97 + total), primeira linha 15/08 Budget e última 30/09 Rodrigo, célula de total em `F100` = **1042241.05** (numérica, formato de moeda com `[Red]`, **sem resíduo de ponto flutuante**) e autofiltro em `A2:F99`.
- Resumido conferido: só a aba "Solicitação", sem a tabela nova.
- **Nada baixado:** `doc.save` (na instância) e `XLSX.writeFile` interceptados; `find -mmin -3` na pasta Downloads sem nenhum arquivo novo. Arquivo de fixture removido.

**Nota:** hoje não há títulos pendentes vencidos antes de 01/08 (conferido: zero). Se um dia houver, eles **não** entram nesta tabela — ficam no saldo inicial do período, que é como o cálculo do aporte já os trata.

---

## 2026-08-11 — Excel da Solicitação de Aporte com a identidade ProAgro

**Pedido:** deixar o Excel emitido em "Solicitar aporte" com mais a cara da ProAgro Seguros, como nos outros documentos.

**Situação:** a identidade visual do sistema está nos **PDFs** (faixa verde, logo, razão social, linha de emissão). Todos os Excel do ERP eram planilhas cruas — cabeçalho de texto e nada mais. E havia um impedimento técnico: **a edição community do SheetJS não escreve estilo de célula** (cor, fonte, borda são recurso da versão Pro), então não havia como colorir nada com a biblioteca em uso.

**Solução:** ExcelJS 4.4.0 (via CDN) só para este relatório, que escreve estilos e imagens. `aporteExcel` virou assíncrona e, se o ExcelJS não tiver carregado, **cai na versão antiga** (renomeada para `aporteExcelSimples`) em vez de falhar — melhor entregar a planilha simples do que não entregar.

### O que a planilha passou a ter
- **Cabeçalho de marca em todas as abas**, no mesmo desenho do PDF: faixa verde no topo, "Solicitação de Aporte" em 18pt, razão social, linha "Emitida em … por …" e o **logo da ProAgro** à direita.
- **Valor solicitado em destaque**, em bloco verde-claro, 22pt.
- Tabelas com **faixa de título verde**, cabeçalho de coluna verde-escuro com texto branco, **zebra**, bordas finas, moeda em `R$` e **negativos em vermelho e negrito** (mesma regra do PDF).
- **Linha de total** com fundo verde-claro e borda superior verde.
- **Painel congelado** no cabeçalho e **autofiltro** na relação de contas a pagar; linhas de grade desligadas; larguras de coluna definidas.
- Nota metodológica no pé da aba principal, como no PDF.
- Abas: `Solicitação`, `Evolução do saldo`, `Por categoria`, `Contas a pagar do período` e, quando houver, `Contas a receber do período`. O Resumido continua com uma aba só.

### Correções de segurança e de peso encontradas no caminho
- **O navegador carregava `xlsx@0.18.5`** do jsdelivr — a linha com as duas CVEs de severidade alta sem correção. O `package.json` tinha sido atualizado para 0.20.3 na auditoria, mas o `index.html` ficou atrás (e é o browser que gera todo o Excel do sistema). Passou a carregar **0.20.3 do CDN oficial da SheetJS**.
- Eu estava chamando `wb.addImage` uma vez por aba, gravando **4 cópias do logo** no arquivo. Um único id serve para todas: arquivo caiu de **77 KB para 35 KB**.

### Verificação
- **Round-trip real:** planilha gerada com os **97 títulos do banco** e **lida de volta** com o ExcelJS para inspecionar o que foi de fato gravado — faixa verde `FF00783F`, título 18pt negrito, razão social e linha de emissão, logo presente (**1 cópia, exibida nas 4 abas**), cabeçalho de coluna `FF005C30` com fonte branca negrito, zebra `FFF7FAF8` alternando, bordas, formato de moeda, **saldo −244.344,54 em vermelho negrito (`FFB23A2F`)** com o positivo acima em cinza normal, painel congelado (`frozen ySplit=8`), autofiltro `A8:F105`, total em `F106` = `1042241.05` com fundo `FFEAF4EE`.
- **Resumido**: uma aba, 24 KB, valor solicitado e justificativa presentes.
- **Fallback**: com `window.ExcelJS` removido, gera a versão simples pelo SheetJS em vez de quebrar.
- **Risco da troca de versão do SheetJS testado:** a importação do Flash (`XLSX.read`) foi exercitada com planilhas geradas na hora — pt-BR (2 linhas, `1.250,50` → 1250.5) e **es-MX (`1,250.50` → 1250.5)**, com `Pendiente`/`Rechazado` descartados e cabeçalho inválido dando erro claro. Nada regrediu.
- **Nada baixado:** o download foi isolado em `aporteBaixarPlanilha` justamente para o teste poder interceptá-lo; `find -mmin -5` na pasta Downloads sem arquivos novos. Fixture removida.

**Observação:** os demais Excel do ERP (Contas a Pagar, Fluxo de Caixa, Conciliação, Viáticos) continuam sem estilo. Se quiser a mesma identidade neles, os helpers `aporteXl*` já estão prontos para reaproveitar.

---

## 2026-08-11 — Logo do Excel do Aporte: sobreposição corrigida

**Problema reportado (com prints):** o logo aparecia descentralizado, quebrado e **em cima do texto** em algumas abas.

**Causa:** eu ancorei a imagem por **contagem de colunas** (`col: ultimaCol - 2`), não pela largura real da aba. O resultado dependia de quantas colunas a aba tinha:
- "Por categoria" (2 colunas) → `2 - 2 = 0` → logo ancorado na **coluna A**, exatamente sobre o título;
- "Evolução do saldo" (4 colunas) → coluna 2, ainda sobre o texto;
- "Contas a pagar" (6 colunas) → coluna 4, por sorte sem colisão.

Além disso o texto do cabeçalho dividia linha com a imagem, então qualquer erro de âncora virava sobreposição.

### Correção
- Âncora calculada em **pixels**: `xlLarguraPx` converte largura de coluna do Excel em pixels (7px por caractere + 5 de padding) e `aporteXlColunaEmX` devolve o índice de coluna **fracionário** correspondente a uma posição horizontal. O logo passa a ser alinhado à direita com 8px de folga, **independente do número de colunas**.
- O logo ganhou uma **faixa própria** (linhas 2 e 3, 18pt cada = 36px), onde não existe texto nenhum. O bloco de identificação — título, razão social e linha de emissão — desceu para as linhas 4 a 6. Sobreposição deixa de ser possível por construção, não por cálculo dar certo.
- Em aba estreita demais para o logo de 150px, ele é reduzido proporcionalmente (mínimo 70px) em vez de vazar.
- **Aba "Solicitação" tinha 5 colunas para tabelas de 2**, o que deixava três células verdes vazias à direita do cabeçalho (visível no print). Passou a ter 2 colunas, e os cabeçalhos não têm mais rótulos vazios.
- Coluna "Fornecedor" de 30 para 36, que estava cortando nomes como "Budget Assessoria Contábil e Fiscal LT…".

### Verificação
- Geometria conferida por cálculo nas 5 abas: largura total 430 a 1101px, logo sempre **dentro dos limites**, com exatamente **8px de folga à direita** em todas.
- Arquivo real gerado com os 97 títulos e **lido de volta**: 1 logo por aba, ancorado na linha reservada, e a varredura das linhas 2–3 retorna **nenhuma célula com texto** em nenhuma das abas — ou seja, o logo não tem com o que colidir.
- Varredura procurando **célula verde sem conteúdo** (o defeito do print): **nenhuma**. Cabeçalhos das duas tabelas com exatamente 2 colunas preenchidas.
- Negativo segue em vermelho (`FFB23A2F`); arquivo continua em 35 KB.
- **Nada baixado:** os `.xlsx` de 18:08/18:09 na pasta Downloads são os que o usuário gerou (o de 18:09 é o do print) e o `~$…xlsx` é o arquivo de trava do Excel com a planilha aberta — não foram tocados. Fixture removida.

---

## 2026-08-12 — Solicitação de Viáticos: campos obrigatórios e dois motivos novos

**Pedido:** (1) não deixar avançar de etapa sem preencher tudo — todos os dados obrigatórios; (2) acrescentar "Prévia" e "Reinspeção" ao motivo, em ordem alfabética.

### Motivos
`MOTIVO_OPTIONS` passou de `['Monitoramento', 'Sinistro', 'Comercial']` para **`['Comercial', 'Monitoramento', 'Prévia', 'Reinspeção', 'Sinistro']`**, nos dois arquivos (front e back) — a lista é espelhada e o backend valida contra ela.

**Efeito colateral que precisei tratar:** dois lugares usavam `MOTIVO_OPTIONS[0]` como valor inicial. Com a ordem alfabética, isso mudaria o padrão de "Monitoramento" para "Comercial" sem ninguém pedir — uma solicitação sairia rotulada como Comercial por acidente. Os dois passaram a abrir com **"— selecione —"**, sem motivo assumido (coerente com tudo virar obrigatório).

### Obrigatoriedade
Antes, a etapa 2 só exigia datas e destino: dava para avançar **sem OT e sem objetivo**, e a solicitação chegava na aprovação sem contexto. A etapa 3 só checava conflito de combinação — dava para marcar "Avião" e avançar **sem nenhum trecho**, com a previsão saindo zerada.

Criadas `viaWizValidarEtapa2` e `viaWizValidarEtapa3`, fora das funções de render (para serem testáveis e para a mesma regra valer na etapa e no envio):
- **Etapa 2:** nº da OT, ao menos um destino, as duas datas (retorno não antes da saída), motivo válido e objetivo — todos rejeitando string só com espaços.
- **Etapa 3:** ao menos um meio de transporte e, para cada um marcado, os dados que formam o custo — avião/ônibus (origem, destino, data, valor por trecho), aluguel (locadora, diária, nº de diárias, retirada e devolução com local e data, distância e combustível), carro próprio (distância e combustível) e táxi/Uber (origem, destino, valor por corrida).
- Etapas 1 e 4 são só leitura, não têm o que validar.
- `viaWizAvisar` além do toast **leva o foco e rola até o campo** que falta — antes o aviso obrigava a caçar o campo na tela.
- O botão **Enviar** revalida as duas etapas: dá para chegar ao resumo, voltar, apagar um campo e retornar pelos botões.

**Backend** (`POST /api/viaticos/solicitacoes/autosservico`): passou a exigir OT, motivo, objetivo, ao menos um destino e ao menos um meio de transporte. `destinos` era validado só `if (b.destinos !== undefined)` — ausente passava batido. A regra não pode depender só da tela. O formulário do admin **não** foi endurecido: ali o motivo segue opcional, como era.

**Interpretação que assumi:** exigi os campos que identificam a viagem e formam o custo. Deixei opcionais os que costumam não existir no momento do pedido — companhia aérea, nº do voo e horários. Se quiser esses também obrigatórios, é uma linha em `viaWizValidarEtapa3`.

### Verificação
- **34 casos unitários** nos dois validadores, com as funções reais extraídas do arquivo: campo por campo da etapa 2 (incluindo "só espaços", retorno antes da saída, motivo fora da lista e os dois motivos novos aceitos) e cada transporte da etapa 3 (sem item, item incompleto, valor zero, apontando o índice certo quando o 2º trecho é que está ruim, diária com vírgula, e combinação avião+táxi válida).
- **Ponta a ponta no navegador** (gravação bloqueada): o suspenso mostra `— selecione —` + os 5 motivos em ordem, **sem pré-seleção**; tentando avançar vazio a tela **permanece na etapa 2** e o aviso muda conforme se preenche — OT → destino → motivo → objetivo; com tudo preenchido vai para a etapa 3. Na etapa 3: sem transporte, com avião sem trecho e com trecho vazio, **fica na etapa 3**; com o trecho completo avança. Etapa 4 segue para o resumo. No resumo, apagando o objetivo, o Enviar responde "Não é possível enviar: Descreva o objetivo da viagem."
- Listas de motivo conferidas como **idênticas** entre front e back e em ordem alfabética pt-BR; nenhum `MOTIVO_OPTIONS[0]` restante.
- `node --check` OK; console sem erros.

---

## 2026-08-12 — Assistente de Viáticos um pouco mais largo

**Pedido:** expandir o quadro de "Dados da viagem" para os dois lados, sem exagerar.

`.via-wiz-container` de **760px para 900px** (+18%). Afeta as etapas 1, 2 e 4, que usam o mesmo invólucro; a 3 já usava `-wide` (1240px, por causa do mapa) e a 5 usa `-lg` (920px) — então a mudança também deixa a largura **mais uniforme ao longo do assistente**, sem o salto de 760 → 1240 → 760 → 920 de antes.

### Verificação
Medido no navegador nas 5 etapas: container em 900px nas etapas de formulário (contra 980 na 3 e 920 na 5), **sem vazamento horizontal** em nenhuma, com 65–72px de sobra de cada lado numa janela de 1280px. Em **tablet (768px)** o container fica em 725px e em **celular (375px)** em 347px, sem rolagem lateral em nenhum dos dois — o `max-width` cede naturalmente.

---

## 2026-08-12 — Aluguel de Carro: local por município, km rodado no destino e fim da rolagem

Levantamento da equipe, três ajustes na etapa 3 da Solicitação de Viáticos.

### 1. Local de retirada/devolução por Estado + Município
Eram campos de **texto livre com autocomplete** de endereços (Photon), o que gerava valores como "São Paulo, Região Sudeste, Brasil" — imprecisos, sujeitos a erro de grafia e longos demais para a tabela de trechos.

Passaram a ser **Estado + Município em cascata**, do mesmo dataset dos destinos da OT, com um checkbox **"🏠 Retirada e devolução na cidade-base (Município/UF)"** que preenche os quatro campos de uma vez (desmarcar limpa, para a base não ficar gravada como se tivesse sido escolhida à mão).

`retirada_local` / `devolucao_local` continuam existindo como texto `"Município/UF"`, porque a validação, o resumo e o PDF já leem esses campos — não foi preciso mexer neles. O cálculo de rota agora recebe `{ uf, municipio }`, a mesma forma que já usava para a cidade-base e para os destinos, e o `retirada_coord` (lat/lng do autocomplete) deixou de ser necessário.

**Ganho de tabela:** o rótulo do trecho encurtou de "São Paulo, Região Sudeste, Brasil → Jundiaí/SP" para **"São Paulo/SP → Jundiaí/SP"**, o que já resolveu boa parte do item 3.

### 2. Coluna "Km no destino" no lugar de "Repetições"
A rota calculada só conhece a ida até cada parada e a volta ao ponto de partida — os deslocamentos dentro do destino (hotel ↔ local da visita) não apareciam. Antes isso era aproximado por "repetições" do trecho, o que é indireto e não bate com a realidade.

Agora cada trecho tem um campo de **km rodados no destino**, digitado livremente. Ele entra na **quilometragem total e no combustível**, tanto na linha quanto no rodapé, e é propagado para os campos de km/combustível do aluguel (portanto para a previsão da etapa 4 e para o resumo). Quando há km informado, a célula de distância passa a mostrar `38.2 km / total 78.2 km`.

**Compatibilidade:** `repeticoes` saiu da tela mas **continua sendo multiplicada no cálculo** (`viaKmTrecho`), porque solicitações gravadas antes desta mudança têm repetições > 1 — ignorá-las mudaria o valor de registros já aprovados. Para os novos, repetições é sempre 1 e o resultado é `km + km no destino`.

A coluna "Pedágio total" foi removida (era o valor × repetições): agora se informa o **total pago no trecho**, direto. A tabela foi de 6 para 5 colunas.

### 3. Fim da barra de rolagem
- `.via-wiz-container-wide` de **1240 para 1400px**; coluna do formulário de `flex:1.1` para `1.5` e o mapa de `0.9` para `0.85` — o formulário é quem tem a tabela.
- O layout de duas colunas saiu do `style` inline para a classe `.via-wiz-2col`, e **abaixo de 1400px de janela o mapa vai para baixo**, ocupando a linha inteira. Sem isso, numa janela de 1280px a coluna ficava em 592px para uma tabela de 664px e a barra voltava.
- `.via-trechos-tbl` com `white-space: nowrap` nas colunas numéricas e quebra só no rótulo do trecho.

### Verificação
Ponta a ponta no navegador, com gravação bloqueada e **rota real calculada pelo OSRM**:
- **Item 1:** os quatro campos suspensos presentes, nenhum campo de texto livre restante, município travado em "— escolha o estado —" antes de escolher a UF, e o checkbox da base preenchendo `SP` / `São Paulo` nos dois lados com `retirada_local = "São Paulo/SP"`.
- **Item 2:** rota São Paulo → Jundiaí → Campinas → Sorocaba deu 275,1 km / R$ 198,36; digitando 40 km no 2º trecho foi para **315,1 km / R$ 227,20** (275,1+40 e 315,1÷10×7,21 conferem), com a linha exibindo "38.2 km / total 78.2 km". Num segundo cenário, 25 km em cada um dos 3 trechos levou 188,9 → **263,9 km**, e o R$ 190,31 apareceu na previsão da etapa 4 e no total; o itinerário do resumo mostra "54.3 km + 25.0 km no destino = 79.3 km".
- **Item 3:** em janela de **1680px** fica lado a lado (formulário 847px, mapa 498px) com a tabela em 773px de 773px — **sem barra**; em **1280px** empilha e a tabela fica em 891px de 891px — **sem barra**. Nenhuma rolagem lateral da página em nenhum dos dois.
- Validação da etapa 3 reconferida com os campos novos: sem retirada, sem devolução e sem km, cada um com sua mensagem; o aluguel completo passa. Carro Próprio usa o mesmo componente e herdou a coluna.
- `node --check` OK; console sem erros de aplicação.

**Nota:** o combustível é calculado sobre o km sem truncar, então pode divergir alguns centavos de uma conta feita à mão com o km arredondado exibido (263,9 → R$ 190,27 contra R$ 190,31). Comportamento que já existia antes desta mudança; não alterei para não mexer no valor de rotas já calculadas.

---

## 2026-08-12 — Pedágio total travado pela soma dos trechos + atalho para o Rotas Brasil

Vale para **Carro Próprio e Aluguel de Carro** (usam o mesmo componente de rota).

### 1. Pedágio total preenchido e travado
O campo "Pedágio total (R$)" do formulário já era preenchido com a soma dos trechos **na renderização**, mas não acompanhava a digitação: quem lançava o pedágio na tabela via o rodapé dela mudar e o campo de baixo continuar vazio e editável — dois lugares para o mesmo número, e o campo do formulário é o que alimenta a previsão.

Novo `viaSincronizarPedagioTotal(input, bloco, trechos)`, chamado nos dois blocos a cada atualização de linha: soma a coluna de pedágio, escreve no campo e o **trava**, igual a distância e combustível. Se todos os pedágios voltarem a zero, o campo é **liberado** de novo — quem não calcula rota (ou prefere lançar só o total) continua podendo digitar ali. O valor travado é gravado em `pedagio_valor`, então segue para a previsão mesmo com o input desabilitado.

Os textos de ajuda dos dois blocos foram corrigidos: falavam em "valor de uma passagem × repetições", que deixou de existir quando a coluna de repetições saiu.

### 2. Atalho para o Rotas Brasil
Sem uma API de pedágio confiável, o valor é consultado manualmente. Foi adicionado o botão **"🛣️ Consultar pedágio no Rotas Brasil"** (`https://rotasbrasil.com.br/`) logo abaixo do campo de pedágio, nos dois blocos, abrindo em outra aba com `rel="noopener noreferrer"`. Regra `a.btn { text-decoration: none }` no CSS, já que `.btn` nunca havia sido usado em link.

Não tentei montar a URL com origem/destino preenchidos: o site não tem parâmetros de consulta documentados e chutar produziria link quebrado.

### Verificação
Ponta a ponta com rota real do OSRM, nos dois blocos:
- **Carro Próprio:** campo liberado e vazio antes e depois de calcular a rota; digitando 18,50 e 7,25 em dois trechos, o campo passou a **R$ 25,75 travado**, batendo com o rodapé da tabela e com o modelo; **zerando os dois, o campo destravou**.
- **Aluguel de Carro:** 10 + 11 + 12 → **33,00 travado**, igual ao rodapé e ao modelo, e aparecendo na etapa 4 como "🛣️ Pedágio (informado na rota) R$ 33,00" dentro do total previsto.
- Botão conferido nos dois blocos: texto, `href`, `target="_blank"`, `rel` e sem sublinhado. `https://rotasbrasil.com.br/` respondendo **HTTP 200**.
- `node --check` OK; console sem erros de aplicação.

---

## 2026-08-12 — Botão de pedágio ao lado do cálculo, campo travado e paradas manuais só com voo

### 1. Botão do Rotas Brasil ao lado de "Calcular rota automaticamente"
Estava logo abaixo do campo de pedágio; passou para a mesma linha do botão de calcular rota (`.btn-group`), nos dois blocos — Carro Próprio e Aluguel de Carro.

### 2. "Pedágio total" travado como os vizinhos
O campo ficava editável enquanto nenhum pedágio tivesse sido informado. Agora usa o **mesmo `kmCombDisabled`** de distância e combustível: travado por padrão, e liberado apenas por **"✏️ Rota não pôde ser calculada — preencher km/combustível manualmente"**, que é a chave dos outros dois. Os três passam a se comportar igual.

`viaSincronizarPedagioTotal` também deixou de reabilitar o campo quando os pedágios voltavam a zero — agora ele apenas esvazia e continua travado, respeitando o `manual_override`. Textos de ajuda dos dois blocos atualizados.

### 3. "Rodei apenas por lugares específicos no destino" só com voo preenchido
A opção só faz sentido quando a viagem tem voo (chegar de avião e usar o carro apenas dentro do destino, em vez de rodar as cidades da OT saindo da base). Agora ela **só aparece** quando "Avião" está marcado **e** existe pelo menos um trecho com origem, destino, data e valor.

- `viaTemVooPreenchido()` decide, e `viaAtualizarVisibilidadeUsoLocal()` aplica em todos os aluguéis.
- Chamada a cada digitação nos campos do voo, ao adicionar/remover trecho e ao marcar/desmarcar Avião. Só alterna `display` — não redesenha o bloco — justamente porque roda enquanto a pessoa digita, e um re-render tiraria o foco do campo.
- **Se a opção estava marcada e o voo deixa de existir, `uso_local` volta a false** e o bloco é redesenhado. Sem isso o roteiro ficaria preso nas paradas manuais com a opção invisível, sem a pessoa entender por quê.

### Verificação
Ponta a ponta com rota real do OSRM:
- **Botão:** confirmado dentro do mesmo `.btn-group` do "Calcular rota" nos dois blocos.
- **Travamento:** antes de calcular, os três campos travados; marcando "preencher manualmente", os três liberam; desmarcando, os três voltam a travar. Após calcular e digitar 18,50 + 7,25, o campo mostrou **R$ 25,75 travado**, igual ao rodapé da tabela e ao modelo; **zerando os pedágios o campo esvaziou e permaneceu travado** (comportamento novo, antes destravava).
- **Visibilidade da opção:** escondida sem avião; escondida com avião marcado mas sem trecho; escondida com trecho vazio; escondida com só origem e com origem+destino; **aparece apenas com o voo completo**. Marcando a opção e depois desmarcando Avião, ela desaparece e `uso_local` volta a false no modelo.
- Console sem erros de aplicação.

**Ponto em aberto:** o pedido mencionava "assim você usa os dados diretamente de lá". Implementei a regra de visibilidade, que era o pedido explícito. Se a ideia também era **pré-preencher o município de retirada a partir do destino do voo**, isso é possível — `br-aviacao.js` traz a cidade de cada IATA —, mas o casamento entre a cidade do dataset de aeroportos e o município do IBGE não é exato (acento e grafia divergem em vários casos), então preferi confirmar antes em vez de arriscar preencher a cidade errada.

---

## 2026-08-13 — Autosserviço bloqueado pela guarda de somente-leitura

**Problema reportado:** o colaborador de campo, ao enviar a solicitação em "Solicitar viagem", recebia "Acesso somente leitura nesta seção." e não conseguia concluir. O esperado é o que já estava desenhado: **leitura** na lista de Viáticos e **acesso pleno** para pedir a própria viagem.

**Causa:** a guarda de UX em `api()` (`public/app.js:97`) bloqueia qualquer método diferente de GET quando a página atual é somente-leitura. Ela olhava só o `READONLY` da página, e o autosserviço roda dentro de Viáticos — onde esse usuário tem, corretamente, permissão apenas de visualização. O backend **já liberava** (`requireAuth` + `requireAutosservico`), e o próprio código do botão "Solicitar viagem" tinha o comentário explicando a intenção ("READONLY controla EDITAR dados de terceiros, não pedir a própria viagem"); faltava a exceção na guarda.

**Correção:** requisições cujo caminho contém `/autosservico` ficam de fora da guarda. Uma linha, com o porquê registrado ao lado.

**Por que é seguro:** no `POST /api/viaticos/solicitacoes/autosservico` o colaborador é resolvido por `SELECT * FROM erp_colaboradores WHERE usuario_id = $1` (o usuário logado) e o INSERT usa `colab.id` — o `colaborador_id` **nunca** vem do corpo da requisição. Então um usuário só-leitura consegue criar solicitação **para si mesmo** e mais nada. Todas as outras validações do endpoint (OT, motivo, objetivo, datas, destinos, recálculo servidor-side da previsão) continuam valendo.

### Verificação
Com um usuário simulado de perfil real do campo (`role: 'user'`, `permissions: { viaticos: 'view' }`, `READONLY = true`):
- **Assistente completo até o envio**, com `fetch` interceptado para não gravar em produção: saiu **`POST /api/viaticos/solicitacoes/autosservico`** com OT 99 e motivo "Reinspeção", e o toast foi "Solicitação enviada!" — **nenhum** aviso de somente-leitura.
- **A lista de Viáticos segue restrita** para o mesmo usuário: sem "+ Nova solicitação", sem "Configurações", e a única ação por linha é "Ver detalhes". O botão "✈️ Solicitar viagem" aparece.
- **A exceção não vazou:** uma escrita comum da seção (`POST /solicitacoes/:id/status`) continua bloqueada com a mensagem de somente-leitura, enquanto o caminho do autosserviço passa.

---

## 2026-08-13 — Habilitação para dirigir a serviço e alertas de documentação

**Pedido:** só permitir carro próprio com **toda a documentação em dia**; só permitir aluguel com a **CNH em dia**; sem isso, a função fica indisponível. E na tela de Viáticos, alertas completos de vencimento **a partir de 2 meses** e de pendências de cadastro.

### Regras (`viaAvaliarDocumentacao` em `public/app.js` — fonte única)
- **Aluguel de carro** exige: nº e validade da CNH cadastrados, CNH não vencida e motorista não marcado como inapto.
- **Carro próprio** exige tudo isso **mais**: veículo apto, placa, modelo, **consumo em km/L** (sem ele não há como apurar o combustível), CRLV cadastrado e não vencido, e — quando o seguro é declarado — seguradora, nº da apólice e vigência válida.
- **Avisos que não bloqueiam:** veículo sem seguro declarado e categoria da CNH não informada.
- **Antecedência do aviso de vencimento: 60 dias** (`VIA_DIAS_ALERTA_DOC`). O padrão de `viaStatusValidadeDoc` também passou de 30 para 60, para a coluna "Documentação" das Configurações falar a mesma língua.

### Onde a regra aparece
1. **Assistente, etapa 3:** cartões de Carro Próprio e Aluguel travados quando não habilitados, com o motivo no tooltip, e um painel em destaque explicando o bloqueio. Diferente das travas de combinação, esta vale **mesmo com o cartão já marcado** — documentação vencida não é escolha do usuário. `viaGarantirTransportePermitido()` desmarca ao entrar na etapa, para uma seleção antiga não sobreviver escondida no estado.
2. **Validação ao avançar** (`viaWizValidarEtapa3`) recebe o colaborador e recusa a modalidade não liberada.
3. **Servidor** (`viaBloqueiosDirecao` em `api/index.js`): o POST do autosserviço devolve **403** com o motivo. A tela bloqueia, mas quem monta a requisição na mão passaria por cima — e é o servidor que grava. As duas implementações precisam casar; o teste compara as duas em cada cenário.
4. **Tela de Viáticos:** painel próprio para quem está vinculado a um colaborador (bloqueios, vencimentos com contagem de dias e pendências) e, para quem administra, um card **"Documentação da equipe"** com quem não pode dirigir, quem só pode alugar e o que vence nos próximos 2 meses, ordenado por urgência.
5. **Coluna "Documentação"** das Configurações ganhou o estado **"Só aluguel"**: antes dizia "Em dia" olhando só validades, mesmo faltando placa, consumo ou apólice.

### Dois bugs de data encontrados pelos testes
- **Servidor rejeitava documento que vence hoje.** A conversão da coluna `DATE` para `America/Sao_Paulo` jogava a data um dia para trás (o pg entrega DATE como meia-noite UTC). Uma CNH válida até hoje aparecia como vencida. Corrigido lendo o dia do calendário sem conversão de fuso — diferente de `hojeISO()`, onde o fuso importa de verdade.
- **`brDate` quebrava com o formato que a própria API envia.** Colunas DATE chegam ao navegador como `"2027-05-05T03:00:00.000Z"`, e `brDate` fazia `split('-')` direto, produzindo `05T03:00:00.000Z/05/2027`. Bug latente que os novos painéis exibiriam em destaque. Corrigido na raiz (`slice(0,10)`), o que beneficia toda a aplicação, e as datas passaram a ser normalizadas explicitamente na avaliação em vez de depender de comparação de string dar certo por sorte.

### Verificação
- **40 casos** comparando **front e servidor lado a lado** em cada cenário, nos três formatos de data que ocorrem (`'YYYY-MM-DD'`, ISO com hora da API, e `Date` do pg) — as duas implementações concordam em todos, incluindo as bordas "vence hoje" (permitido) e "venceu ontem" (bloqueado).
- Limites do aviso: 59 dias avisa, **60 dias avisa**, 61 não; três documentos vencendo geram três linhas.
- **Na tela**, cinco cenários percorridos até a etapa 3: cadastro completo (nada travado, sem alertas); CNH vencida (as duas modalidades travadas + alerta de não habilitado); CRLV vencido (**só carro próprio travado, aluguel liberado** + alerta explicando); cadastro vazio (as duas travadas com a lista completa de motivos + pendências); CNH vencendo em 38 dias (nada travado, alerta com a contagem). Avião e táxi/Uber nunca são travados.
- Seleção anterior inválida é limpa ao entrar na etapa; forçando o estado, a validação recusa com o motivo; com a CNH regularizada, o aluguel passa a barrar apenas por falta dos dados do aluguel.
- Painel da equipe conferido com 4 colaboradores: 1 sem habilitação, 1 só-aluguel, e 2 vencimentos da mesma pessoa ordenados por dias.
- Console sem erros de aplicação.

**Decisão que deixo explícita:** **veículo sem seguro não bloqueia** o carro próprio — segue a regra que já existia no sistema (o seguro só é exigido quando o próprio cadastro declara possuir um). Aparece como pendência em destaque. Se a política for "sem seguro não roda a serviço", é uma linha para mudar, mas isso barraria hoje todo colaborador sem seguro declarado — preferi não decidir isso sozinho.

---

## 2026-08-13 — Alertas de documentação em barra compacta

**Pedido:** os avisos de documentação na tela do admin estavam grandes demais, ocupando o topo inteiro. Deixar discreto, podendo ser um botão que expande.

### Mudança
Os dois blocos (o próprio e o da equipe) viraram **uma linha só** — `viaBarraDocumentacao`: ícone, o rótulo "Documentação" e **chips com os contadores** ("7 sem habilitação", "1 só aluguel", "2 vencendo", "Você não pode dirigir a serviço"), com uma seta que expande o detalhamento completo. Fechada por padrão; o estado fica no `sessionStorage`, então quem está trabalhando nas pendências não precisa reabrir a cada volta à tela. Quando não há nada a informar, a barra não é renderizada.

O detalhamento em destaque **continua na etapa 3 do assistente**, que é onde ele decide algo — a pessoa está escolhendo o transporte naquele momento. Lá o alerta não foi compactado.

Refatoração de apoio: `viaPainelEquipeDocumentacao` foi separada em `viaResumoEquipeDoc` (só os dados, que alimentam os contadores) e `viaDetalheEquipeDoc` (o HTML das listas), para a barra montar chips e detalhe da mesma fonte.

### Um bug de CSS que o teste pegou
A área de detalhe tinha `display:flex`, e **estilo de autor vence o `[hidden]` da folha do navegador** — então ela permanecia visível mesmo "fechada": a barra media **433px nos dois estados**, e o objetivo de discrição não era cumprido. Corrigido com uma regra explícita `.via-doc-detalhe[hidden] { display:none }`.

### Verificação
- **Fechada: 43px** (era 433px) — economia de 390px no topo, contra 266px dos cards de KPI ao lado. Abre para 433px e volta para 43px ao fechar.
- `display` do detalhe fechado = `none`; `aria-expanded` alterna entre `false`/`true`; a seta gira.
- Estado lembrado na sessão: abrir grava `1`, fechar grava `0`, e ao re-renderizar a tela ele volta fechado quando era esse o estado.
- Chips corretos no cenário com 9 colaboradores: "Você não pode dirigir a serviço", "7 sem habilitação", "1 vencendo"; ao expandir, os três blocos com as listas nominais.
- **No assistente nada mudou:** o alerta completo aparece, os cartões de carro próprio e aluguel seguem travados, e a barra compacta não é usada lá.
- **Mobile 375px:** 130px fechada (os chips passam para uma linha própria), sem vazamento e sem rolagem lateral.
- Console sem erros de aplicação.

---

## 2026-08-13 — Configurações de Viáticos mais larga e filtro de ativos/inativos

**Pedido:** alargar a caixa de Configurações para a tabela caber bem, e criar um filtro de ativos/inativos na lista de colaboradores — a intenção é **inativar em vez de excluir**, para não perder os dados da pessoa.

### Largura
Modal passou de `wide` (900px) para `xwide` (**1040px**), a classe que já existia do cadastro de colaborador. A tabela de colaboradores mede 994px e **não rola mais na horizontal**.

### Filtro de situação
Acima da tabela, um seletor com a contagem em cada opção — **"Somente ativos (3)" / "Somente inativos (2)" / "Todos (5)"** —, começando em *Somente ativos* e lembrando a escolha na sessão. Ao lado, a explicação da diferença: inativar preserva histórico e dados, excluir apaga o cadastro.

Linhas de inativos ficam visualmente apagadas (cinza, fundo levemente diferente e nome em itálico), para não serem confundidas com quem está ativo quando o filtro está em "Todos".

O `tbody` passou a ser redesenhado por `desenharColaboradores()`, e os handlers de Editar/Inativar/Excluir foram extraídos para `ligarAcoesColaboradores()` — precisam ser religados a cada troca de filtro, senão os botões das linhas novas ficariam mortos.

### Verificação
- Modal em **1040px** (`modal-xwide`), corpo útil de 996px, tabela 994px, **sem rolagem horizontal** — nem na tabela de colaboradores nem nas duas de TUD.
- O card do ANP acompanhou: **996px, preenchendo todo o espaço útil**, com as três colunas em 311px cada.
- Filtro conferido com 5 colaboradores (3 ativos, 2 inativos): rótulos com as contagens corretas; *ativos* mostra os 3; *inativos* mostra os 2, ambos com a linha apagada; *todos* mostra os 5 com 2 apagados. Escolha persistida na sessão.
- **Ações religadas depois do redesenho:** o botão Editar volta com handler, e o rótulo do botão de situação sai correto por linha ("Inativar" para ativo, "Ativar" para inativo).
- **Mobile 375px:** modal 343px, filtro sem vazamento, seletor cabendo, sem rolagem lateral.
- Console sem erros de aplicação.
