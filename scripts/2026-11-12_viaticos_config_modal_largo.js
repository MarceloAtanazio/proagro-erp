// Propósito: a janela "Configurações de Viáticos (TUD e Colaboradores)" fica bem mais larga (até 1560px / 96% da tela) para a tabela de colaboradores caber inteira
//   (Documentação, "Dispensar CNH, CRLV e seguro" e os três botões de Ações — Editar / Inativar / Excluir — sem cortar nem quebrar linha). Vale para o Clássico e o Novo.
//   public/app.js: marca o modal com a classe modal-cfg ao abrir; public/styles.css: define a largura e impede quebra de linha na tabela de colaboradores.
// Entrada: public/app.js e public/styles.css (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-12_viaticos_config_modal_largo.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
const edita = (rel, fn) => {
  const arq = path.join(raiz, rel); let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { const i = s.indexOf(de); if (i < 0) throw new Error(rel + ': trecho não achado: ' + de.slice(0, 80)); if (s.indexOf(de, i + 1) >= 0) throw new Error(rel + ': trecho repetido: ' + de.slice(0, 80)); s = s.replace(de, () => para); };
  fn(troca, () => s, v => { s = v; }); fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
};
edita('public/app.js', troca => {
  troca("  openModal('Configurações de Viáticos (TUD e Colaboradores)', body, [{ label: 'Fechar', cls: 'primary', onClick: closeModal }], { xwide: true });",
    "  openModal('Configurações de Viáticos (TUD e Colaboradores)', body, [{ label: 'Fechar', cls: 'primary', onClick: closeModal }], { xwide: true });\n  document.querySelector('.modal').classList.add('modal-cfg');   // bem mais larga: a tabela de colaboradores cabe inteira");
});
edita('public/styles.css', (troca, ler, grava) => {
  if (ler().includes('.modal.modal-cfg')) throw new Error('já aplicado');
  grava(ler().replace(/\s+$/, '\n') + '\n/* Configurações de Viáticos: janela larga, tabela de colaboradores sem quebra de linha */\n.modal.modal-cfg { width: min(1560px, 96vw); max-width: min(1560px, 96vw); }\n.modal.modal-cfg .tbl-colaboradores th, .modal.modal-cfg .tbl-colaboradores td { white-space: nowrap; }\n.modal.modal-cfg .tbl-colaboradores .btn-group { flex-wrap: nowrap; }\n.modal.modal-cfg .body { overflow-x: auto; }\n.modal.modal-cfg .table-wrap:not(:has(.tbl-colaboradores)) { max-width: 860px; }\n');
});
console.log('ok');
