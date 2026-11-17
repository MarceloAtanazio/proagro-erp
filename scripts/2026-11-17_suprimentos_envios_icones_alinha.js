// Propósito: alinhar a coluna Ações da aba Envios a funcionários: quando uma linha não tem o botão ✓ (marcar entregue) ou ↺ (registrar devolução), um espaço do mesmo tamanho
//   fica reservado, então 👁 🖨 ✓ ↺ ✎ 🗑 caem na mesma posição em todas as linhas. Só aparência.
// Entrada: public/app.js e public/styles.css (ou a pasta em argv[2]). Saída: arquivos editados. Uso: node scripts/2026-11-17_suprimentos_envios_icones_alinha.js [raiz]
const fs = require('fs'), path = require('path');
const raiz = process.argv[2] || path.join(__dirname, '..');
function edita(arq, fn) {
  const p = path.join(raiz, arq); let s = fs.readFileSync(p, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
  const troca = (de, para) => { if (s.split(de).length !== 2) throw new Error(arq + ': âncora não única/achada: ' + de.slice(0, 90)); s = s.replace(de, () => para); };
  s = fn(troca, () => s); fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
}
edita('public/app.js', (troca, get) => {
  if (get().includes('sup-ic-vazio')) throw new Error('js já aplicado');
  troca("aria-label=\"Marcar entregue\">✓</button>` : ''}", "aria-label=\"Marcar entregue\">✓</button>` : (edit ? '<span class=\"sup-ic-vazio\"></span>' : '')}");
  troca("aria-label=\"Registrar devolução\">↺</button>` : ''}", "aria-label=\"Registrar devolução\">↺</button>` : (edit ? '<span class=\"sup-ic-vazio\"></span>' : '')}");
  return get();
});
edita('public/styles.css', (troca, get) => {
  if (get().includes('.sup-ic-vazio')) throw new Error('css já aplicado');
  return get().replace(/\s+$/, '\n') + "td.sup-acoes .sup-ic-vazio { display: inline-block; width: 30px; height: 26px; margin-left: 3px; vertical-align: middle; }\n";
});
console.log('ok');
