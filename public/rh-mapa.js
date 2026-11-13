/* ============================================================
   ONDE ESTAMOS — Recursos Humanos > Painel. Mapa do Brasil com a distribuição da equipe, redesenhado (Clássico e Novo):
   · KPIs no topo (pessoas no mapa, estados, cidades, maior polo, maior cidade) e faixa por região (clique aproxima);
   · filtros por departamento e modelo de trabalho (o mapa, os KPIs e as listas recalculam) e busca por pessoa (acha a cidade dela no mapa);
   · mapa explorável: zoom (+/−, Ctrl + rolagem, duplo clique), arrastar, "Equipe"/"Brasil"; estados pintados pela quantidade; cidades próximas viram um
     grupo com o total e se separam ao aproximar; nomes das cidades onde couber; seleção com pulso; dica com cidades e pessoas;
   · painel ao lado com abas Estados / Cidades / Pessoas ligadas ao mapa (passar o mouse destaca; clicar aproxima e seleciona).
   Local = cidade-base do colaborador (a mesma de Viáticos); sem ela, a cidade de residência do cadastro de RH.
   Dados: headcount.localizacao de /api/rh/painel. Geometria: BR_MAPA (br-mapa.js, malha do IBGE). Coordenadas: BR_LOCALIDADES.coords. Usa esc() de app.js.
   ============================================================ */
function rhMapaRender(el, pessoas) {
  if (!el || typeof BR_MAPA === 'undefined') return;
  const E = v => (typeof esc === 'function' ? esc(v) : String(v == null ? '' : v));
  const NOME_UF = {};
  ((typeof BR_LOCALIDADES !== 'undefined' && BR_LOCALIDADES.estados) || []).forEach(e => { NOME_UF[e.uf] = e.nome; });
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const coordsDe = (uf, mun) => {
    const t = typeof BR_LOCALIDADES !== 'undefined' && BR_LOCALIDADES.coords && BR_LOCALIDADES.coords[uf];
    if (!t || !mun) return null;
    if (t[mun]) return t[mun];
    const k = Object.keys(t).find(n => norm(n) === norm(mun));
    return k ? t[k] : null;
  };
  const MODELO = { presencial: 'Presencial', externo: 'Jornada externa', home_office: 'Home office', hibrido: 'Híbrido' };
  const REGIOES = [['N', 'Norte', ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO']], ['NE', 'Nordeste', ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE']], ['CO', 'Centro-Oeste', ['DF', 'GO', 'MT', 'MS']], ['SE', 'Sudeste', ['ES', 'MG', 'RJ', 'SP']], ['S', 'Sul', ['PR', 'SC', 'RS']]];
  const REG_DE = {}; REGIOES.forEach(([k, , ufs]) => ufs.forEach(u => { REG_DE[u] = k; }));
  const REG_COR = { N: '#2F8F6B', NE: '#C9922A', CO: '#4A78A8', SE: '#1F4E78', S: '#00783F' };
  const plural = (n, s, p) => n + ' ' + (n === 1 ? s : p);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0) + '%';

  // ---------- pessoas normalizadas ----------
  const todas = (pessoas || []).map(p => {
    const ok = !!(p.uf && BR_MAPA.ufs[p.uf]), xy = ok ? coordsDe(p.uf, p.municipio) : null;
    return { ...p, ok, cidade: p.municipio || '— cidade não informada —', X: ok ? (xy ? xy[1] : BR_MAPA.ufs[p.uf].c.lon) : null, Y: ok ? -(xy ? xy[0] : BR_MAPA.ufs[p.uf].c.lat) : null, aprox: ok && !xy, reg: ok ? REG_DE[p.uf] : null };
  });
  const semLocal = todas.filter(p => !p.ok), total = todas.length;
  if (!todas.some(p => p.ok)) { el.innerHTML = '<p class="rh-nota">Nenhum colaborador ativo tem cidade-base ou cidade de residência preenchida.</p>'; return; }
  const deps = [...new Set(todas.map(p => p.departamento).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const mods = [...new Set(todas.map(p => p.modelo).filter(Boolean))].sort();
  const deResidencia = todas.filter(p => p.origem === 'residencia').length;
  const S = { dep: null, mod: null, busca: '', aba: 'estados', sel: null };   // sel = { uf } ou { uf, cidade }

  // ---------- recálculo com os filtros ----------
  function calc() {
    const lista = todas.filter(p => p.ok && (!S.dep || p.departamento === S.dep) && (!S.mod || p.modelo === S.mod));
    const porUF = {}, cidades = [], porCid = new Map(), reg = {};
    lista.forEach(p => {
      const u = porUF[p.uf] || (porUF[p.uf] = { uf: p.uf, n: 0, cidades: [] }); u.n++;
      const k = p.uf + '|' + p.cidade; let c = porCid.get(k);
      if (!c) { c = { uf: p.uf, nome: p.cidade, n: 0, pessoas: [], X: p.X, Y: p.Y, aprox: p.aprox }; porCid.set(k, c); cidades.push(c); u.cidades.push(c); }
      c.n++; c.pessoas.push(p); reg[p.reg] = (reg[p.reg] || 0) + 1;
    });
    const estados = Object.values(porUF).sort((a, b) => b.n - a.n || a.uf.localeCompare(b.uf));
    estados.forEach(u => u.cidades.sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome)));
    cidades.sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome));
    return { lista, porUF, cidades, estados, reg, n: lista.length, maxN: Math.max(1, ...estados.map(u => u.n)) };
  }
  let D = calc();
  const nivel = n => (n ? Math.min(4, Math.max(1, Math.ceil((4 * n) / D.maxN))) : 0);

  // ---------- esqueleto ----------
  const paths = Object.entries(BR_MAPA.ufs).map(([uf, g]) => `<path class="uf" data-uf="${uf}" d="${g.d}"></path>`).join('');
  const chips = (tipo, itens, rot) => `<div class="rhm-chips" data-f="${tipo}"><span class="rhm-chips-rot">${rot}</span><button type="button" class="rhm-chip on" data-v="">Todos</button>${itens.map(v => `<button type="button" class="rhm-chip" data-v="${E(v)}">${E(tipo === 'mod' ? (MODELO[v] || v) : v)}</button>`).join('')}</div>`;
  el.innerHTML = `<div class="rhm">
      <div class="rhm-kpis" id="rhm-kpis"></div>
      <div class="rhm-reg" id="rhm-reg"></div>
      <div class="rhm-barra">
        ${deps.length ? chips('dep', deps, 'Departamento') : ''}${mods.length ? chips('mod', mods, 'Modelo') : ''}
        <label class="rhm-busca"><span aria-hidden="true">⌕</span><input type="search" id="rhm-busca" placeholder="Buscar pessoa ou cidade…" autocomplete="off"></label>
      </div>
      <div class="rhm-grid">
        <div class="rhm-fig">
          <svg class="rhm-svg" viewBox="${BR_MAPA.viewBox}" role="img" aria-label="Mapa do Brasil com a distribuição dos colaboradores por estado e cidade"><g class="ufs" transform="scale(0.0001,-0.0001)">${paths}</g><g class="rots"></g><g class="pts"></g><g class="lbls"></g></svg>
          <div class="rhm-ctl" role="group" aria-label="Controles do mapa">
            <button type="button" data-z="in" title="Aproximar" aria-label="Aproximar">+</button><button type="button" data-z="out" title="Afastar" aria-label="Afastar">−</button>
            <button type="button" data-z="equipe" title="Enquadrar a equipe" aria-label="Enquadrar a equipe">◎</button><button type="button" data-z="brasil" title="Brasil inteiro" aria-label="Brasil inteiro">⌂</button>
          </div>
          <div class="rhm-dica" hidden></div>
          <div class="rhm-leg"><span class="rhm-leg-esc"><i class="n1"></i><i class="n2"></i><i class="n3"></i><i class="n4"></i></span><span>menos → mais pessoas no estado</span><span class="rhm-leg-b"><i></i>cidade</span><span class="rhm-leg-b g"><i>5</i>grupo de cidades (clique para abrir)</span></div>
          <p class="rhm-ajuda">Arraste para mover · Ctrl + rolagem ou duplo clique para ampliar · clique num estado, cidade ou grupo para aproximar.</p>
        </div>
        <div class="rhm-painel">
          <div class="rhm-abas" role="tablist"><button type="button" role="tab" data-aba="estados" aria-selected="true">Estados</button><button type="button" role="tab" data-aba="cidades" aria-selected="false">Cidades</button><button type="button" role="tab" data-aba="pessoas" aria-selected="false">Pessoas</button></div>
          <div class="rhm-lista" id="rhm-lista"></div>
          ${semLocal.length ? `<p class="rhm-alerta"><b>${plural(semLocal.length, 'colaborador sem localização', 'colaboradores sem localização')}:</b> ${E(semLocal.map(p => p.nome).join(' · '))}. Preencha a cidade-base (Viáticos › Configurações) ou o endereço na ficha.</p>` : ''}
          <p class="rhm-nota">Local = cidade-base do colaborador (a mesma de Viáticos)${deResidencia ? `; para ${plural(deResidencia, 'pessoa', 'pessoas')} sem cidade-base vale a cidade de residência` : ''}. ${total} colaboradores ativos.</p>
        </div>
      </div></div>`;
  const $ = s => el.querySelector(s), $$ = (s, r) => [...(r || el).querySelectorAll(s)];
  const svg = $('.rhm-svg'), fig = $('.rhm-fig'), dica = $('.rhm-dica'), gRot = svg.querySelector('.rots'), gPts = svg.querySelector('.pts'), gLbl = svg.querySelector('.lbls');

  // ---------- KPIs, regiões e listas ----------
  function kpis() {
    const top = D.estados[0], regs = REGIOES.filter(r => D.reg[r[0]]).length, filtrado = S.dep || S.mod;
    const tile = (rot, val, sub, cls) => `<div class="rhm-k ${cls || ''}"><span class="rhm-k-rot">${rot}</span><b class="rhm-k-val">${val}</b><span class="rhm-k-sub">${sub}</span></div>`;
    $('#rhm-kpis').innerHTML = D.n
      ? tile('Pessoas no mapa', D.n, filtrado ? `de ${total} ativos · filtro aplicado` : `${D.n === total ? 'todos os' : 'de'} ${total} ativos`, 'dest')
      + tile('Estados', D.estados.length, `${plural(regs, 'região', 'regiões')} do país`)
      + tile('Cidades', D.cidades.length, `${plural(D.cidades.filter(c => c.n === 1).length, 'cidade', 'cidades')} com 1 pessoa`)
      + tile('Maior polo', top ? `${top.uf} · ${pct(top.n, D.n)}` : '—', top ? `${NOME_UF[top.uf] || top.uf} · ${plural(top.n, 'pessoa', 'pessoas')}` : '—')
      + tile('Maior cidade', D.cidades[0] ? E(D.cidades[0].nome) : '—', D.cidades[0] ? `${D.cidades[0].uf} · ${plural(D.cidades[0].n, 'pessoa', 'pessoas')}` : '—')
      : tile('Pessoas no mapa', 0, 'nenhuma pessoa com esses filtros', 'dest');
    const seg = REGIOES.filter(r => D.reg[r[0]]);
    $('#rhm-reg').innerHTML = D.n ? `<div class="rhm-reg-barra">${seg.map(r => `<button type="button" data-reg="${r[0]}" style="flex:${D.reg[r[0]]};background:${REG_COR[r[0]]}" title="${r[1]}: ${plural(D.reg[r[0]], 'pessoa', 'pessoas')}"><span>${pct(D.reg[r[0]], D.n)}</span></button>`).join('')}</div>
      <div class="rhm-reg-leg">${seg.map(r => `<button type="button" data-reg="${r[0]}"><i style="background:${REG_COR[r[0]]}"></i>${r[1]} <b>${D.reg[r[0]]}</b> <small>${pct(D.reg[r[0]], D.n)}</small></button>`).join('')}</div>` : '';
    $$('#rhm-reg [data-reg]').forEach(b => b.addEventListener('click', () => { const ufs = REGIOES.find(r => r[0] === b.dataset.reg)[2].filter(u => D.porUF[u]); S.sel = null; pintar(); lista(); vaiPara(caixaDe(ufs.map(u => BR_MAPA.ufs[u].b))); }));
  }
  const iniciais = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  const pessoaLinha = p => `<li class="rhm-pessoa" data-uf="${p.uf}" data-cidade="${E(p.cidade)}"><span class="rhm-av">${E(iniciais(p.nome))}</span><div><b>${E(p.nome)}</b><span>${E([p.departamento, MODELO[p.modelo] || p.modelo].filter(Boolean).join(' · ') || '—')}</span></div><em>${E(p.cidade)}<small>${p.uf}</small></em></li>`;
  function lista() {
    const box = $('#rhm-lista'), b = norm(S.busca);
    $$('.rhm-abas [role=tab]').forEach(t => t.setAttribute('aria-selected', String(t.dataset.aba === S.aba)));
    if (!D.n) { box.innerHTML = '<p class="rhm-vazio">Nenhuma pessoa com esses filtros.</p>'; return; }
    if (S.aba === 'estados') {
      box.innerHTML = `<ul class="rhm-ufs">${D.estados.map(u => `<li class="rhm-uf ${S.sel && S.sel.uf === u.uf ? 'sel' : ''}" data-uf="${u.uf}">
          <button type="button" class="rhm-uf-cab"><span class="sg" style="--c:${REG_COR[REG_DE[u.uf]]}">${u.uf}</span><span class="nm">${E(NOME_UF[u.uf] || u.uf)}<small>${plural(u.cidades.length, 'cidade', 'cidades')}</small></span><span class="bar"><i style="width:${(u.n / D.maxN * 100).toFixed(1)}%"></i></span><b>${u.n}</b><span class="pc">${pct(u.n, D.n)}</span></button>
          <div class="rhm-uf-cid">${u.cidades.map(c => `<button type="button" class="rhm-cid-chip ${S.sel && S.sel.cidade === c.nome && S.sel.uf === u.uf ? 'sel' : ''}" data-uf="${u.uf}" data-cidade="${E(c.nome)}" title="${E(c.pessoas.map(p => p.nome).join(', '))}">${E(c.nome)} <b>${c.n}</b></button>`).join('')}</div></li>`).join('')}</ul>`;
    } else if (S.aba === 'cidades') {
      box.innerHTML = `<ul class="rhm-cids">${D.cidades.map(c => `<li class="rhm-cid ${S.sel && S.sel.cidade === c.nome && S.sel.uf === c.uf ? 'sel' : ''}" data-uf="${c.uf}" data-cidade="${E(c.nome)}"><button type="button"><span class="n" style="--c:${REG_COR[REG_DE[c.uf]]}">${c.n}</span><div><b>${E(c.nome)} <small>${c.uf}</small></b><span>${E(c.pessoas.map(p => String(p.nome).split(' ')[0]).join(', '))}${c.aprox ? ' · posição aproximada' : ''}</span></div></button></li>`).join('')}</ul>`;
    } else {
      const ps = D.lista.filter(p => !b || norm(p.nome).includes(b) || norm(p.cidade).includes(b) || norm(p.departamento).includes(b)).sort((x, y) => String(x.nome).localeCompare(String(y.nome)));
      box.innerHTML = ps.length ? `<ul class="rhm-pessoas">${ps.map(pessoaLinha).join('')}</ul>` : `<p class="rhm-vazio">Ninguém encontrado para “${E(S.busca)}”.</p>`;
    }
    $$('.rhm-uf-cab', box).forEach(bt => bt.addEventListener('click', () => { const uf = bt.closest('.rhm-uf').dataset.uf; seleciona(S.sel && S.sel.uf === uf && !S.sel.cidade ? null : { uf }); if (S.sel) vaiPara(noEstado(uf)); }));
    $$('.rhm-cid-chip, .rhm-cid button, .rhm-pessoa', box).forEach(n => n.addEventListener('click', () => { const h = n.closest('[data-uf]'); seleciona({ uf: h.dataset.uf, cidade: h.dataset.cidade }); vaiCidade(h.dataset.uf, h.dataset.cidade); }));
    $$('[data-uf]', box).forEach(n => { n.addEventListener('mouseenter', () => marca(n.dataset.uf, true, n.dataset.cidade)); n.addEventListener('mouseleave', () => marca(n.dataset.uf, false, n.dataset.cidade)); });
  }
  function pintar() {
    svg.querySelectorAll('.uf').forEach(p => { const u = D.porUF[p.dataset.uf]; p.setAttribute('class', `uf n${nivel(u ? u.n : 0)}${u ? ' tem' : ''}${S.sel && S.sel.uf === p.dataset.uf ? ' sel' : ''}`); });
    desenha();
  }
  function seleciona(sel) { S.sel = sel; pintar(); lista(); }
  function atualiza() { D = calc(); kpis(); pintar(); lista(); }

  // ---------- câmera ----------
  const [FX, FY, FW, FH] = BR_MAPA.viewBox.split(' ').map(Number), ASP = FW / FH;
  let vb = [FX, FY, FW, FH], clusters = [], anim = 0, movido = false, arrasto = null;
  const larguraPx = () => Math.max(200, svg.getBoundingClientRect().width || 600);
  const prende = (x, y, w) => { w = Math.min(FW, Math.max(0.8, w)); const hh = w / ASP; return [Math.min(FX + FW - w, Math.max(FX, x)), Math.min(FY + FH - hh, Math.max(FY, y)), w, hh]; };
  const aplica = () => { svg.setAttribute('viewBox', vb.map(v => +v.toFixed(4)).join(' ')); desenha(); };
  const vaiPara = (alvo, imediato) => {
    clearTimeout(anim); alvo = prende(alvo[0], alvo[1], alvo[2]);
    if (imediato || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { vb = alvo; aplica(); return; }
    const ini = vb.slice(), t0 = performance.now(), dur = 360, suave = t => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const passo = () => { const t = Math.min(1, (performance.now() - t0) / dur), k = suave(t); vb = ini.map((v, i) => v + (alvo[i] - v) * k); aplica(); if (t < 1) anim = setTimeout(passo, 16); };
    anim = setTimeout(passo, 16);
  };
  const enquadra = (x0, y0, x1, y1, folga) => { const w = Math.max(x1 - x0, (y1 - y0) * ASP) * (1 + (folga == null ? 0.35 : folga)) + 1.2; return [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - w / ASP / 2, w]; };
  const caixaDe = bs => enquadra(Math.min(...bs.map(b => b[0])), Math.min(...bs.map(b => b[1])), Math.max(...bs.map(b => b[2])), Math.max(...bs.map(b => b[3])), 0.2);
  const noEstado = uf => caixaDe([BR_MAPA.ufs[uf].b]);
  const naEquipe = () => { const cs = D.cidades.length ? D.cidades : todas.filter(p => p.ok); const xs = cs.map(c => c.X), ys = cs.map(c => c.Y); return enquadra(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), 0.3); };
  const vaiCidade = (uf, nome) => { const c = D.cidades.find(x => x.uf === uf && x.nome === nome); if (!c) return; const w = Math.min(vb[2], 3.2); vaiPara([c.X - w / 2, c.Y - w / ASP / 2, w]); };
  const zoomEm = (fator, px, py) => {
    const w = Math.min(FW, Math.max(0.8, vb[2] * fator)), cx = px == null ? vb[0] + vb[2] / 2 : px, cy = py == null ? vb[1] + vb[3] / 2 : py;
    vaiPara([cx - (cx - vb[0]) / vb[2] * w, cy - (cy - vb[1]) / vb[3] * (w / ASP), w], true);
  };
  const unidadePorPx = () => vb[2] / larguraPx();

  // ---------- desenho dependente do zoom ----------
  const medidor = (() => { const c = document.createElement('canvas').getContext('2d'); c.font = '600 13px "DM Sans", "Segoe UI", sans-serif'; return t => c.measureText(t).width; })();
  const raioPx = n => 7 + 2.8 * Math.sqrt(n);
  function agrupa(pxU) {
    const cs = [];
    D.cidades.forEach(c => {
      const alvo = cs.find(g => Math.hypot((g.X - c.X) * pxU, (g.Y - c.Y) * pxU) < 0.72 * (raioPx(g.n) + raioPx(c.n)));
      if (alvo) { alvo.X = (alvo.X * alvo.n + c.X * c.n) / (alvo.n + c.n); alvo.Y = (alvo.Y * alvo.n + c.Y * c.n) / (alvo.n + c.n); alvo.n += c.n; alvo.cidades.push(c); }
      else cs.push({ X: c.X, Y: c.Y, n: c.n, cidades: [c] });
    });
    return cs;
  }
  function desenha() {
    const px = larguraPx(), pxU = px / vb[2], u = 1 / pxU;
    gRot.innerHTML = Object.entries(BR_MAPA.ufs).filter(([, g]) => g.c.lon >= vb[0] - 1 && g.c.lon <= vb[0] + vb[2] + 1 && -g.c.lat >= vb[1] - 1 && -g.c.lat <= vb[1] + vb[3] + 1)
      .map(([uf, g]) => `<text class="${D.porUF[uf] ? 'tem' : ''}" x="${g.c.lon}" y="${-g.c.lat}" style="font-size:${(D.porUF[uf] ? 12.5 : 11) * u}px;stroke-width:${3 * u}px" text-anchor="middle" dy=".35em">${uf}</text>`).join('');
    clusters = agrupa(pxU);
    const vis = clusters.map((g, i) => ({ g, i, x: (g.X - vb[0]) * pxU, y: (g.Y - vb[1]) * pxU, r: raioPx(g.n) })).filter(o => o.x > -30 && o.x < px + 30 && o.y > -30 && o.y < px / ASP + 30);
    gPts.innerHTML = vis.map(o => {
      const varias = o.g.cidades.length > 1, sel = S.sel && S.sel.cidade && o.g.cidades.some(c => c.uf === S.sel.uf && c.nome === S.sel.cidade);
      return `<g class="pt${varias ? ' grupo' : ''}${!varias && o.g.cidades[0].aprox ? ' aprox' : ''}${sel ? ' sel' : ''}" data-i="${o.i}" tabindex="0">${sel ? `<circle class="pulso" cx="${o.g.X}" cy="${o.g.Y}" r="${o.r * u}"/>` : ''}<circle cx="${o.g.X}" cy="${o.g.Y}" r="${o.r * u}"/>${o.g.n > 1 || varias ? `<text x="${o.g.X}" y="${o.g.Y}" dy=".35em" text-anchor="middle" style="font-size:${(o.r >= 12 ? 14 : 12.5) * u}px">${o.g.n}</text>` : ''}</g>`;
    }).join('');
    const ocup = vis.map(o => [o.x - o.r - 2, o.y - o.r - 2, o.x + o.r + 2, o.y + o.r + 2]), colide = (a, b) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
    const lbls = [];
    vis.filter(o => o.g.cidades.length === 1).sort((a, b) => b.g.n - a.g.n).forEach(o => {
      const nome = o.g.cidades[0].nome, w = medidor(nome) + 6, h = 17, r = o.r + 4;
      const tent = [['start', o.x + r, o.y, [o.x + r, o.y - h / 2, o.x + r + w, o.y + h / 2]], ['end', o.x - r, o.y, [o.x - r - w, o.y - h / 2, o.x - r, o.y + h / 2]],
        ['middle', o.x, o.y - o.r - 9, [o.x - w / 2, o.y - o.r - 17, o.x + w / 2, o.y - o.r - 1]], ['middle', o.x, o.y + o.r + 10, [o.x - w / 2, o.y + o.r + 1, o.x + w / 2, o.y + o.r + 17]]];
      const ok = tent.find(t => t[3][0] > 0 && t[3][2] < px && t[3][1] > 0 && !ocup.some(b => colide(t[3], b)));
      if (!ok) return;
      ocup.push(ok[3]);
      lbls.push(`<text class="nome" x="${vb[0] + ok[1] * u}" y="${vb[1] + ok[2] * u}" dy=".35em" text-anchor="${ok[0]}" style="font-size:${13 * u}px;stroke-width:${3.4 * u}px">${E(nome)}</text>`);
    });
    gLbl.innerHTML = lbls.join('');
    const zoomado = vb[2] < FW * 0.98;
    $('.rhm-ctl [data-z="out"]').disabled = !zoomado; $('.rhm-ctl [data-z="in"]').disabled = vb[2] <= 0.85;
    svg.classList.toggle('zoomado', zoomado);
  }

  // ---------- destaque e dicas ----------
  const marca = (uf, on, cidade) => {
    const p = svg.querySelector(`.uf[data-uf="${uf}"]`); if (p) p.classList.toggle('hl', on);
    if (cidade) clusters.forEach((g, i) => { if (g.cidades.some(c => c.uf === uf && c.nome === cidade)) { const n = gPts.querySelector(`[data-i="${i}"]`); if (n) n.classList.toggle('hl', on); } });
  };
  const limpaHl = () => el.querySelectorAll('.hl').forEach(n => n.classList.remove('hl'));
  const textoUF = uf => { const u = D.porUF[uf]; if (!u) return `<b>${E(NOME_UF[uf] || uf)}</b><span>nenhum colaborador${S.dep || S.mod ? ' com esses filtros' : ''}</span>`;
    return `<b>${E(NOME_UF[uf] || uf)}</b><span>${plural(u.n, 'colaborador', 'colaboradores')} · ${plural(u.cidades.length, 'cidade', 'cidades')} · clique para aproximar</span><ul>${u.cidades.slice(0, 10).map(c => `<li>${E(c.nome)} <em>${c.n}</em></li>`).join('')}${u.cidades.length > 10 ? `<li>… e mais ${u.cidades.length - 10}</li>` : ''}</ul>`; };
  const textoGrupo = g => {
    if (g.cidades.length === 1) { const c = g.cidades[0]; return `<b>${E(c.nome)}/${c.uf}</b><span>${plural(c.n, 'colaborador', 'colaboradores')}${c.aprox ? ' · posição aproximada' : ''}</span><ul>${c.pessoas.map(p => `<li>${E(p.nome)}<em>${E(p.departamento || '')}</em></li>`).join('')}</ul>`; }
    const ord = [...g.cidades].sort((a, b) => b.n - a.n);
    return `<b>${plural(g.n, 'colaborador', 'colaboradores')} em ${plural(g.cidades.length, 'cidade', 'cidades')}</b><span>clique para abrir o grupo</span><ul>${ord.slice(0, 12).map(c => `<li>${E(c.nome)}/${c.uf} <em>${c.n}</em></li>`).join('')}${ord.length > 12 ? `<li>… e mais ${ord.length - 12}</li>` : ''}</ul>`;
  };
  const mostra = (ev, html) => {
    dica.innerHTML = html; dica.hidden = false;
    const r = fig.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    dica.style.left = Math.min(Math.max(8, x + 14), Math.max(8, r.width - dica.offsetWidth - 8)) + 'px';
    dica.style.top = Math.min(Math.max(8, y + 14), Math.max(8, r.height - dica.offsetHeight - 8)) + 'px';
  };
  const esconde = () => { dica.hidden = true; limpaHl(); };
  const grupoDe = alvo => { const n = alvo.closest && alvo.closest('.pt'); return n ? clusters[Number(n.dataset.i)] : null; };
  const unidadeDoPonto = ev => { const r = svg.getBoundingClientRect(), u = unidadePorPx(); return [vb[0] + (ev.clientX - r.left) * u, vb[1] + (ev.clientY - r.top) * u]; };

  svg.addEventListener('mousemove', ev => {
    if (arrasto && movido) return;
    const g = grupoDe(ev.target); limpaHl();
    if (g) { mostra(ev, textoGrupo(g)); g.cidades.forEach(c => marca(c.uf, true)); return; }
    const p = ev.target.closest && ev.target.closest('.uf');
    if (p) { marca(p.dataset.uf, true); mostra(ev, textoUF(p.dataset.uf)); } else dica.hidden = true;
  });
  svg.addEventListener('mouseleave', esconde);
  svg.addEventListener('focusin', ev => { const g = grupoDe(ev.target); if (g) { const r = ev.target.getBoundingClientRect(); mostra({ clientX: r.left + r.width / 2, clientY: r.top }, textoGrupo(g)); } });
  svg.addEventListener('focusout', esconde);
  svg.addEventListener('click', ev => {
    if (movido) { movido = false; return; }
    const g = grupoDe(ev.target);
    if (g) {
      dica.hidden = true;
      if (g.cidades.length > 1) { const xs = g.cidades.map(c => c.X), ys = g.cidades.map(c => c.Y); vaiPara(enquadra(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), 0.6)); }
      else { const c = g.cidades[0]; seleciona({ uf: c.uf, cidade: c.nome }); vaiCidade(c.uf, c.nome); }
      return;
    }
    const p = ev.target.closest && ev.target.closest('.uf');
    if (p && D.porUF[p.dataset.uf]) { dica.hidden = true; if (S.aba === 'pessoas') S.aba = 'estados'; seleciona({ uf: p.dataset.uf }); vaiPara(noEstado(p.dataset.uf)); const li = $(`.rhm-uf[data-uf="${p.dataset.uf}"]`); if (li) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  });
  svg.addEventListener('dblclick', ev => { ev.preventDefault(); const [x, y] = unidadeDoPonto(ev), w = Math.max(0.8, vb[2] / 2); vaiPara([x - (x - vb[0]) / vb[2] * w, y - (y - vb[1]) / vb[3] * (w / ASP), w]); });
  svg.addEventListener('wheel', ev => { if (!(ev.ctrlKey || ev.metaKey)) return; ev.preventDefault(); const [x, y] = unidadeDoPonto(ev); zoomEm(Math.exp(ev.deltaY * 0.0022), x, y); }, { passive: false });
  svg.addEventListener('pointerdown', ev => { if (ev.button !== 0 || vb[2] >= FW * 0.98) return; arrasto = { x: ev.clientX, y: ev.clientY, vb: vb.slice(), id: ev.pointerId }; movido = false; });
  svg.addEventListener('pointermove', ev => {
    if (!arrasto) return; const dx = ev.clientX - arrasto.x, dy = ev.clientY - arrasto.y;
    if (!movido && Math.hypot(dx, dy) < 5) return;
    if (!movido) { movido = true; dica.hidden = true; try { svg.setPointerCapture(arrasto.id); } catch (e) { /* sem captura */ } svg.classList.add('arrastando'); }
    const u = unidadePorPx(); vb = prende(arrasto.vb[0] - dx * u, arrasto.vb[1] - dy * u, arrasto.vb[2]); aplica();
  });
  const solta = () => { arrasto = null; svg.classList.remove('arrastando'); };
  svg.addEventListener('pointerup', solta); svg.addEventListener('pointercancel', solta);

  // ---------- controles, filtros, abas e busca ----------
  $$('.rhm-ctl [data-z]').forEach(b => b.addEventListener('click', () => {
    const z = b.dataset.z;
    if (z === 'in') zoomEm(0.6); else if (z === 'out') zoomEm(1 / 0.6); else if (z === 'brasil') { S.sel = null; pintar(); lista(); vaiPara([FX, FY, FW]); } else if (z === 'equipe') vaiPara(naEquipe());
  }));
  $$('.rhm-chips').forEach(box => box.addEventListener('click', ev => {
    const bt = ev.target.closest('.rhm-chip'); if (!bt) return;
    box.querySelectorAll('.rhm-chip').forEach(c => c.classList.toggle('on', c === bt));
    S[box.dataset.f] = bt.dataset.v || null; S.sel = null; atualiza();
  }));
  $$('.rhm-abas [role=tab]').forEach(t => t.addEventListener('click', () => { S.aba = t.dataset.aba; lista(); }));
  const busca = $('#rhm-busca');
  busca.addEventListener('input', () => { S.busca = busca.value; if (S.busca && S.aba !== 'pessoas') S.aba = 'pessoas'; lista(); });
  busca.addEventListener('keydown', ev => { if (ev.key === 'Enter') { const li = $('.rhm-pessoa'); if (li) li.click(); } });
  if (window.ResizeObserver) new ResizeObserver(() => desenha()).observe(svg);
  atualiza();
}
