/* ============================================================
   MAPA DO BRASIL — Recursos Humanos > Painel > "Onde estamos".
   Mostra onde cada colaborador ativo está alocado: estados coloridos pela quantidade de pessoas e bolhas por cidade. O mapa é explorável:
   · zoom (botões +/−, Ctrl + rolagem ou duplo clique), arrastar para mover, "Brasil inteiro" e "Ampliar na equipe"; clicar num estado aproxima dele;
   · cidades próximas se agrupam numa bolha só (com o total de pessoas) e se separam ao aproximar; os nomes das cidades aparecem onde couberem, sem se sobrepor;
   · tamanhos em pixels (bolhas, números e nomes mantêm o tamanho em qualquer zoom); dica com cidades e pessoas ao passar o mouse.
   Ao lado: lista por estado (barra, %, cidades e pessoas). Local = cidade-base do colaborador (a mesma de Viáticos); sem ela, a cidade de residência do cadastro de RH.
   Dados: pessoas = headcount.localizacao de /api/rh/painel. Geometria: BR_MAPA (br-mapa.js, malha do IBGE). Coordenadas: BR_LOCALIDADES.coords. Usa esc() de app.js.
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
  const plural = (n, s, p) => n + ' ' + (n === 1 ? s : p);

  // ---------- dados: por estado e por cidade ----------
  const porUF = {}, semLocal = [], cidades = [];
  (pessoas || []).forEach(p => {
    if (!p.uf || !BR_MAPA.ufs[p.uf]) { semLocal.push(p); return; }
    const u = porUF[p.uf] || (porUF[p.uf] = { uf: p.uf, n: 0, cidades: new Map() });
    u.n++;
    const chave = p.municipio || '— cidade não informada —';
    let c = u.cidades.get(chave);
    if (!c) { const xy = coordsDe(p.uf, p.municipio); c = { uf: p.uf, nome: chave, n: 0, pessoas: [], X: xy ? xy[1] : BR_MAPA.ufs[p.uf].c.lon, Y: -(xy ? xy[0] : BR_MAPA.ufs[p.uf].c.lat), aprox: !xy }; u.cidades.set(chave, c); cidades.push(c); }
    c.n++; c.pessoas.push(p);
  });
  const estados = Object.values(porUF).sort((a, b) => b.n - a.n || a.uf.localeCompare(b.uf));
  const total = (pessoas || []).length, comLocal = total - semLocal.length;
  if (!comLocal) { el.innerHTML = '<p class="rh-nota">Nenhum colaborador ativo tem cidade-base ou cidade de residência preenchida.</p>'; return; }
  const maxN = Math.max(1, ...estados.map(u => u.n)), nivel = n => (n ? Math.min(4, Math.max(1, Math.ceil((4 * n) / maxN))) : 0);
  const nCidades = cidades.length, top = estados[0], deResidencia = (pessoas || []).filter(p => p.origem === 'residencia').length;

  // ---------- HTML ----------
  const paths = Object.entries(BR_MAPA.ufs).map(([uf, g]) => `<path class="uf n${nivel((porUF[uf] || {}).n || 0)}${porUF[uf] ? ' tem' : ''}" data-uf="${uf}" d="${g.d}"></path>`).join('');
  const detalhePessoas = lista => lista.map(p => `<li><b>${E(p.nome)}</b><span>${E([p.departamento, MODELO[p.modelo] || p.modelo].filter(Boolean).join(' · ') || '—')}</span></li>`).join('');
  const linhas = estados.map(u => {
    const cid = [...u.cidades.values()].sort((a, b) => b.n - a.n);
    return `<li class="rh-mapa-uf" data-uf="${u.uf}">
      <button type="button" class="rh-mapa-uf-cab" aria-expanded="false">
        <span class="sg">${u.uf}</span><span class="nm">${E(NOME_UF[u.uf] || u.uf)}</span>
        <span class="bar"><i style="width:${(u.n / maxN * 100).toFixed(1)}%"></i></span><b>${u.n}</b><span class="pc">${Math.round(u.n / comLocal * 100)}%</span><span class="seta" aria-hidden="true">▸</span></button>
      <div class="rh-mapa-uf-det" hidden>${cid.map(c => `<div class="cid"><h6>${E(c.nome)} <em>${plural(c.n, 'pessoa', 'pessoas')}${c.aprox ? ' · posição aproximada' : ''}</em></h6><ul>${detalhePessoas(c.pessoas)}</ul></div>`).join('')}</div></li>`;
  }).join('');
  el.innerHTML = `<div class="rh-mapa">
      <div class="rh-mapa-fig">
        <svg class="rh-mapa-svg" viewBox="${BR_MAPA.viewBox}" role="img" aria-label="Mapa do Brasil com a distribuição dos colaboradores por estado e cidade"><g transform="scale(0.0001,-0.0001)">${paths}</g><g class="rots"></g><g class="pts"></g><g class="lbls"></g></svg>
        <div class="rh-mapa-ctl" role="group" aria-label="Zoom do mapa"><button type="button" data-z="in" aria-label="Aproximar" title="Aproximar">+</button><button type="button" data-z="out" aria-label="Afastar" title="Afastar">−</button></div>
        <div class="rh-mapa-dica" hidden></div>
        <div class="rh-mapa-leg"><span>menos</span><i class="n1"></i><i class="n2"></i><i class="n3"></i><i class="n4"></i><span>mais pessoas</span><span class="b"><i></i> cidade ou grupo de cidades</span>
          <span class="acoes"><button type="button" class="rh-mapa-zoom" data-z="equipe">Ampliar na equipe</button><button type="button" class="rh-mapa-zoom" data-z="brasil">Brasil inteiro</button></span></div>
        <p class="rh-mapa-ajuda">Arraste para mover · Ctrl + rolagem, duplo clique ou +/− para ampliar · clique num estado ou num grupo para aproximar. Os nomes das cidades aparecem à medida que há espaço.</p>
      </div>
      <div class="rh-mapa-lado">
        <div class="rh-mapa-resumo">
          <div><b>${estados.length}</b><span>${estados.length === 1 ? 'estado' : 'estados'} com equipe</span></div>
          <div><b>${nCidades}</b><span>${nCidades === 1 ? 'cidade' : 'cidades'}</span></div>
          <div><b>${top.uf} · ${Math.round(top.n / comLocal * 100)}%</b><span>maior concentração (${plural(top.n, 'pessoa', 'pessoas')})</span></div>
        </div>
        <ul class="rh-mapa-lista">${linhas}</ul>
        ${semLocal.length ? `<p class="rh-mapa-alerta"><b>${plural(semLocal.length, 'colaborador sem localização', 'colaboradores sem localização')}:</b> ${E(semLocal.map(p => p.nome).join(' · '))}. Preencha a cidade-base (Viáticos > Configurações) ou o endereço na ficha.</p>` : ''}
        <p class="rh-nota">Local = cidade-base do colaborador (a mesma de Viáticos)${deResidencia ? `; para ${plural(deResidencia, 'pessoa', 'pessoas')} sem cidade-base, vale a cidade de residência` : ''}. Considera os ${total} colaboradores ativos.</p>
      </div></div>`;

  // ---------- câmera (viewBox) ----------
  const svg = el.querySelector('.rh-mapa-svg'), fig = el.querySelector('.rh-mapa-fig'), dica = el.querySelector('.rh-mapa-dica');
  const gRot = svg.querySelector('.rots'), gPts = svg.querySelector('.pts'), gLbl = svg.querySelector('.lbls');
  const [FX, FY, FW, FH] = BR_MAPA.viewBox.split(' ').map(Number), ASP = FW / FH;
  let vb = [FX, FY, FW, FH], clusters = [], anim = 0, movido = false, arrasto = null;
  const larguraPx = () => Math.max(200, svg.getBoundingClientRect().width || 600);
  const prende = (x, y, w) => { w = Math.min(FW, Math.max(1.0, w)); const hh = w / ASP; return [Math.min(FX + FW - w, Math.max(FX, x)), Math.min(FY + FH - hh, Math.max(FY, y)), w, hh]; };
  const aplica = () => { svg.setAttribute('viewBox', vb.map(v => +v.toFixed(4)).join(' ')); desenha(); };
  const vaiPara = (alvo, imediato) => {
    clearTimeout(anim); alvo = prende(alvo[0], alvo[1], alvo[2]);
    const reduz = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (imediato || reduz) { vb = alvo; aplica(); return; }
    const ini = vb.slice(), t0 = performance.now(), dur = 320, suave = t => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const passo = () => { const t = Math.min(1, (performance.now() - t0) / dur), k = suave(t); vb = ini.map((v, i) => v + (alvo[i] - v) * k); aplica(); if (t < 1) anim = setTimeout(passo, 16); };
    anim = setTimeout(passo, 16);
  };
  const enquadra = (x0, y0, x1, y1, folga) => { const w = Math.max(x1 - x0, (y1 - y0) * ASP) * (1 + (folga == null ? 0.35 : folga)) + 1.2; return [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - w / ASP / 2, w]; };
  const zoomEm = (fator, px, py) => {   // px/py = ponto fixo em unidades do viewBox (padrão: centro)
    const w = Math.min(FW, Math.max(1.0, vb[2] * fator)), cx = px == null ? vb[0] + vb[2] / 2 : px, cy = py == null ? vb[1] + vb[3] / 2 : py;
    const rx = (cx - vb[0]) / vb[2], ry = (cy - vb[1]) / vb[3];
    vaiPara([cx - rx * w, cy - ry * (w / ASP), w], true);
  };
  const noEstado = uf => { const b = BR_MAPA.ufs[uf].b; return enquadra(b[0], b[1], b[2], b[3], 0.25); };
  const naEquipe = () => { const xs = cidades.map(c => c.X), ys = cidades.map(c => c.Y); return enquadra(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), 0.3); };
  const unidadePorPx = () => vb[2] / larguraPx();

  // ---------- desenho dependente do zoom: grupos de cidades, números e nomes (tudo em pixels) ----------
  const medidor = (() => { const c = document.createElement('canvas').getContext('2d'); c.font = '600 13px "DM Sans", "Segoe UI", sans-serif'; return t => c.measureText(t).width; })();
  const raioPx = n => 7 + 2.8 * Math.sqrt(n);
  function agrupa(pxU) {
    const cs = [];
    [...cidades].sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome)).forEach(c => {
      const alvo = cs.find(g => Math.hypot((g.X - c.X) * pxU, (g.Y - c.Y) * pxU) < 0.72 * (raioPx(g.n) + raioPx(c.n)));
      if (alvo) { alvo.X = (alvo.X * alvo.n + c.X * c.n) / (alvo.n + c.n); alvo.Y = (alvo.Y * alvo.n + c.Y * c.n) / (alvo.n + c.n); alvo.n += c.n; alvo.cidades.push(c); }
      else cs.push({ X: c.X, Y: c.Y, n: c.n, cidades: [c] });
    });
    return cs;
  }
  function desenha() {
    const px = larguraPx(), pxU = px / vb[2], u = 1 / pxU;
    // siglas dos estados (só as dos estados com equipe em negrito)
    gRot.innerHTML = Object.entries(BR_MAPA.ufs).filter(([, g]) => g.c.lon >= vb[0] - 1 && g.c.lon <= vb[0] + vb[2] + 1 && -g.c.lat >= vb[1] - 1 && -g.c.lat <= vb[1] + vb[3] + 1)
      .map(([uf, g]) => `<text class="${porUF[uf] ? 'tem' : ''}" x="${g.c.lon}" y="${-g.c.lat}" style="font-size:${(porUF[uf] ? 12.5 : 11) * u}px;stroke-width:${3 * u}px" text-anchor="middle" dy=".35em">${uf}</text>`).join('');
    clusters = agrupa(pxU);
    const visiveis = clusters.map((g, i) => ({ g, i, x: (g.X - vb[0]) * pxU, y: (g.Y - vb[1]) * pxU, r: raioPx(g.n) })).filter(o => o.x > -30 && o.x < px + 30 && o.y > -30 && o.y < px / ASP + 30);
    gPts.innerHTML = visiveis.map(o => {
      const varias = o.g.cidades.length > 1;
      return `<g class="pt${varias ? ' grupo' : ''}${!varias && o.g.cidades[0].aprox ? ' aprox' : ''}" data-i="${o.i}" tabindex="0"><circle cx="${o.g.X}" cy="${o.g.Y}" r="${o.r * u}"/>${o.g.n > 1 || varias ? `<text x="${o.g.X}" y="${o.g.Y}" dy=".35em" text-anchor="middle" style="font-size:${(o.r >= 12 ? 14 : 12.5) * u}px">${o.g.n}</text>` : ''}</g>`;
    }).join('');
    // nomes das cidades: tenta à direita, à esquerda, acima e abaixo, sem tocar em bolhas nem em outros nomes
    const ocupados = visiveis.map(o => [o.x - o.r - 2, o.y - o.r - 2, o.x + o.r + 2, o.y + o.r + 2]), colide = (a, b) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
    const lbls = [];
    visiveis.filter(o => o.g.cidades.length === 1).sort((a, b) => b.g.n - a.g.n).forEach(o => {
      const nome = o.g.cidades[0].nome, w = medidor(nome) + 6, h = 17, r = o.r + 4;
      const tent = [['start', o.x + r, o.y, [o.x + r, o.y - h / 2, o.x + r + w, o.y + h / 2]], ['end', o.x - r, o.y, [o.x - r - w, o.y - h / 2, o.x - r, o.y + h / 2]],
        ['middle', o.x, o.y - o.r - 8, [o.x - w / 2, o.y - o.r - 15, o.x + w / 2, o.y - o.r - 1]], ['middle', o.x, o.y + o.r + 9, [o.x - w / 2, o.y + o.r + 1, o.x + w / 2, o.y + o.r + 15]]];
      const ok = tent.find(t => t[3][0] > 0 && t[3][2] < px && t[3][1] > 0 && !ocupados.some(b => colide(t[3], b)));
      if (!ok) return;
      ocupados.push(ok[3]);
      lbls.push(`<text class="nome" x="${vb[0] + ok[1] * u}" y="${vb[1] + ok[2] * u}" dy=".35em" text-anchor="${ok[0]}" style="font-size:${13 * u}px;stroke-width:${3.4 * u}px">${E(nome)}</text>`);
    });
    gLbl.innerHTML = lbls.join('');
    const zoomado = vb[2] < FW * 0.98;
    el.querySelector('.rh-mapa-ctl [data-z="out"]').disabled = !zoomado; el.querySelector('.rh-mapa-ctl [data-z="in"]').disabled = vb[2] <= 1.05;
    svg.classList.toggle('zoomado', zoomado);
  }

  // ---------- dicas ----------
  const marca = (uf, on) => { const p = el.querySelector(`.uf[data-uf="${uf}"]`); if (p) p.classList.toggle('hl', on); const li = el.querySelector(`.rh-mapa-uf[data-uf="${uf}"]`); if (li) li.classList.toggle('hl', on); };
  const textoUF = uf => {
    const u = porUF[uf]; if (!u) return `<b>${E(NOME_UF[uf] || uf)}</b><span>nenhum colaborador</span>`;
    return `<b>${E(NOME_UF[uf] || uf)}</b><span>${plural(u.n, 'colaborador', 'colaboradores')} · ${plural(u.cidades.size, 'cidade', 'cidades')}</span><ul>${[...u.cidades.values()].sort((a, b) => b.n - a.n).map(c => `<li>${E(c.nome)} <em>${c.n}</em></li>`).join('')}</ul>`;
  };
  const textoGrupo = g => {
    if (g.cidades.length === 1) { const c = g.cidades[0]; return `<b>${E(c.nome)}/${c.uf}</b><span>${plural(c.n, 'colaborador', 'colaboradores')}${c.aprox ? ' · posição aproximada' : ''}</span><ul>${c.pessoas.map(p => `<li>${E(p.nome)}</li>`).join('')}</ul>`; }
    const ord = [...g.cidades].sort((a, b) => b.n - a.n);
    return `<b>${plural(g.n, 'colaborador', 'colaboradores')} em ${plural(g.cidades.length, 'cidade', 'cidades')}</b><span>clique para aproximar</span><ul>${ord.slice(0, 12).map(c => `<li>${E(c.nome)}/${c.uf} <em>${c.n}</em></li>`).join('')}${ord.length > 12 ? `<li>… e mais ${ord.length - 12}</li>` : ''}</ul>`;
  };
  const mostra = (ev, html) => {
    dica.innerHTML = html; dica.hidden = false;
    const r = fig.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    dica.style.left = Math.min(Math.max(8, x + 14), Math.max(8, r.width - dica.offsetWidth - 8)) + 'px';
    dica.style.top = Math.min(Math.max(8, y + 14), Math.max(8, r.height - dica.offsetHeight - 8)) + 'px';
  };
  const esconde = () => { dica.hidden = true; el.querySelectorAll('.uf.hl, .rh-mapa-uf.hl').forEach(n => n.classList.remove('hl')); };
  const abre = (uf, aberto) => {
    const li = el.querySelector(`.rh-mapa-uf[data-uf="${uf}"]`); if (!li) return;
    const cab = li.querySelector('.rh-mapa-uf-cab'), det = li.querySelector('.rh-mapa-uf-det'), abrir = aberto == null ? det.hidden : aberto;
    det.hidden = !abrir; cab.setAttribute('aria-expanded', String(abrir)); li.classList.toggle('aberto', abrir);
  };
  const grupoDe = alvo => { const n = alvo.closest && alvo.closest('.pt'); return n ? clusters[Number(n.dataset.i)] : null; };
  const unidadeDoPonto = ev => { const r = svg.getBoundingClientRect(), u = unidadePorPx(); return [vb[0] + (ev.clientX - r.left) * u, vb[1] + (ev.clientY - r.top) * u]; };

  svg.addEventListener('mousemove', ev => {
    if (arrasto && movido) return;
    const g = grupoDe(ev.target);
    el.querySelectorAll('.uf.hl, .rh-mapa-uf.hl').forEach(n => n.classList.remove('hl'));
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
      else { const w = Math.min(vb[2], 4); vaiPara([g.X - w / 2, g.Y - w / ASP / 2, w]); }
      return;
    }
    const p = ev.target.closest && ev.target.closest('.uf');
    if (p && porUF[p.dataset.uf]) { const uf = p.dataset.uf; abre(uf, true); dica.hidden = true; vaiPara(noEstado(uf)); const li = el.querySelector(`.rh-mapa-uf[data-uf="${uf}"]`); if (li) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  });
  svg.addEventListener('dblclick', ev => { ev.preventDefault(); const [x, y] = unidadeDoPonto(ev), w = Math.max(1.0, vb[2] / 2); vaiPara([x - (x - vb[0]) / vb[2] * w, y - (y - vb[1]) / vb[3] * (w / ASP), w]); });
  svg.addEventListener('wheel', ev => { if (!(ev.ctrlKey || ev.metaKey)) return; ev.preventDefault(); const [x, y] = unidadeDoPonto(ev); zoomEm(Math.exp(ev.deltaY * 0.0022), x, y); }, { passive: false });

  // arrastar para mover (só com zoom)
  svg.addEventListener('pointerdown', ev => { if (ev.button !== 0 || vb[2] >= FW * 0.98) return; arrasto = { x: ev.clientX, y: ev.clientY, vb: vb.slice(), id: ev.pointerId }; movido = false; });
  svg.addEventListener('pointermove', ev => {
    if (!arrasto) return; const dx = ev.clientX - arrasto.x, dy = ev.clientY - arrasto.y;
    if (!movido && Math.hypot(dx, dy) < 5) return;
    if (!movido) { movido = true; dica.hidden = true; try { svg.setPointerCapture(arrasto.id); } catch (e) { /* sem captura */ } svg.classList.add('arrastando'); }
    const u = unidadePorPx(); vb = prende(arrasto.vb[0] - dx * u, arrasto.vb[1] - dy * u, arrasto.vb[2]); aplica();
  });
  const solta = () => { arrasto = null; svg.classList.remove('arrastando'); };
  svg.addEventListener('pointerup', solta); svg.addEventListener('pointercancel', solta);

  // botões e lista
  el.querySelectorAll('[data-z]').forEach(b => b.addEventListener('click', () => {
    const z = b.dataset.z;
    if (z === 'in') zoomEm(0.6); else if (z === 'out') zoomEm(1 / 0.6); else if (z === 'brasil') vaiPara([FX, FY, FW]); else if (z === 'equipe') vaiPara(naEquipe());
  }));
  el.querySelectorAll('.rh-mapa-uf').forEach(li => {
    const uf = li.dataset.uf;
    li.querySelector('.rh-mapa-uf-cab').addEventListener('click', () => { abre(uf); if (li.classList.contains('aberto')) vaiPara(noEstado(uf)); });
    li.addEventListener('mouseenter', () => marca(uf, true)); li.addEventListener('mouseleave', () => marca(uf, false));
  });
  if (window.ResizeObserver) new ResizeObserver(() => desenha()).observe(svg);
  desenha();
}
