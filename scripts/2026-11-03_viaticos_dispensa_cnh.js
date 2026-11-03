// Propósito: Viáticos → Configurações → Colaboradores ganha a opção de DISPENSAR o cadastro de CNH, CRLV e seguro do carro (um tique por
//   colaborador, na tabela e na ficha). Quem não dirige a serviço deixa de constar como pendente ("não habilitado", "só aluguel",
//   "vencendo") e fica com o selo "Dispensado"; carro (próprio e alugado) fica indisponível nas solicitações dessa pessoa, mas ela
//   segue viajando de avião, ônibus e táxi/Uber. Os dados já informados ficam guardados; desmarcar reativa a cobrança.
//   Backend: coluna erp_colaboradores.dispensa_cnh_veiculo (migração 2026-11-03-viaticos-dispensa-cnh-veiculo.sql), rota
//   PUT /api/colaboradores/:id/dispensa-cnh-veiculo e a regra viaBloqueiosDirecao (a que de fato barra o envio no servidor).
// Entrada: api/index.js e public/app.js (ou a pasta indicada em argv[2]) e os blocos scripts/2026-11-03_viaticos_dispensa_cnh_*_bloco.txt.
// Saída: os dois arquivos editados. Uso: node scripts/2026-11-03_viaticos_dispensa_cnh.js [raiz]   (a migração vem antes)
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const bloco = n => fs.readFileSync(path.join(__dirname, n), 'utf8').replace(/\r\n/g, '\n');
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel);
  let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const unico = m => {
    const i = s.indexOf(m);
    if (i < 0) throw new Error(rel + ': trecho não achado: ' + m.slice(0, 80));
    if (s.indexOf(m, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + m.slice(0, 80));
  };
  fn({ troca: (de, para) => { unico(de); s = s.replace(de, () => para); }, antes: (m, t) => { unico(m); const i = s.indexOf(m); s = s.slice(0, i) + t + s.slice(i); } });
  fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};

// ---------------- backend ----------------
edita('api/index.js', ({ troca, antes }) => {
  antes("  'PUT /api/colaboradores/:id': req =>", bloco('2026-11-03_viaticos_dispensa_cnh_audit_bloco.txt'));
  antes("app.delete('/api/colaboradores/:id', requireAuth, requireEdit('viaticos'),", bloco('2026-11-03_viaticos_dispensa_cnh_api_bloco.txt'));
  troca("function viaBloqueiosDirecao(colab) {\n  const hoje = hojeISO();",
    "function viaBloqueiosDirecao(colab) {\n" +
    "  // Cadastro de CNH, CRLV e seguro DISPENSADO pelo administrador (a pessoa não usa carro a serviço): não há o que cobrar, e o carro\n" +
    "  // (próprio e alugado) fica indisponível até o cadastro ser reativado. Avião, ônibus e táxi/Uber não passam por esta regra.\n" +
    "  if (colab && colab.dispensa_cnh_veiculo === true) {\n" +
    "    const m = 'cadastro de CNH, CRLV e seguro desativado — a pessoa não usa carro a serviço';\n" +
    "    return { cnh: [m], proprio: [m], podeAlugar: false, podeCarroProprio: false };\n" +
    "  }\n" +
    "  const hoje = hojeISO();");
});

// ---------------- front ----------------
edita('public/app.js', ({ troca }) => {
  // Fonte única da habilitação: dispensado = sem pendência e sem carro.
  troca("function viaAvaliarDocumentacao(c) {\n  c = c || {};\n",
    "function viaAvaliarDocumentacao(c) {\n  c = c || {};\n" +
    "  // Cadastro de CNH, CRLV e seguro DISPENSADO pelo administrador: a pessoa não usa carro a serviço, então não há pendência a cobrar nem\n" +
    "  // vencimento a avisar. Carro (próprio e alugado) fica indisponível até o cadastro ser reativado; os outros meios seguem livres.\n" +
    "  // Espelha viaBloqueiosDirecao em api/index.js.\n" +
    "  if (c.dispensa_cnh_veiculo === true) {\n" +
    "    const m = 'cadastro de CNH, CRLV e seguro desativado — peça ao administrador para ativar se for viajar de carro';\n" +
    "    const vazio = { data: null, dias: null, vencido: false, vencendo: false };\n" +
    "    return { inativo: true, cnh: vazio, crlv: vazio, seguro: vazio, temSeguro: false, bloqueiosCNH: [m], bloqueiosProprio: [m],\n" +
    "      avisos: [], vencendo: [], podeAlugar: false, podeCarroProprio: false };\n" +
    "  }\n");

  troca("function viaStatusDocumentacaoColaborador(c) {\n  const av = viaAvaliarDocumentacao(c);\n",
    "function viaStatusDocumentacaoColaborador(c) {\n  const av = viaAvaliarDocumentacao(c);\n" +
    "  if (av.inativo) {\n" +
    "    return { label: 'Dispensado', cls: 'off', vence: null,\n" +
    "      title: 'Cadastro de CNH, CRLV e seguro dispensado: esta pessoa não usa carro a serviço (não é pendência). Viaja de avião, ônibus ou táxi/Uber. Desmarque a dispensa para voltar a cobrar o cadastro.' };\n" +
    "  }\n");

  troca("  const noWizard = opts.contexto === 'wizard';\n  const blocos = [];\n\n  if (!av.podeAlugar) {",
    "  const noWizard = opts.contexto === 'wizard';\n  const blocos = [];\n\n" +
    "  if (av.inativo) {\n" +
    "    return noWizard ? `<div class=\"alert-item\" style=\"margin-bottom:14px\">ℹ️ Seu cadastro de CNH, CRLV e seguro está <strong>desativado</strong>: nesta solicitação use avião, ônibus ou táxi/Uber. Para viajar de carro, peça ao administrador para ativar o cadastro e informar a CNH, o CRLV e o seguro.</div>` : '';\n" +
    "  }\n\n  if (!av.podeAlugar) {");

  troca("    const av = viaAvaliarDocumentacao(c);\n    if (!av.podeAlugar) semDirigir.push({ c, motivos: av.bloqueiosCNH });",
    "    const av = viaAvaliarDocumentacao(c);\n    if (av.inativo) return;   // dispensado: não é pendência\n    if (!av.podeAlugar) semDirigir.push({ c, motivos: av.bloqueiosCNH });");

  troca("  if (avProprio && !avProprio.podeAlugar) chips.push(", "  if (avProprio && !avProprio.inativo && !avProprio.podeAlugar) chips.push(");
  troca("  else if (avProprio && !avProprio.podeCarroProprio) chips.push(", "  else if (avProprio && !avProprio.inativo && !avProprio.podeCarroProprio) chips.push(");

  // Tabela de colaboradores da configuração: o tique de dispensa.
  troca("      <thead><tr><th>Nome</th><th>Cargo</th><th>Tier</th><th>Ativo</th><th>Documentação</th><th class=\"actions\">Ações</th></tr></thead>",
    "      <thead><tr><th>Nome</th><th>Cargo</th><th>Tier</th><th>Ativo</th><th>Documentação</th>\n" +
    "        <th class=\"c-inc\" title=\"Para quem não usa carro a serviço: não cobra CNH, CRLV nem seguro\">Dispensar CNH, CRLV e seguro</th><th class=\"actions\">Ações</th></tr></thead>");
  troca("    <div class=\"table-wrap\" style=\"margin-top:10px\"><table class=\"tbl-colaboradores\">",
    "    <p class=\"hint\" style=\"margin:10px 0 0\"><strong>Dispensar CNH, CRLV e seguro:</strong> para quem não usa carro a serviço. A pessoa deixa de constar como pendente e continua podendo\n" +
    "      viajar de avião, ônibus ou táxi/Uber; só o carro (próprio e alugado) fica indisponível até o cadastro ser ativado. Os dados já informados ficam guardados.</p>\n" +
    "    <div class=\"table-wrap\" style=\"margin-top:10px\"><table class=\"tbl-colaboradores\">");
  troca("        <td class=\"nowrap\">${viaCelulaDocumentacao(c)}</td>\n",
    "        <td class=\"nowrap\">${viaCelulaDocumentacao(c)}</td>\n" +
    "        <td class=\"c-inc\"><input type=\"checkbox\" data-dispensa-colab=\"${c.id}\" ${c.dispensa_cnh_veiculo ? 'checked' : ''} aria-label=\"Dispensar CNH, CRLV e seguro de ${esc(c.name)}\"></td>\n");
  troca("    }).join('') || `<tr><td colspan=\"6\"><div class=\"empty\">${", "    }).join('') || `<tr><td colspan=\"7\"><div class=\"empty\">${");
  troca("  document.querySelectorAll('[data-del-colab]').forEach(b => b.onclick = () => confirmDelete('este colaborador', `/api/colaboradores/${b.dataset.delColab}`, renderViaticosConfig));\n  }",
    "  document.querySelectorAll('[data-del-colab]').forEach(b => b.onclick = () => confirmDelete('este colaborador', `/api/colaboradores/${b.dataset.delColab}`, renderViaticosConfig));\n" +
    "  document.querySelectorAll('[data-dispensa-colab]').forEach(chk => chk.onchange = async () => {\n" +
    "    const c = colaboradores.find(x => x.id == chk.dataset.dispensaColab);\n" +
    "    try {\n" +
    "      await api(`/api/colaboradores/${c.id}/dispensa-cnh-veiculo`, { method: 'PUT', body: { dispensa: chk.checked } });\n" +
    "      toast(chk.checked ? `Cadastro de CNH, CRLV e seguro de ${c.name} dispensado.` : `Cadastro de CNH, CRLV e seguro de ${c.name} reativado.`);\n" +
    "      renderViaticosConfig();\n" +
    "    } catch (e) { toast(e.message); chk.checked = !chk.checked; }\n" +
    "  });\n  }");

  // Ficha do colaborador: o mesmo tique, escondendo as três seções enquanto estiver ligado.
  troca("    <div class=\"ec-sec\">\n      <div class=\"ec-sec-head\">\n        <h4>🪪 Habilitação do motorista (CNH)</h4>",
    "    <label class=\"check-chip\" style=\"margin:12px 0 4px\"><input type=\"checkbox\" id=\"ec-dispensa\" ${c.dispensa_cnh_veiculo ? 'checked' : ''}> Dispensar CNH, CRLV e seguro (esta pessoa não usa carro a serviço)</label>\n" +
    "    <p class=\"hint\" id=\"ec-dispensa-nota\" style=\"margin:0 0 10px; ${c.dispensa_cnh_veiculo ? '' : 'display:none'}\">Cadastro dispensado: não vira pendência e a pessoa continua podendo viajar de avião, ônibus ou táxi/Uber. O carro (próprio e alugado) fica indisponível até desmarcar. Os dados já informados ficam guardados.</p>\n" +
    "    <div id=\"ec-docs-carro\" style=\"${c.dispensa_cnh_veiculo ? 'display:none' : ''}\">\n" +
    "    <div class=\"ec-sec\">\n      <div class=\"ec-sec-head\">\n        <h4>🪪 Habilitação do motorista (CNH)</h4>");
  troca("      <div class=\"ec-anexos\" id=\"ec-anexos-seguro\"></div>\n    </div>`;",
    "      <div class=\"ec-anexos\" id=\"ec-anexos-seguro\"></div>\n    </div>\n    </div>`;");
  troca("          closeModal(); toast('Colaborador atualizado.'); renderViaticosConfig();",
    "          // A dispensa tem rota própria (o PUT acima não a carrega): só chama se mudou.\n" +
    "          if (!!c.dispensa_cnh_veiculo !== $('#ec-dispensa').checked) {\n" +
    "            await api(`/api/colaboradores/${c.id}/dispensa-cnh-veiculo`, { method: 'PUT', body: { dispensa: $('#ec-dispensa').checked } });\n" +
    "          }\n" +
    "          closeModal(); toast('Colaborador atualizado.'); renderViaticosConfig();");
  troca("  // ---- Validadores ao vivo: o estado de cada seção aparece no cabeçalho dela,",
    "  $('#ec-dispensa').onchange = () => {\n" +
    "    const d = $('#ec-dispensa').checked;\n" +
    "    $('#ec-docs-carro').style.display = d ? 'none' : '';\n" +
    "    $('#ec-dispensa-nota').style.display = d ? '' : 'none';\n" +
    "  };\n\n" +
    "  // ---- Validadores ao vivo: o estado de cada seção aparece no cabeçalho dela,");
});
console.log('ok');
