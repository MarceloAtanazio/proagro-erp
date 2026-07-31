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
