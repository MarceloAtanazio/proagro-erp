// Propósito: ao sair de "Contrato" o candidato nunca virava colaborador — o INSERT do vínculo usava $1 como
//   integer (colaborador_id) e como text ($1::text, matrícula), e o Postgres recusa ("inconsistent types deduced for
//   parameter $1"). Além disso a etapa era gravada ANTES do vínculo, então o erro deixava o processo meio andado.
//   Correção: matrícula vira o parâmetro $17 e a mudança de etapa passa a ser gravada depois do vínculo.
// Entrada: api/index.js. Saída: api/index.js editado. Uso: node scripts/2026-10-23_admissao_vinculo_matricula_param.js
const fs = require('fs'), path = require('path');
const arq = path.join(__dirname, '..', 'api/index.js');
let s = fs.readFileSync(arq, 'utf8'); const crlf = s.includes('\r\n'); if (crlf) s = s.replace(/\r\n/g, '\n');
const troca = (de, para) => { if (!s.includes(de)) throw new Error('trecho não achado: ' + de.slice(0, 50)); s = s.replace(de, () => para); };

const bloco = `  await query('UPDATE erp_rh_admissoes SET etapa=$1, updated_at=now() WHERE id=$2', [destino, adm.id]);
  const nota = (iDestino > iAtual && req.body.forcar ? '[avançou com pendência] ' : '') + (sanitize(req.body.observacao) || '');
  await query(
    'INSERT INTO erp_rh_admissao_hist (admissao_id, de_etapa, para_etapa, observacao, movido_por) VALUES ($1,$2,$3,$4,$5)',
    [adm.id, adm.etapa, destino, nota || null, req.user.id]);

`;
troca(bloco, '');
troca("  res.json({ ok: true, etapa: destino, vinculo_id: vinculoId });",
`  // A etapa só muda depois do vínculo: se ele falhar, o processo continua em "Contrato" e dá para repetir.
` + bloco.replace(/\n$/, '') + `
  res.json({ ok: true, etapa: destino, vinculo_id: vinculoId });`);
troca("VALUES ($1,$1::text,'clt',", "VALUES ($1,$17,'clt',");
troca("adm.vr_dia, adm.home_office_dia, req.user.id]);", "adm.vr_dia, adm.home_office_dia, req.user.id, String(adm.colaborador_id)]);");
fs.writeFileSync(arq, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
