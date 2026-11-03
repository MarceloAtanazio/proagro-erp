// Propósito: ações da lista de Viáticos em ícones (economiza espaço), no padrão .btn-ic que o Contas a Pagar já usa. Comprovar/Ver em verde cheio,
//   Excluir em vermelho; Transferência, Editar, Complementar e Cancelar em contorno neutro (Cancelar fica vermelho ao passar o mouse). Cada ícone tem
//   dica (title) e rótulo para leitor de tela. Excluir passa a ter DUAS perguntas (a segunda lembra que é permanente e sugere Cancelar).
// Entrada: public/app.js e public/styles.css (ou a pasta indicada em argv[2]) e o bloco scripts/2026-11-05_viaticos_acoes_icones_bloco.txt.
// Saída: os dois arquivos editados. Uso: node scripts/2026-11-05_viaticos_acoes_icones.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const bloco = fs.readFileSync(path.join(__dirname, '2026-11-05_viaticos_acoes_icones_bloco.txt'), 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel);
  let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const unico = m => { const i = s.indexOf(m); if (i < 0) throw new Error(rel + ': trecho não achado: ' + m.slice(0, 80)); if (s.indexOf(m, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + m.slice(0, 80)); return i; };
  fn({
    troca: (de, para) => { unico(de); s = s.replace(de, () => para); },
    regiao: (ini, fim, para) => { const i = unico(ini); const j = s.indexOf(fim, i); if (j < 0) throw new Error(rel + ': fim da região não achado'); s = s.slice(0, i) + para + s.slice(j + fim.length); },
    fim: t => { s += t; }
  });
  fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};

edita('public/app.js', ({ troca, regiao }) => {
  regiao('<td class="actions">${READONLY\n            ? `<button class="btn sm primary" data-view="${s.id}">Ver detalhes</button>`',
         "Complementar</button>` : ''}\n          </td>", bloco);
  troca('function viaPodeCancelar(s) {',
`function viaSolFechada(s) { return ['comprovado', 'devolvido', 'divergente', 'arquivado', 'cancelada'].includes(s.status); }
// Excluir pede confirmação DUAS vezes: é permanente (leva junto as despesas lançadas) e fica ao lado de botões de uso diário.
function viaConfirmarExclusao(s) {
  const nome = \`\${esc(s.colaborador_name)} · OT \${esc(s.ordem_trabalho || s.id)}\`;
  openModal('Confirmar exclusão', \`<p>Deseja realmente excluir a solicitação <strong>\${nome}</strong>?</p>\`,
    [{ label: 'Cancelar', onClick: closeModal },
     { label: 'Excluir', cls: 'danger-ghost', onClick: () => {
        closeModal();
        openModal('⚠️ Tem certeza absoluta?', \`<p style="font-size:13.5px; color:var(--ink-2)">Excluir <strong>apaga a solicitação e as despesas lançadas nela, de forma permanente</strong> — não dá para desfazer.</p>
          <p style="font-size:13.5px; color:var(--ink-2)">Se a viagem só não vai mais acontecer, use <strong>Cancelar</strong> (⊘): a OT fica no histórico.</p>\`,
          [{ label: 'Não, manter', onClick: closeModal },
           { label: 'Sim, excluir definitivamente', cls: 'danger-ghost', onClick: async () => {
              try { await api(\`/api/viaticos/solicitacoes/\${s.id}\`, { method: 'DELETE' }); closeModal(); toast('Excluído com sucesso.'); renderViaticos(); }
              catch (e) { modalError(e.message); }
           } }]);
     } }]);
}
function viaPodeCancelar(s) {`);
  troca("{ closeModal(); confirmDelete('a solicitação', `/api/viaticos/solicitacoes/${s.id}`, renderViaticos); }", '{ closeModal(); viaConfirmarExclusao(s); }');
  troca("      confirmDelete('a solicitação', `/api/viaticos/solicitacoes/${b.dataset.del}`, renderViaticos);",
        "      viaConfirmarExclusao(s || filtered.find(x => x.id == b.dataset.del) || { id: b.dataset.del });");
});

edita('public/styles.css', ({ fim }) => {
  fim(`
/* Viáticos: ações da lista em ícones (padrão .btn-ic). Comprovar/Ver em verde cheio; Excluir em vermelho, afastado dos demais para não ser clicado
   sem querer; Cancelar fica neutro e só avermelha ao passar o mouse (.perigo). */
td.via-acoes { white-space: nowrap; }
td.via-acoes .btn-ic { margin: 0 0 0 3px; }
td.via-acoes .btn-ic.ok { background: var(--verde-700); border-color: var(--verde-700); color: #fff; }
td.via-acoes .btn-ic.ok:hover { background: var(--verde-500); border-color: var(--verde-500); }
td.via-acoes .btn-ic.exc { margin-left: 12px; color: var(--danger); border-color: var(--danger); }
td.via-acoes .btn-ic.exc:hover { background: var(--danger-050); }
`);
});
console.log('ok');
