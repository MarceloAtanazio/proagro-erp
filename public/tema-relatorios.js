/* ============================================================
   RELATÓRIOS GERENCIAIS — VISUAL NOVO (executivo). Por cima da tela original (que continua intacta no visual Clássico):
   · barra de controle: ano, regime (Caixa | Competência), visão (Mensal | Trimestral | Anual), exportar Excel;
   · KPIs essenciais (receita, despesas, resultado, EBITDA, peso de pessoal, execução do orçamento, caixa e fôlego);
   · posição financeira (a receber, a pagar, próximos 30 dias) e pontos de atenção automáticos;
   · DRE completo: receita bruta → receita líquida → margem de contribuição → EBITDA → resultado financeiro → resultado líquido,
     com meses/trimestres, total, análise vertical (% da receita líquida), orçado, variação e comparação com o ano anterior; grupos expansíveis;
   · gráficos (receitas × despesas × resultado acumulado; ponte do resultado), custos por grupo × orçado e rankings (fornecedores, clientes).
   Dados: GET /api/reports/dre/:ano?regime=caixa|competencia (api/index.js). app.js só dispara 'proagro:rel' ao fim de renderRelatorios.
   ============================================================ */
(function () {
  'use strict';
  const novo = () => window.ProagroTema && ProagroTema.ui === 'novo';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const E = v => (typeof esc === 'function' ? esc(v) : String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const compacto = v => { const a = Math.abs(v); if (a >= 1e6) return (a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi'; if (a >= 1e3) return (a / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil'; return a.toLocaleString('pt-BR', { maximumFractionDigits: 0 }); };
  const moeda = v => (v < 0 ? '−' : '') + 'R$ ' + compacto(v);
  const pct = (v, d) => (v == null || !isFinite(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }) + '%');
  const sPct = v => (v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%');
  const brlFull = v => (typeof brl === 'function' ? brl(v) : 'R$ ' + v.toFixed(2));
  const CORES = { verde: '#00783F', verde2: '#3DAE43', azul: '#1F4E78', vermelho: '#B23A2F', dourado: '#C9922A', cinza: '#8898A0' };
  const lerSS = (k, p) => { try { return sessionStorage.getItem(k) || p; } catch (e) { return p; } };
  const gravaSS = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* sem sessionStorage */ } };

  // ---------- estrutura do DRE (mapa categoria → grupo) ----------
  const MAPA = {
    'Folha de Pagamento': 'pessoal', 'RH / Benefícios': 'pessoal', 'Cursos / Capacitações': 'pessoal', 'Uniformes / EPIs': 'pessoal',
    'Viáticos': 'campo', 'Reembolso de Despesas': 'campo', 'Frota': 'campo', 'Logística': 'campo',
    'Serviços de Terceiros': 'servicos', 'Compras / Fornecedores': 'servicos', 'Serviços Técnicos': 'servicos',
    'Aluguel': 'ocupacao', 'Condomínio': 'ocupacao', 'Comodato': 'ocupacao', 'Instalações': 'ocupacao', 'Energia': 'ocupacao', 'Água': 'ocupacao',
    'Contabilidade': 'profissionais', 'Jurídico': 'profissionais',
    'Tecnologia': 'tecnologia', 'Internet': 'tecnologia', 'Telefone': 'tecnologia',
    'Seguros': 'seguros', 'Marketing e Vendas': 'comercial', 'Marketing e Eventos': 'comercial',
    'Impostos e Taxas': 'tributos', 'Tarifas Bancárias': 'financeiro', 'Investimentos': 'invest',
    'Administrativo': 'outras', 'Outros': 'outras'
  };
  const NOME = { pessoal: 'Pessoal e benefícios', campo: 'Operação de campo e viagens', servicos: 'Serviços e suprimentos', ocupacao: 'Ocupação e utilidades', profissionais: 'Serviços profissionais',
    tecnologia: 'Tecnologia e comunicação', seguros: 'Seguros', comercial: 'Comercial e marketing', outras: 'Outras despesas administrativas', tributos: 'Tributos e taxas',
    financeiro: 'Resultado financeiro', invest: 'Investimentos' };
  const CUSTOS = ['pessoal', 'campo', 'servicos'], ADMIN = ['ocupacao', 'profissionais', 'tecnologia', 'seguros', 'comercial', 'outras'];

  // ---------- estado ----------
  let S = { dados: null, ano: 0, regime: 'caixa', visao: 'mensal', abertos: new Set(), token: 0, graficos: [] };
  const zeros = () => Array(12).fill(0);
  const soma = (a, b) => a.map((v, i) => v + (b ? b[i] : 0));
  const somaN = (arrs) => arrs.reduce((t, a) => soma(t, a), zeros());
  const nega = a => a.map(v => -v);

  // linhas (categoria → [12 meses]) por versão: cur, prev, orc
  function mapear(rec, desp) {
    const R = new Map(), D = new Map();
    (rec || []).forEach(r => { const a = R.get(r.category) || zeros(); a[r.month - 1] += Number(r.total) || 0; R.set(r.category, a); });
    (desp || []).forEach(r => { const a = D.get(r.category) || zeros(); a[r.month - 1] += Number(r.total) || 0; D.set(r.category, a); });
    return { R, D };
  }

  // monta as linhas do DRE; cada linha tem v = { cur, prev, orc } (12 meses, com sinal: receita +, custo −)
  function construir(d) {
    const V = { cur: mapear(d.atual.rec, d.atual.desp), prev: mapear(d.anterior.rec, d.anterior.desp), orc: mapear(d.orcado.rec, d.orcado.desp) };
    const chaves = ['cur', 'prev', 'orc'];
    const get = (tipo, cat) => { const o = {}; chaves.forEach(k => { const a = V[k][tipo].get(cat); o[k] = a ? (tipo === 'R' ? a.slice() : nega(a)) : zeros(); }); return o; };
    const todasCats = tipo => [...new Set(chaves.flatMap(k => [...V[k][tipo].keys()]))];
    const somaV = lista => { const o = {}; chaves.forEach(k => { o[k] = somaN(lista.map(x => x.v[k])); }); return o; };
    const subV = (...listas) => { const o = {}; chaves.forEach(k => { o[k] = somaN(listas.map(l => l.v[k])); }); return o; };
    const linhasDe = (tipo, filtro) => todasCats(tipo).filter(filtro).sort().map(c => ({ nome: c, v: get(tipo, c), cat: c, tipo }));
    const temValor = x => chaves.some(k => x.v[k].some(v => Math.abs(v) > 0.004));
    const grupo = (id, nome, filhos) => { filhos = filhos.filter(temValor); return { id, nome, tipo: 'grupo', filhos, v: somaV(filhos) }; };

    // receita
    const recLinhas = linhasDe('R', c => c !== 'Receitas Financeiras').sort((a, b) => soma(b.v.cur, b.v.prev).reduce((x, y) => x + y, 0) - soma(a.v.cur, a.v.prev).reduce((x, y) => x + y, 0));
    const receita = grupo('receita', 'Receita bruta', recLinhas);
    const despPorGrupo = g => linhasDe('D', c => (MAPA[c] || 'outras') === g);
    const tributos = grupo('tributos', NOME.tributos, despPorGrupo('tributos'));
    const rLiq = { id: 'rliq', nome: 'Receita líquida', tipo: 'subtotal', v: subV(receita, tributos) };
    const gCustos = CUSTOS.map(g => grupo(g, NOME[g], despPorGrupo(g)));
    const mContrib = { id: 'mcontrib', nome: 'Margem de contribuição', tipo: 'subtotal', v: subV(rLiq, ...gCustos) };
    const gAdmin = ADMIN.map(g => grupo(g, NOME[g], despPorGrupo(g)));
    const ebitda = { id: 'ebitda', nome: 'Resultado operacional (EBITDA)', tipo: 'subtotal', v: subV(mContrib, ...gAdmin) };
    const finLinhas = linhasDe('R', c => c === 'Receitas Financeiras').concat(despPorGrupo('financeiro'));
    const financ = grupo('financeiro', NOME.financeiro, finLinhas);
    const invest = grupo('invest', NOME.invest, despPorGrupo('invest'));
    const liquido = { id: 'liquido', nome: 'Resultado líquido do período', tipo: 'total', v: subV(ebitda, financ, invest) };
    const acum = {}; chaves.forEach(k => { let t = 0; acum[k] = liquido.v[k].map(v => (t += v)); });
    const acumulado = { id: 'acum', nome: 'Resultado acumulado no ano', tipo: 'memo', v: acum };
    const pessoal = gCustos[0], campo = gCustos[1];
    return { receita, tributos, rLiq, gCustos, mContrib, gAdmin, ebitda, financ, invest, liquido, acumulado, pessoal, campo,
      sequencia: [receita, tributos, rLiq, ...gCustos, mContrib, ...gAdmin, ebitda, financ, invest, liquido, acumulado] };
  }

  // janela de meses considerada: caixa no ano corrente = até o mês atual; senão o ano todo
  const janela = d => (d.regime === 'caixa' && d.mesAtual ? d.mesAtual : 12);
  const totalAte = (arr, ate) => arr.slice(0, ate).reduce((a, b) => a + b, 0);
  const tot = (x, k, ate) => totalAte(x.v[k], ate);
  const varPct = (cur, ref) => (Math.abs(ref) < 0.5 ? null : ((cur - ref) / Math.abs(ref)) * 100);
  const fmtNum = v => { if (Math.abs(v) < 0.5) return '—'; const s = nf0.format(Math.abs(v)); return v < 0 ? '(' + s + ')' : s; };
  const cls = v => (v > 0.5 ? 'pos' : v < -0.5 ? 'neg' : '');

  // ---------- colunas conforme a visão ----------
  function colunas(d, ate) {
    if (S.visao === 'anual') return [];
    if (S.visao === 'trimestral') return [0, 1, 2, 3].map(q => ({ rot: 'T' + (q + 1), de: q * 3, ate: q * 3 + 3, futuro: q * 3 >= ate }));
    return MES.map((m, i) => ({ rot: m, de: i, ate: i + 1, futuro: i >= ate }));
  }

  // ---------- DRE (tabela) ----------
  function tabelaDRE(m, d, ate) {
    const cols = colunas(d, ate), regTxt = d.regime === 'caixa' ? 'Realizado' : 'Realizado + previsto';
    const rLiqTot = tot(m.rLiq, 'cur', ate);
    const cab = `<thead><tr><th class="nd-dre-nome">R$ · ${regTxt}</th>${cols.map(c => `<th class="num">${c.rot}</th>`).join('')}
      <th class="num nd-dre-tot">${ate < 12 ? 'Acumulado' : 'Total'}</th><th class="num" title="Análise vertical: % da receita líquida">AV %</th>
      <th class="num" title="Orçado no mesmo período">Orçado</th><th class="num" title="Realizado − orçado (positivo = melhor)">Var. orç.</th>
      <th class="num" title="Ano anterior no mesmo período">${d.ano - 1}</th><th class="num" title="Variação sobre o ano anterior (positivo = melhor)">Var. ano</th></tr></thead>`;
    const celulas = (x, fim) => {
      const cur = tot(x, 'cur', ate), orc = tot(x, 'orc', ate), prev = tot(x, 'prev', ate);
      const dOrc = cur - orc, dPrev = cur - prev, pO = varPct(cur, orc), pP = varPct(cur, prev);
      const mensais = cols.map(c => { const v = x.v.cur.slice(c.de, c.ate).reduce((a, b) => a + b, 0); return `<td class="num ${c.futuro ? 'fut' : cls(v)}">${c.futuro && Math.abs(v) < 0.5 ? '·' : fmtNum(v)}</td>`; }).join('');
      const temOrc = Math.abs(orc) > 0.5, temPrev = Math.abs(prev) > 0.5;
      return `${mensais}<td class="num nd-dre-tot ${cls(cur)}">${fmtNum(cur)}</td>
        <td class="num mut">${Math.abs(rLiqTot) > 0.5 && Math.abs(cur) > 0.5 ? pct((cur / rLiqTot) * 100) : '—'}</td>
        <td class="num mut">${temOrc ? fmtNum(orc) : '—'}</td>
        <td class="num ${temOrc ? cls(dOrc) : 'mut'}">${temOrc ? fmtNum(dOrc) + (pO != null ? `<small>${sPct(pO)}</small>` : '') : '—'}</td>
        <td class="num mut">${temPrev ? fmtNum(prev) : '—'}</td>
        <td class="num ${temPrev ? cls(dPrev) : 'mut'}">${temPrev ? fmtNum(dPrev) + (pP != null ? `<small>${sPct(pP)}</small>` : '') : '—'}</td>`;
    };
    const linhas = [];
    const sinalRot = { receita: '(+)', tributos: '(−)' };
    m.sequencia.forEach(x => {
      if (x.tipo === 'grupo') {
        if (!x.filhos.length) return;
        const aberto = S.abertos.has(x.id), unico = x.filhos.length === 1 && x.filhos[0].nome === x.nome;
        const rot = x.id === 'receita' ? '(+)' : x.id === 'financeiro' ? '(±)' : '(−)';
        linhas.push(`<tr class="nd-dre-grupo ${aberto ? 'aberto' : ''}" data-grupo="${x.id}" tabindex="0" role="button" aria-expanded="${aberto}" title="Mostrar/ocultar as categorias">
          <td class="nd-dre-nome"><span class="nd-dre-seta">${unico ? '' : '▸'}</span><span class="nd-dre-rot">${rot}</span> ${E(x.nome)}<em>${x.filhos.length}</em></td>${celulas(x)}</tr>`);
        if (aberto) x.filhos.forEach(f => linhas.push(`<tr class="nd-dre-linha"><td class="nd-dre-nome">${E(f.nome)}</td>${celulas(f)}</tr>`));
      } else {
        const rot = x.tipo === 'memo' ? '' : '(=)';
        linhas.push(`<tr class="nd-dre-${x.tipo}"><td class="nd-dre-nome"><span class="nd-dre-rot">${rot}</span> ${E(x.nome)}</td>${x.tipo === 'memo' ? celulasMemo(x, cols, ate) : celulas(x)}</tr>`);
      }
    });
    // margens (percentuais sobre a receita líquida)
    const mg = (nome, x) => `<tr class="nd-dre-margem"><td class="nd-dre-nome">${nome}</td>${cols.map(c => { const r = m.rLiq.v.cur.slice(c.de, c.ate).reduce((a, b) => a + b, 0), v = x.v.cur.slice(c.de, c.ate).reduce((a, b) => a + b, 0); return `<td class="num ${c.futuro ? 'fut' : ''}">${c.futuro || Math.abs(r) < 0.5 ? '·' : pct((v / r) * 100)}</td>`; }).join('')}
      <td class="num nd-dre-tot">${Math.abs(rLiqTot) > 0.5 ? pct((tot(x, 'cur', ate) / rLiqTot) * 100) : '—'}</td><td></td>
      <td class="num mut">${Math.abs(tot(m.rLiq, 'orc', ate)) > 0.5 ? pct((tot(x, 'orc', ate) / tot(m.rLiq, 'orc', ate)) * 100) : '—'}</td><td></td>
      <td class="num mut">${Math.abs(tot(m.rLiq, 'prev', ate)) > 0.5 ? pct((tot(x, 'prev', ate) / tot(m.rLiq, 'prev', ate)) * 100) : '—'}</td><td></td></tr>`;
    linhas.push(mg('Margem de contribuição %', m.mContrib), mg('Margem operacional (EBITDA) %', m.ebitda), mg('Margem líquida %', m.liquido));
    return `<div class="nd-dre-rolagem"><table class="nd-dre ${S.visao}">${cab}<tbody>${linhas.join('')}</tbody></table></div>`;
  }
  function celulasMemo(x, cols, ate) {
    return cols.map(c => { const v = x.v.cur[c.ate - 1]; return `<td class="num ${c.futuro ? 'fut' : cls(v)}">${c.futuro ? '·' : fmtNum(v)}</td>`; }).join('') +
      `<td class="num nd-dre-tot ${cls(x.v.cur[ate - 1])}">${fmtNum(x.v.cur[ate - 1])}</td><td></td><td class="num mut">${Math.abs(x.v.orc[ate - 1]) > 0.5 ? fmtNum(x.v.orc[ate - 1]) : '—'}</td><td></td><td class="num mut">${Math.abs(x.v.prev[ate - 1]) > 0.5 ? fmtNum(x.v.prev[ate - 1]) : '—'}</td><td></td>`;
  }

  // ---------- indicadores ----------
  function indicadores(m, d, ate) {
    const T = (x, k) => tot(x, k || 'cur', ate);
    const rec = T(m.receita), recP = T(m.receita, 'prev'), recO = T(m.receita, 'orc');
    const rl = T(m.rLiq), liq = T(m.liquido), liqP = T(m.liquido, 'prev'), eb = T(m.ebitda);
    // custos e despesas totais = tudo que reduz o resultado (grupos de custo/despesa/tributos/investimentos + parte negativa do financeiro)
    const desp = k => -(T(m.tributos, k) + m.gCustos.concat(m.gAdmin).reduce((t, g) => t + T(g, k), 0) + Math.min(0, T(m.financ, k)) + T(m.invest, k));
    const despesa = desp('cur'), despesaP = desp('prev'), despesaO = desp('orc');
    const pessoal = -T(m.pessoal);
    const meses = Math.max(1, ate), burn = despesa / meses;
    const p = d.posicao, runway = burn > 0 ? p.saldoCaixa / burn : null;
    // receita × orçado compara a receita TOTAL (todas as categorias) com o orçamento de receitas inteiro: o orçamento pode estar lançado numa categoria diferente da realizada
    const somaRec = lista => (lista || []).filter(r => r.month <= ate).reduce((t, r) => t + (Number(r.total) || 0), 0), recTot = somaRec(d.atual.rec), recOTot = somaRec(d.orcado.rec);
    const exec = despesaO > 0 ? (despesa / despesaO) * 100 : null, execRec = recOTot > 0 ? (recTot / recOTot) * 100 : null;
    return { rec, recP, recO, recTot, recOTot, rl, liq, liqP, eb, despesa, despesaP, despesaO, pessoal, burn, runway, exec, execRec, meses,
      margLiq: rl > 0 ? (liq / rl) * 100 : null, margEb: rl > 0 ? (eb / rl) * 100 : null, pesoPessoal: rl > 0 ? (pessoal / rl) * 100 : null,
      mensal: { rec: m.receita.v.cur.slice(0, ate), desp: m.receita.v.cur.slice(0, ate).map((_, i) => -(m.tributos.v.cur[i] + m.gCustos.concat(m.gAdmin).reduce((t, g) => t + g.v.cur[i], 0) + Math.min(0, m.financ.v.cur[i]) + m.invest.v.cur[i])), liq: m.liquido.v.cur.slice(0, ate) } };
  }

  function chipDelta(v, inverso) {
    if (v == null || !isFinite(v)) return '';
    const bom = inverso ? v <= 0 : v >= 0;
    return `<span class="nd-chip ${Math.abs(v) < 0.05 ? '' : bom ? 'ok' : 'late'}" title="Variação sobre o mesmo período do ano anterior">${sPct(v)} vs ${S.ano - 1}</span>`;
  }
  const medidor = (valor, marca) => `<div class="nd-rel-med" ${marca ? 'title="A barra cheia é 100% do orçado"' : ''}><i style="width:${Math.max(0, Math.min(100, valor || 0)).toFixed(1)}%" class="${marca && valor > 100 ? 'estouro' : ''}"></i>${marca ? '<b></b>' : ''}</div>`;

  function kpis(K, d) {
    const k = (cls_, rot, valor, det, extra) => `<article class="nd-kpi nd-rel-k ${cls_ || ''}"><div class="nd-kpi-top"><span class="nd-kpi-label">${rot}</span></div><div class="nd-kpi-valor">${valor}</div><div class="nd-rel-det">${det || ''}</div>${extra || ''}</article>`;
    const cor = v => (v >= 0 ? '' : 'red');
    const runwayTxt = K.runway == null ? '—' : K.runway >= 60 ? '60+ meses' : K.runway.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' meses';
    return `<div class="nd-rel-kpis">
      ${k('', 'Receita bruta', brlFull(K.rec), chipDelta(varPct(K.rec, K.recP)) || `${K.meses} mês(es)`, '<canvas class="nd-rel-sp" id="nd-rel-sp-rec" height="38"></canvas>')}
      ${k('', 'Custos e despesas', brlFull(K.despesa), chipDelta(varPct(K.despesa, K.despesaP), true) || `${K.meses} mês(es)`, '<canvas class="nd-rel-sp" id="nd-rel-sp-desp" height="38"></canvas>')}
      ${k(cor(K.liq), 'Resultado líquido', `<span class="${K.liq >= 0 ? 'pos' : 'neg'}">${brlFull(K.liq)}</span>`, `<span class="nd-chip ${K.liq >= 0 ? 'ok' : 'late'}">margem ${pct(K.margLiq)}</span>${K.liqP ? ' ' + chipDelta(varPct(K.liq, K.liqP)) : ''}`, '<canvas class="nd-rel-sp" id="nd-rel-sp-liq" height="38"></canvas>')}
      ${k(cor(K.eb), 'EBITDA', `<span class="${K.eb >= 0 ? 'pos' : 'neg'}">${brlFull(K.eb)}</span>`, `<span class="nd-chip ${K.eb >= 0 ? 'ok' : 'late'}">margem ${pct(K.margEb)}</span> resultado operacional`)}
      ${k('', 'Peso do pessoal', pct(K.pesoPessoal), `${brlFull(K.pessoal)} sobre a receita líquida`, medidor(K.pesoPessoal))}
      ${k(K.exec != null && K.exec > 100 ? 'red' : '', 'Execução do orçamento', K.exec == null ? '—' : pct(K.exec, 0), K.exec == null ? 'sem orçamento de despesas' : `${brlFull(K.despesa)} de ${brlFull(K.despesaO)} orçados`, K.exec == null ? '' : medidor(K.exec, true))}
      ${k(K.execRec != null && K.execRec < 85 ? 'warn' : '', 'Receita × orçado', K.execRec == null ? '—' : pct(K.execRec, 0), K.execRec == null ? 'sem orçamento de receitas' : `${brlFull(K.recTot)} de ${brlFull(K.recOTot)} orçados`, K.execRec == null ? '' : medidor(K.execRec, true))}
      ${k(d.posicao.saldoCaixa < 0 ? 'red' : 'blue', 'Saldo de caixa', brlFull(d.posicao.saldoCaixa), `fôlego de <b>${runwayTxt}</b> · queima média ${brlFull(K.burn)}/mês`)}
    </div>`;
  }

  function posicaoEInsights(m, K, d) {
    const p = d.posicao, liq30 = p.receber30 - p.pagar30;
    const topCli = d.clientes[0], totCli = d.clientes.reduce((t, c) => t + c.total, 0), conc = topCli && K.rec > 0 ? (topCli.total / Math.max(K.rec, totCli)) * 100 : null;
    const mini = (rot, valor, det, tom) => `<div class="nd-rel-mini ${tom || ''}"><span>${rot}</span><b>${valor}</b><small>${det}</small></div>`;
    const ins = [];
    const mesesNeg = m.liquido.v.cur.slice(0, janela(d)).filter(v => v < -0.5).length;
    if (K.liq < 0) ins.push(['late', 'Resultado líquido negativo', `${brlFull(K.liq)} no período (margem ${pct(K.margLiq)}).`]);
    if (mesesNeg) ins.push([mesesNeg >= 3 ? 'late' : 'warn', `${mesesNeg} mês(es) com resultado negativo`, 'Veja a ponte do resultado e os meses em vermelho no DRE.']);
    if (K.exec != null && K.exec > 100) ins.push(['late', 'Despesas acima do orçado', `${pct(K.exec, 0)} do orçamento do período (${brlFull(K.despesa - K.despesaO)} a mais).`]);
    else if (K.exec != null && K.exec < 70 && d.regime === 'caixa') ins.push(['ok', 'Despesas abaixo do orçado', `${pct(K.exec, 0)} do orçamento do período.`]);
    if (K.execRec != null && K.execRec < 90) ins.push(['warn', 'Receita abaixo do orçado', `${pct(K.execRec, 0)} do orçamento de receitas (${brlFull(K.recTot - K.recOTot)}).`]);
    if (K.pesoPessoal != null && K.pesoPessoal >= 60) ins.push([K.pesoPessoal >= 80 ? 'late' : 'warn', 'Pessoal pesa na receita', `${pct(K.pesoPessoal)} da receita líquida vai para pessoal e benefícios.`]);
    if (conc != null && conc >= 70) ins.push(['warn', 'Receita concentrada', `${E(topCli.nome)} responde por ${pct(conc)} da receita.`]);
    if (p.pagarVencido > 0) ins.push(['late', 'Contas a pagar vencidas', `${brlFull(p.pagarVencido)} em atraso.`]);
    if (p.receberVencido > 0) ins.push(['warn', 'Contas a receber vencidas', `${brlFull(p.receberVencido)} em atraso de recebimento.`]);
    if (K.runway != null && K.runway < 6 && K.runway >= 0) ins.push(['late', 'Fôlego de caixa curto', `Caixa cobre ${K.runway.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} meses da queima média.`]);
    if (K.liqP && K.liq > K.liqP && K.liq > 0) ins.push(['ok', 'Resultado acima do ano anterior', `${sPct(varPct(K.liq, K.liqP))} sobre o mesmo período de ${d.ano - 1}.`]);
    if (!ins.length) ins.push(['ok', 'Sem pontos de atenção', 'Nada fora do esperado no período.']);
    return `<div class="nd-rel-duo">
      <article class="nd-card"><div class="nd-card-cab"><h3>Posição financeira</h3><span class="nd-chip">hoje</span></div>
        <div class="nd-rel-minis">
          ${mini('A receber em aberto', brlFull(p.receberAberto), p.receberVencido > 0 ? `<span class="neg">${brlFull(p.receberVencido)} vencido</span>` : 'nada vencido', p.receberVencido > 0 ? 'warn' : '')}
          ${mini('A pagar em aberto', brlFull(p.pagarAberto), p.pagarVencido > 0 ? `<span class="neg">${brlFull(p.pagarVencido)} vencido</span>` : 'nada vencido', p.pagarVencido > 0 ? 'late' : '')}
          ${mini('Próximos 30 dias', `<span class="${liq30 >= 0 ? 'pos' : 'neg'}">${brlFull(liq30)}</span>`, `receber ${compacto(p.receber30)} · pagar ${compacto(p.pagar30)}`)}
          ${mini('Concentração de receita', conc == null ? '—' : pct(conc), conc == null ? 'sem receita no período' : E(topCli.nome).slice(0, 38), conc != null && conc >= 70 ? 'warn' : '')}
        </div></article>
      <article class="nd-card"><div class="nd-card-cab"><h3>Pontos de atenção</h3><span class="nd-chip ${ins.some(i => i[0] === 'late') ? 'late' : ins.some(i => i[0] === 'warn') ? 'warn' : 'ok'}">${ins.length}</span></div>
        <ul class="nd-rel-ins">${ins.slice(0, 6).map(i => `<li class="${i[0]}"><i></i><div><b>${i[1]}</b><span>${i[2]}</span></div></li>`).join('')}</ul></article>
    </div>`;
  }

  // ---------- custos por grupo × orçado ----------
  function gruposCard(m, d, ate) {
    const todos = m.gCustos.concat(m.gAdmin, [m.tributos, m.invest]).filter(g => g.filhos.length);
    const dados = todos.map(g => ({ nome: g.nome, real: -tot(g, 'cur', ate), orc: -tot(g, 'orc', ate), prev: -tot(g, 'prev', ate) })).filter(g => g.real > 0.5 || g.orc > 0.5).sort((a, b) => b.real - a.real);
    const total = dados.reduce((t, g) => t + g.real, 0), maior = Math.max(1, ...dados.map(g => Math.max(g.real, g.orc)));
    const rl = tot(m.rLiq, 'cur', ate);
    return `<article class="nd-card"><div class="nd-card-cab"><h3>Custos e despesas por grupo</h3><span class="nd-chip">${brlFull(total)}</span></div>
      <p class="nd-rel-nota" style="margin:-4px 0 10px">Barra = realizado · risco = orçado do período · chip = realizado ÷ orçado</p>
      <div class="nd-rel-grupos">${dados.map(g => {
        const ex = g.orc > 0.5 ? (g.real / g.orc) * 100 : null;
        return `<div class="nd-rel-gr"><div class="nd-rel-gr-t"><span>${E(g.nome)}</span><b>${brlFull(g.real)}</b>
          <small>${total > 0 ? pct((g.real / total) * 100) : ''}${rl > 0 ? ' · ' + pct((g.real / rl) * 100) + ' da receita' : ''}</small>
          ${ex != null ? `<span class="nd-chip ${ex > 100 ? 'late' : ex > 90 ? 'warn' : 'ok'}" title="Orçado: ${brlFull(g.orc)}">${pct(ex, 0)} do orçado</span>` : '<span class="nd-chip">sem orçamento</span>'}</div>
          <div class="nd-rel-gr-b"><i style="width:${(g.real / maior * 100).toFixed(1)}%" class="${ex != null && ex > 100 ? 'estouro' : ''}"></i>${g.orc > 0.5 ? `<b style="left:${(g.orc / maior * 100).toFixed(1)}%"></b>` : ''}</div></div>`;
      }).join('') || '<p class="nd-rel-nota">Nenhuma despesa no período.</p>'}</div></article>`;
  }

  function rankingCard(tit, lista, total, vazio) {
    const maior = Math.max(1, ...lista.map(x => x.total));
    return `<article class="nd-card"><div class="nd-card-cab"><h3>${tit}</h3><span class="nd-chip">${lista.length}</span></div>
      <ol class="nd-rel-rank">${lista.map((x, i) => `<li><span class="nd-rel-pos">${i + 1}</span><div><div class="nd-rel-rk-t"><b title="${E(x.nome)}">${E(x.nome)}</b><span>${brlFull(x.total)}</span><small>${total > 0 ? pct((x.total / total) * 100) : ''}</small></div>
        <div class="nd-rel-gr-b"><i style="width:${(x.total / maior * 100).toFixed(1)}%"></i></div></div></li>`).join('') || `<li class="nd-rel-nota">${vazio}</li>`}</ol></article>`;
  }

  // ---------- gráficos ----------
  const limpaGraficos = () => { S.graficos.forEach(g => { try { g.destroy(); } catch (e) { /* já destruído */ } }); S.graficos = []; };
  const novoGrafico = (el, cfg) => { if (!el || !window.Chart) return null; const g = typeof makeChart === 'function' ? makeChart(el, cfg) : new Chart(el, cfg); S.graficos.push(g); return g; };

  function graficos(m, K, d, ate) {
    const rotMes = MES.slice(0, 12), rec = m.receita.v.cur, orcDesp = null;
    const desp = rec.map((_, i) => -(m.tributos.v.cur[i] + m.gCustos.concat(m.gAdmin).reduce((t, g) => t + g.v.cur[i], 0) + Math.min(0, m.financ.v.cur[i]) + m.invest.v.cur[i]));
    const recBruta = rec.map((v, i) => v + Math.max(0, m.financ.v.cur[i]));
    const acum = m.acumulado.v.cur;
    novoGrafico($('#nd-rel-ch-mes'), { data: { labels: rotMes, datasets: [
      { type: 'line', label: 'Resultado acumulado', data: acum.map((v, i) => (i < ate ? v : null)), borderColor: CORES.dourado, backgroundColor: CORES.dourado, borderWidth: 2.5, pointRadius: 3, tension: .3, yAxisID: 'y2', order: 0 },
      { type: 'bar', label: 'Receitas', data: recBruta.map((v, i) => (i < ate ? v : null)), backgroundColor: CORES.verde2, borderRadius: 6, borderSkipped: false, maxBarThickness: 22, order: 2 },
      { type: 'bar', label: 'Custos e despesas', data: desp.map((v, i) => (i < ate ? v : null)), backgroundColor: CORES.azul, borderRadius: 6, borderSkipped: false, maxBarThickness: 22, order: 1 }] },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + brlFull(c.parsed.y) } } },
        scales: { x: { grid: { display: false }, border: { display: false } }, y: { border: { display: false }, ticks: { maxTicksLimit: 5, callback: v => (v < 0 ? '−' : '') + compacto(v) } },
          y2: { position: 'right', grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 5, color: CORES.dourado, callback: v => (v < 0 ? '−' : '') + compacto(v) } } } } });
    // ponte do resultado
    const T = x => tot(x, 'cur', ate);
    const passos = [[['Receita', 'líquida'], T(m.rLiq), 'total'], ['Pessoal', T(m.pessoal), 'step'], [['Campo e', 'viagens'], T(m.campo), 'step'], [['Serviços e', 'suprimentos'], T(m.gCustos[2]), 'step'],
      [['Despesas', 'administrativas'], m.gAdmin.reduce((t, g) => t + T(g), 0), 'step'], [['Financeiro e', 'invest.'], T(m.financ) + T(m.invest), 'step'], [['Resultado', 'líquido'], T(m.liquido), 'total']];
    let corre = 0; const faixas = [], cores = [];
    passos.forEach(([, v, tipo]) => {
      if (tipo === 'total') { faixas.push(v >= 0 ? [0, v] : [v, 0]); cores.push(v >= 0 ? CORES.verde : CORES.vermelho); corre = v; }
      else { const ini = corre, fim = corre + v; faixas.push([Math.min(ini, fim), Math.max(ini, fim)]); cores.push(v >= 0 ? CORES.verde2 : CORES.azul); corre = fim; }
    });
    novoGrafico($('#nd-rel-ch-ponte'), { type: 'bar', data: { labels: passos.map(p => p[0]), datasets: [{ data: faixas, backgroundColor: cores, borderRadius: 6, borderSkipped: false, maxBarThickness: 46 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + brlFull(passos[c.dataIndex][1]) } } },
        scales: { x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: false, font: { size: 10.5 } } }, y: { border: { display: false }, ticks: { maxTicksLimit: 5, callback: v => (v < 0 ? '−' : '') + compacto(v) } } } } });
    // sparklines
    if (window.ProagroNovo && ProagroNovo.sparkline) {
      ProagroNovo.sparkline($('#nd-rel-sp-rec'), K.mensal.rec, CORES.verde2, MES);
      ProagroNovo.sparkline($('#nd-rel-sp-desp'), K.mensal.desp, CORES.azul, MES);
      ProagroNovo.sparkline($('#nd-rel-sp-liq'), K.mensal.liq, K.liq >= 0 ? CORES.verde : CORES.vermelho, MES);
    }
  }

  // ---------- Excel ----------
  function exportarExcel(m, d, ate) {
    if (!window.XLSX) { if (typeof toast === 'function') toast('Biblioteca de Excel ainda carregando. Tente novamente em instantes.'); return; }
    const cab = ['DRE ' + d.ano + ' — ' + (d.regime === 'caixa' ? 'regime de caixa' : 'competência (vencimento, com previsto)'), ...MES, ate < 12 ? 'Acumulado' : 'Total', 'AV % (receita líquida)', 'Orçado', 'Var. vs orçado', String(d.ano - 1), 'Var. vs ano anterior'];
    const rows = [cab]; const rl = tot(m.rLiq, 'cur', ate);
    const lin = (nome, x, nivel) => { const cur = tot(x, 'cur', ate), orc = tot(x, 'orc', ate), prev = tot(x, 'prev', ate); rows.push([(nivel ? '    ' : '') + nome, ...x.v.cur.map((v, i) => (i < ate ? Math.round(v * 100) / 100 : null)), Math.round(cur * 100) / 100, Math.abs(rl) > 0.5 ? cur / rl : null, orc || null, orc ? cur - orc : null, prev || null, prev ? cur - prev : null]); };
    m.sequencia.forEach(x => { if (x.tipo === 'grupo') { if (!x.filhos.length) return; lin(x.nome, x, 0); x.filhos.forEach(f => lin(f.nome, f, 1)); } else lin(x.nome, x, 0); });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 42 }, ...Array(12).fill({ wch: 13 }), { wch: 15 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    for (let r = 1; r < rows.length; r++) for (let c = 1; c <= 18; c++) { const ref = XLSX.utils.encode_cell({ r, c }), cell = ws[ref]; if (cell && typeof cell.v === 'number') cell.z = c === 14 ? '0.0%' : '#,##0.00;[Red]-#,##0.00'; }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'DRE ' + d.ano);
    XLSX.writeFile(wb, `dre_${d.ano}_${d.regime}.xlsx`);
  }

  // ---------- montagem ----------
  function cabecalho(d) {
    const seg = (id, lista, atual) => `<div class="nd-seg nd-rel-seg" role="group" data-seg="${id}">${lista.map(([v, t, dica]) => `<button type="button" data-v="${v}" aria-pressed="${atual === v}" ${dica ? `title="${dica}"` : ''}>${t}</button>`).join('')}</div>`;
    return `<div class="nd-rel-barra">
      <div class="nd-rel-ano"><button type="button" data-ano="-1" aria-label="Ano anterior">‹</button><b>${S.ano}</b><button type="button" data-ano="1" aria-label="Próximo ano">›</button></div>
      ${seg('regime', [['caixa', 'Caixa', 'Pago e recebido, na data do pagamento/recebimento'], ['competencia', 'Competência', 'Pelo vencimento, incluindo o que ainda está previsto (a pagar / a receber)']], S.regime)}
      ${seg('visao', [['mensal', 'Mensal'], ['trimestral', 'Trimestral'], ['anual', 'Anual']], S.visao)}
      <span class="nd-rel-ref">${d.regime === 'caixa' ? 'Realizado' : 'Realizado + previsto'}${janela(d) < 12 ? ` · até ${MES[janela(d) - 1]}/${S.ano}` : ` · ${S.ano} completo`} · comparativo ${S.ano - 1}</span>
      <div class="spacer"></div>
      <button type="button" class="nd-rel-bt" id="nd-rel-xls">Exportar Excel</button></div>`;
  }

  function ligaControles(root, m, d, ate) {
    $$('.nd-rel-ano button', root).forEach(b => { b.onclick = () => { gravaSS('rel-year', String(S.ano + Number(b.dataset.ano))); if (typeof renderRelatorios === 'function') renderRelatorios(); }; });
    $$('[data-seg="regime"] button', root).forEach(b => { b.onclick = () => { if (S.regime === b.dataset.v) return; S.regime = b.dataset.v; gravaSS('rel-regime', S.regime); carregar(true); }; });
    $$('[data-seg="visao"] button', root).forEach(b => { b.onclick = () => { S.visao = b.dataset.v; gravaSS('rel-visao', S.visao); desenha(); }; });
    $$('.nd-dre-grupo', root).forEach(tr => {
      const alt = () => { const id = tr.dataset.grupo; if (S.abertos.has(id)) S.abertos.delete(id); else S.abertos.add(id); desenha(); };
      tr.onclick = alt; tr.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alt(); } };
    });
    const tudo = $('#nd-rel-tudo', root); if (tudo) tudo.onclick = () => { const ids = m.sequencia.filter(x => x.tipo === 'grupo' && x.filhos.length).map(x => x.id); if (ids.every(i => S.abertos.has(i))) S.abertos.clear(); else ids.forEach(i => S.abertos.add(i)); desenha(); };
    const x = $('#nd-rel-xls', root); if (x) x.onclick = () => exportarExcel(m, d, ate);
  }

  function desenha() {
    const d = S.dados, c = $('#content'); if (!d || !c) return;
    let root = $('.nd-rel', c); if (!root) { root = document.createElement('div'); root.className = 'nd-rel'; c.appendChild(root); }
    limpaGraficos();
    const m = construir(d), ate = janela(d), K = indicadores(m, d, ate);
    const ids = m.sequencia.filter(x => x.tipo === 'grupo' && x.filhos.length).map(x => x.id), todosAbertos = ids.length && ids.every(i => S.abertos.has(i));
    const topDesp = m.gCustos.concat(m.gAdmin, [m.tributos, m.invest, m.financ]).flatMap(g => g.filhos.map(f => ({ nome: f.nome, total: -tot(f, 'cur', ate) }))).filter(x => x.total > 0.5).sort((a, b) => b.total - a.total).slice(0, 8);
    const totDesp = K.despesa, totCli = d.clientes.reduce((t, x) => t + x.total, 0), totForn = d.fornecedores.reduce((t, x) => t + x.total, 0);
    root.innerHTML = `${cabecalho(d)}
      ${kpis(K, d)}
      ${posicaoEInsights(m, K, d)}
      <article class="nd-card nd-rel-dre"><div class="nd-card-cab"><div><h3>DRE — Demonstração do Resultado do Exercício</h3><p class="nd-rel-nota">${d.regime === 'caixa' ? 'Regime de caixa: o que foi efetivamente pago e recebido.' : 'Competência: pelo vencimento, incluindo o que ainda está previsto.'} Valores em R$; custos e despesas entre parênteses.</p></div>
        <button type="button" class="nd-rel-bt" id="nd-rel-tudo">${todosAbertos ? 'Recolher grupos' : 'Expandir grupos'}</button></div>
        ${tabelaDRE(m, d, ate)}</article>
      <div class="nd-rel-duo nd-rel-duo-graf">
        <article class="nd-card"><div class="nd-card-cab"><h3>Receitas, custos e resultado acumulado</h3><span class="nd-chip">${S.ano}</span></div><div class="nd-rel-graf"><canvas id="nd-rel-ch-mes"></canvas></div></article>
        <article class="nd-card"><div class="nd-card-cab"><h3>Ponte do resultado</h3><span class="nd-chip">da receita líquida ao resultado</span></div><div class="nd-rel-graf"><canvas id="nd-rel-ch-ponte"></canvas></div></article>
      </div>
      <div class="nd-rel-duo nd-rel-duo-gr">${gruposCard(m, d, ate)}${rankingCard('Maiores categorias de despesa', topDesp, totDesp, 'Sem despesas no período.')}</div>
      <div class="nd-rel-duo">${rankingCard('Principais fornecedores', d.fornecedores, totForn, 'Sem pagamentos no período.')}${rankingCard('Origem da receita (clientes)', d.clientes, totCli, 'Sem receitas no período.')}</div>`;
    ligaControles(root, m, d, ate);
    graficos(m, K, d, ate);
    if (window.ProagroNovo && ProagroNovo.contar) ProagroNovo.contar(root);
  }

  async function carregar(manterTela) {
    const c = $('#content'); if (!c) return;
    const meu = ++S.token;
    S.ano = Number(lerSS('rel-year', String(new Date().getFullYear())));
    let root = $('.nd-rel', c);
    if (!root) { root = document.createElement('div'); root.className = 'nd-rel'; c.appendChild(root); }
    if (!manterTela || !S.dados) root.innerHTML = '<div class="nd-card nd-rel-carrega"><span class="nd-rel-spin"></span> Montando o relatório gerencial…</div>'; else root.classList.add('nd-rel-atualiza');
    let d;
    try { d = await api(`/api/reports/dre/${S.ano}?regime=${S.regime}`); } catch (e) { if (meu === S.token) root.innerHTML = `<div class="nd-card nd-rel-carrega"><b>Não foi possível montar o relatório</b><span>${E(e.message || '')}</span></div>`; return; }
    if (meu !== S.token || !$('.nd-rel')) return;
    root.classList.remove('nd-rel-atualiza');
    S.dados = d;
    desenha();
  }

  function aplica() {
    if (!novo()) return; const c = $('#content'); if (!c || !window.ProagroRel) return;
    $$('#content > *').forEach(el => { if (!el.classList.contains('nd-rel')) el.classList.add('nd-rel-orig'); });
    S.regime = lerSS('rel-regime', 'caixa') === 'competencia' ? 'competencia' : 'caixa';
    S.visao = ['trimestral', 'anual'].includes(lerSS('rel-visao', 'mensal')) ? lerSS('rel-visao', 'mensal') : 'mensal';
    S.dados = null; carregar(false);
  }
  document.addEventListener('proagro:rel', aplica);
  window.ProagroNovo = Object.assign(window.ProagroNovo || {}, { relatorios: aplica });
})();
