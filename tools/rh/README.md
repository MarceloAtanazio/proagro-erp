# Protótipo do motor de emissão de minutas — RH

Emite um documento a partir de uma minuta `.docx` da ProAgro, preenchendo os
campos marcados com **realce amarelo**. Sem dependências: leitor e escritor de
zip próprios. Desenho completo em [`../../docs/rh-desenho.md`](../../docs/rh-desenho.md).

## Por que o realce, e não `[CAMPO]`

Nas minutas reais dois campos diferentes têm o mesmo texto — os dois
`DD/MM/AAAA` (fim da experiência e da prorrogação) e os dois `XXXXXXXXX`
(número e série da CTPS). Busca por texto não os distingue; a **ordem** dos
trechos realçados, sim. Metade dos campos também não tem colchete algum.

## Uso

Inspecionar uma minuta (lista os slots realçados, na ordem):

```bash
node tools/rh/docx-merge.js "caminho/da/minuta.docx"
```

Ver o texto corrido ou os realces com contexto:

```bash
node tools/rh/inspecionar-minuta.js "caminho/da/minuta.docx" texto
node tools/rh/inspecionar-minuta.js "caminho/da/minuta.docx" realce
```

Emitir (o mapa slot → campo está no topo de `emitir-contrato.js`):

```bash
node tools/rh/emitir-contrato.js "minuta.docx" "saida.docx"
```

Verificar o documento gerado — 28 asserções sobre o arquivo, não sobre o script:

```bash
node tools/rh/verifica-emissao.js "minuta.docx" "saida.docx"
```

## A trava que importa

`emitir-contrato.js` **aborta** se a contagem de realces da minuta não bater com
o tamanho do mapa. Um realce a mais ou a menos desloca todo o mapa posicional e
produziria um contrato silenciosamente errado — por isso é erro, não aviso.

## Estado

Testado na minuta `Contrato de Trabalho - Empregado Regular - Controle de Ponto
- Jornada Presencial.docx` (18 slots). As outras quatro variantes compartilham
17 dos slots; o miolo de cada uma ainda precisa de mapeamento confirmado.
