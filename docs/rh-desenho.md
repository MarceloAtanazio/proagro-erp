# Módulo de Recursos Humanos — desenho

**Estado:** **FASE 1 IMPLEMENTADA E NO AR** (ficha, vínculo, dependentes, dossiê, checklist, permissões).
O **motor de emissão** está prototipado e testado (§5), fora do ERP. Fases 2 e 4 seguem em desenho.
**Protótipo:** `tools/rh/docx-merge.js` — sem dependências, 28 verificações no .docx gerado
**Data:** 2026-09-04 · revisado em 2026-09-08 com as 5 minutas reais
**Versão navegável:** https://claude.ai/code/artifact/eebda877-877c-42cb-82d6-2e08401c0319

Pedido: uma seção "Recursos Humanos" com a ficha histórica e as ocorrências dos funcionários,
emissão de contratos de admissão a partir das minutas já existentes, e o arquivamento de toda a
documentação do colaborador.

---

## 0. O que já existe (levantado, não suposto)

Consultado no Postgres de produção e no acervo do OneDrive em
`Marcelo/Recursos Humanos/CLT/`.

| | |
|---|---|
| `erp_colaboradores` | 11 linhas, 10 ativas, 26 colunas — **todas de Viáticos** (cidade-base, veículo, CNH, seguro). Zero campos de RH. |
| Cargos no cadastro | 5 (CEO, Coordenador Administrativo, Coordenadora de Campo, Gerente Comercial, Técnico de Campo) |
| Vínculo com usuário | 9 dos 11 têm `usuario_id` preenchido |
| `erp_attachments` | genérica (`entity_type` + `entity_id` + `kind` + `bytea`). Já usa `colab_cnh` (7), `colab_veiculo` (8), `colab_seguro` (7) — 8,6 MB |
| Folha | 142 títulos em `erp_payables` com categoria/descrição de folha |
| Acervo no OneDrive | uma pasta por funcionário, com subpastas `Documentos Assinados`, `Documentos do Veículo`; mais `97_Contratos`, `98_ASOS`, `99_Ex-Funcionários` |
| Descrições de cargo | 10 arquivos `.docx` em `CLT/Descrição de Cargos/` |

Documentos por funcionário observados no acervo: ASO, Carta Oferta (`.docx` + assinada em PDF),
Contrato de Trabalho (**Empregado Regular** ou **Empregado de Confiança**), Distrato da PJ anterior,
Termo de Entrega de Equipamento, Aditivo de Contrato, Aviso de Encerramento do Contrato de
Experiência, Banco de Horas Individual, e o kit de declarações (Vale Transporte, Encargos de
Família para IR, Contribuição Sindical, Termo LGPD, Ficha de Registro de Empregado).

---

## 1. A decisão de modelagem: pessoa ≠ vínculo ≠ ocorrência

Duas armadilhas que o acervo real desmente:

1. **Engordar `erp_colaboradores` com 30 colunas de RH não serve.** Todo funcionário tem um
   "Distrato — <razão social> LTDA" na pasta: foram todos PJ antes de virar CLT. Uma pessoa,
   dois vínculos. Vínculo precisa ser tabela própria.
2. **Salário não pode ser coluna sobrescrita.** O reajuste apagaria o valor anterior, e aí não
   existe "ficha histórico", existe ficha atual. O histórico é o produto pedido.

```
erp_colaboradores  ──1:N──▶  erp_rh_vinculos  ──1:N──▶  erp_rh_eventos
  (a pessoa)                  (o contrato)                (o histórico)
                                    ▲                           │
                                    └───── atualiza ────────────┘
                                      salario_atual, cargo_atual
                                      (cache p/ listagem, NÃO fonte)
```

O evento é a verdade; a coluna no vínculo é o valor corrente, escrito pelo evento. Apagar um
evento recalcula o cache. Editar o cache à mão, nunca.

**Não criar `erp_funcionarios`.** `erp_colaboradores` já é referenciada por Viáticos, pelos anexos
de CNH/veículo/seguro e por 9 usuários. Dois cadastros da mesma pessoa divergem, e no dia em que
divergirem ninguém sabe qual está certo.

### Tabelas

| Tabela | Papel |
|---|---|
| `erp_colaboradores` *(existente)* | a pessoa. Ganha ~35 colunas de RH |
| `erp_rh_vinculos` | admissão → desligamento. 1 pessoa : N vínculos |
| `erp_rh_eventos` | a linha do tempo. `data, tipo, descricao, valor_de, valor_para, autor` |
| `erp_rh_dependentes` | dependentes, com marcação de IRRF e salário-família |
| `erp_rh_cargos` | catálogo: faixa salarial, regime padrão, minuta padrão, descrição anexada |
| `erp_rh_modelos` | biblioteca de minutas `.docx` com os campos detectados |
| `erp_rh_documentos_emitidos` | o que foi gerado, de qual modelo, com quais valores, estado de assinatura |
| `erp_attachments` *(existente)* | os arquivos. Novos `entity_type` por categoria de dossiê |

---

## 2. As telas

Seção nova no menu lateral, entre **Operações** e **Administração**. Viáticos não perde nada: o
cadastro de colaborador de lá passa a ser uma aba dentro da ficha.

| Tela | O que faz |
|---|---|
| **Painel de RH** | headcount por área e tier, admissões/desligamentos do mês, folha do mês, e as três filas de ação: experiências vencendo, ASO vencendo, documentação pendente |
| **Colaboradores** | a lista, na grade `.tbl-fin` já padronizada em Contas a Pagar/Receber. Filtros: status, departamento, cargo, tier, regime |
| **Ficha do colaborador** | 7 abas: Identificação · Documentos · Contato · Vínculo · Histórico · Dossiê · Veículo & CNH |
| **Emissão de documentos** | colaborador + modelo → mostra o que preenche e o que falta → gera → arquiva |
| **Cargos e minutas** | catálogo de cargos e biblioteca de modelos. Acesso restrito |

---

## 3. A ficha — campos

Transcritos da `Ficha de Cadastro de Funcionários.xlsx` que a empresa já usa, mais o que a
qualificação das partes nos contratos exige. **(S)** = dado sensível na acepção da LGPD.

- **Identificação** — nome completo, nome social, nascimento, sexo, estado civil, nacionalidade,
  naturalidade, UF natal, grau de instrução, raça/cor **(S)**, foto
- **Documentos** — CPF **(S)**, RG **(S)** + órgão/UF/data, CTPS nº + série + UF + data,
  PIS/PASEP, título de eleitor + zona + seção, reservista
- **Contato e endereço** — endereço **(S)**, número, complemento, bairro, município, UF, CEP,
  celular, e-mail pessoal, e-mail corporativo, contato de emergência
- **Bancário** — nº e nome do banco, agência, conta **(S)**, tipo, chave PIX
- **Filiação e dependentes** — nome da mãe **(S)**, do pai **(S)**; por dependente: nome **(S)**,
  CPF **(S)**, parentesco, nascimento, IRRF, salário-família
- **Vínculo** — matrícula, tipo, admissão, cargo, departamento, centro de custo, gestor imediato,
  unidade, tier, regime (regular/confiança), controle de ponto, modelo de trabalho, fim da
  experiência, fim da prorrogação, salário base **(S)**, periculosidade %, salário bruto **(S)**,
  VR/dia, home office/dia, VT, TotalPass, Clube Saúde, seguro de vida, CCT, sindicato
- **Desligamento** *(vem do evento)* — data, motivo, tipo de rescisão, aviso prévio, ASO
  demissional, distrato
- **Veículo e CNH** — já existe, usado por Viáticos

---

## 4. Histórico e ocorrências

Uma tabela, 15+ tipos. Todo evento tem a mesma forma: data, tipo, descrição, valor anterior, valor
novo, anexos, autor, data do registro.

| Grupo | Tipos |
|---|---|
| `contrato` | admissão, prorrogação da experiência, efetivação, aditivo, desligamento |
| `carreira` | promoção, reajuste (de→para), mérito, transferência, mudança de gestor |
| `ausencia` | férias (aquisitivo/gozo/abono), atestado, afastamento INSS, licença maternidade/paternidade, acidente |
| `conduta` | advertência, suspensão, elogio, avaliação de desempenho, treinamento |
| `saude` | ASO admissional/periódico/mudança de função/demissional, PCMSO, PGR |
| `patrimonio` | entrega e devolução de equipamento, termo de responsabilidade, comodato |

**O evento que ninguém pode perder:** a experiência é de 45 dias prorrogáveis por 45. Passar da
data **efetiva o empregado automaticamente** — a decisão de não renovar deixa de existir. Por isso
a fila "experiências vencendo em 15 e 30 dias" fica no painel, e o alerta nasce do vínculo.

---

## 5. Emissão de documentos — **PROTOTIPADO E TESTADO em 2026-09-08**

Deixou de ser desenho. O motor foi construído e emitiu um contrato de verdade a partir da minuta
`Contrato de Trabalho - Empregado Regular - Controle de Ponto - Jornada Presencial.docx`.
Protótipo em `tools/rh/docx-merge.js`; 28 verificações no arquivo gerado, todas passando.

### O marcador é o REALCE, não o texto

Primeira versão do desenho supunha procurar `[CAMPO]`. **Está errado**, e a minuta real mostra por quê:

- Dois campos diferentes têm o **mesmo texto**: os dois `DD/MM/AAAA` (fim da experiência e fim da
  prorrogação) e os dois `XXXXXXXXX` (número e série da CTPS). Busca por texto não os distingue.
- Metade dos campos **não tem colchete nenhum** — `XX.XXX.XXX-X`, `R$ XX.XXX,XX`, `CIDADE`, `Mês`.
- Os colchetes que existem estão **fora** do amarelo, em runs vizinhos.

A ordem dos trechos realçados, essa sim, é estável e única: é a ordem de leitura. Então o mapa de
cada minuta é uma lista posicional `slot → campo da ficha`, guardada em `erp_rh_modelos`.

**Regra de segurança:** se a contagem de realces da minuta mudar, a emissão **aborta**. Um realce
a mais ou a menos desloca todo o mapa e produziria um contrato silenciosamente errado. A tela de
mapeamento mostra o texto atual de cada slot ao lado do campo mapeado, para o desalinhamento ser
visível e corrigível.

### Os 18 slots da minuta enviada, e o que cada um recebe

| # | No modelo | Recebe |
|---|---|---|
| 1 | `NOME DO(A) EMPREGADO(A)` | nome, em maiúsculas |
| 2 | `nacionalidade` | `brasileiro`/`brasileira`, concordado pelo sexo |
| 3 | `estado civil` | concordado pelo sexo |
| 4 | `XX.XXX.XXX-X` | RG |
| 5 | `XXX.XXX.XXX-XX` | CPF |
| 6 | `endereço completo` | endereço + município/UF + CEP, montados |
| 7 | `XXXXXXXXX` | CTPS nº |
| 8 | `XXXXXXXXX` | CTPS série |
| 9 | `NOME DO CARGO` | cargo + nível, em maiúsculas |
| 10 | `DD/MM/AAAA` | admissão **+ 45 dias** |
| 11 | `DD/MM/AAAA` | admissão **+ 90 dias** |
| 12 | `R$ XX.XXX,XX` | salário — **fatiado em 2 runs na minuta**, colapsado pelo motor |
| 13 | `valor por extenso` | salário em texto |
| 14 | `CIDADE` | município da assinatura |
| 15 | `UF, DD` | UF + dia (o realce agrupa os dois) |
| 16 | `Mês` | nome do mês |
| 17 | `202X.` | ano + ponto |
| 18 | `NOME DO(A) EMPREGADO(A)` | nome, na folha de assinaturas |

### Fluxo

```
modelo .docx ──lê os realces──▶ mesclagem ──campo sem fonte──▶ PENDÊNCIAS (bloqueia)
                                    ▲       └──tudo ok───────▶ documento (.docx + PDF) ──▶ dossiê
                              ficha + vínculo                                            (emitido→enviado→assinado)
```

A emissão é **bloqueada**, não "melhor esforço": campo sem fonte vira pendência nomeada em vez de
um `XX.XXX,XX` dentro de um contrato assinado. Mesmo princípio da coluna "Conciliado?".

O motor resolve quatro coisas que o preenchimento manual erra:

- **valor por extenso** — `R$ 8.236,53 (oito mil duzentos e trinta e seis reais e cinquenta e três
  centavos)`. Implementado e testado com 12 casos, incluindo o valor exato de um contrato real,
  `mil`/`um milhão` sem o "um" indevido, e `R$ 0,17 → dezessete centavos` (sem "zero reais").
- **concordância de gênero** — `brasileiro`/`brasileira`, `solteiro`/`solteira`, do campo sexo.
- **datas calculadas** — +45 e +90 dias da admissão.
- **os colchetes** — como estão fora do amarelo, sobrevivem à substituição. Sem tratamento o
  contrato saía `e de outro, [ANA CAROLINA...], [brasileira], [solteira], portador(a) do RG`.
  O motor come o `[` e o `]` dos runs vizinhos, **e só quando encostam num campo preenchido** —
  os parênteses do valor por extenso, que são do texto, ficam. *(Achado pelo teste, não previsto.)*

### Cinco variantes de contrato, não duas

A pasta `Minutas Pro Agro/Minutas Pro Agro/` tem:

| Minuta | Jornada | Ponto | Realces |
|---|---|---|---|
| Empregado Regular — Jornada Presencial | presencial | com | 18 |
| Empregado Regular — Jornada Híbrida | híbrida | com | 21 |
| Empregado Regular — Home Office | remota | com | 21 |
| Empregado Regular — Jornada Externa | externa · art. 62 I | sem | 20 |
| Empregado de Confiança | híbrida · art. 62 II | sem | 20 |

As cinco compartilham **os mesmos 11 primeiros realces e os mesmos 6 últimos**, na mesma ordem.
Só o miolo difere (ajuda de custo por dia, nome do sistema de ponto, nome da política de saúde e
segurança, dias presenciais/remotos). Logo: um mapa por minuta, com a maior parte reaproveitada.

Portanto o vínculo precisa de **dois** campos, não um: `regime` (regular/confiança) e
`modelo_trabalho` (presencial/híbrido/home office/externo). O par seleciona a minuta.

> Nota de mapeamento: na variante de Confiança, o realce nº 12 já vem **preenchido** com
> `"Política de Trabalho Remoto – ProAgro Seguros Brasil"` — é texto fixo destacado para atenção,
> não campo. O mapa precisa marcar slots assim como "não é campo", e é por isso que o mapeamento
> passa por confirmação humana uma vez por minuta.

### Os dois erros: situação em 2026-09-08

Verificado nas cinco minutas novas:

| | `seguro de vista` | gênero fixo no texto |
|---|---|---|
| Regular — Presencial | corrigido | corrigido (virou campo) |
| Regular — Híbrida | corrigido | corrigido |
| Regular — Home Office | corrigido | corrigido |
| Regular — Externa | corrigido | corrigido |
| **Confiança** | **AINDA PRESENTE** | corrigido |

O erro sobreviveu em uma das cinco, no Parágrafo segundo da cláusula da remuneração:
`… transporte, refeição, seguro de vista, assistência médica …`. As outras quatro já dizem
"seguro de vida". A concordância de gênero deixou de ser problema em todas, porque nacionalidade
e estado civil viraram campos realçados.

### O detalhe técnico que parece trivial e não é — confirmado

Preencher um `.docx` mantendo a formatação = editar `word/document.xml` dentro do zip. O Word
quebra texto em *runs*, e na minuta real o slot `R$ XX.XXX,XX` **está partido em 2 runs** — um
`replace` ingênuo não o encontraria. Usar o grupo de runs realçados contíguos como unidade resolve
isso de graça: o grupo é colapsado num run só na hora de escrever.

O protótipo não usa nenhuma dependência: leitor e escritor de zip próprios, com CRC-32. Verificado
que o arquivo gerado preserva as 23 entradas do modelo e que **só** `word/document.xml` muda —
estilos, numeração, tema e fontes saem byte a byte idênticos.

### Uma oferta em aberto

O texto fixo das minutas usa a convenção `(a)`: `EMPREGADO(A)` 45×, `o(a)` 27×, `do(a)` 9×, além
de `portador(a)`, `inscrito(a)`, `subordinado(a)`, `denominado(a)`, `sujeito(a)`, `obrigado(a)`.
Como o sexo está na ficha, o motor pode resolver tudo isso e emitir "a EMPREGADA, portadora,
inscrita, doravante denominada" em vez do andaime. Melhora muito a leitura do contrato, mas altera
texto fixo — **depende de decisão**, não está implementado.

### Modelos a cadastrar

| Modelo | Quando | Campos além da ficha |
|---|---|---|
| Carta Oferta | antes da admissão | gestor, cidade de atuação, prazo de aceite |
| Contrato — Empregado Regular | admissão · art. 62 I | datas de experiência, salário por extenso |
| Contrato — Empregado de Confiança | admissão · art. 62 II | idem + regime híbrido |
| Termo de Entrega de Equipamento | entrega de patrimônio | equipamento, série, vigência |
| Aditivo de Contrato | promoção, reajuste, mudança de regime | cláusula alterada, de→para |
| Aviso de Encerramento da Experiência | antes do fim dos 45/90 dias | data do encerramento |
| Declarações do kit | admissão | VT, encargos de família p/ IR, sindical, LGPD |
| Distrato de PJ | conversão PJ→CLT | razão social e CNPJ da PJ anterior |

---

## 6. Dossiê, checklist e alertas

O dossiê reusa `erp_attachments` com as categorias que as pastas já usam: admissão, contratos e
aditivos, documentos pessoais, saúde ocupacional, declarações e termos, patrimônio, avaliações,
desligamento.

O que muda de patamar é o **checklist**: cada categoria declara os documentos obrigatórios e a
ficha mostra os que faltam. Hoje isso é invisível — comparando três pastas de funcionário, uma tem
as cinco declarações do kit e outra não tem nenhuma visível. Não é possível dizer se faltam ou se
estão em outro lugar, e é esse "não é possível dizer" que o checklist elimina.

### Os documentos obrigatórios (definidos pelo usuário em 2026-09-08)

| # | Documento | Regra |
|---|---|---|
| 1 | RG | sempre |
| 2 | CPF | sempre |
| 3 | Certidão de Nascimento **ou** Casamento | **um dos dois** satisfaz o item |
| 4 | CNH | sempre |
| 5 | Título de Eleitor | sempre |
| 6 | PIS | sempre |
| 7 | CTPS | sempre |
| 8 | Certificado de Reservista | **condicional:** só se `sexo = M` |
| 9 | Comprovante de Endereço Residencial | sempre |
| 10 | Diploma ou certificado de conclusão de curso | sempre |
| 11 | Dados Bancários | sempre |

Três desses não são "anexo e pronto" — têm regra:

- **#3 é alternativa.** O checklist precisa suportar itens do tipo "um dos dois", senão o dossiê
  fica eternamente com uma pendência falsa.
- **#8 é condicional ao sexo.** Cobrar reservista de uma funcionária é ruído; deixar de cobrar de
  um funcionário é falha. A regra vem do campo sexo da ficha.
- **#11 não é documento, é campo.** Dados bancários já ficam na ficha (banco, agência, conta) — o
  checklist deve marcar o item como cumprido quando os **campos** estiverem preenchidos, não
  exigindo um PDF.

**O que o checklist já vai encontrar:** hoje há 11 colaboradores e apenas **7 anexos de CNH** no
sistema. Pelo menos 4 pessoas estão sem o item #4 — e não há nenhuma tela hoje que diga isso.

Vencimentos entram no motor de alertas que já existe para CNH, CRLV e apólice em Viáticos:
ASO periódico, contrato de experiência, CCT, seguro de vida.

---

## 7. Cargos e salários

### O catálogo (definido pelo usuário em 2026-09-08)

14 cargos. **Analistas e Técnico de Campo têm Júnior, Pleno e Sênior** — os demais, não.
Total: 9 + (5 × 3) = **24 posições**.

| Cargo | Níveis | Regime **proposto** | Minuta que seleciona |
|---|---|---|---|
| CEO | — | confiança · art. 62 II | Empregado de Confiança |
| Gerente de Campo | — | confiança | Empregado de Confiança |
| Gerente Administrativo | — | confiança | Empregado de Confiança |
| Gerente de Subscrição | — | confiança | Empregado de Confiança |
| Gerente Comercial | — | confiança | Empregado de Confiança |
| Coordenador de Campo | — | confiança | Empregado de Confiança |
| Coordenador Administrativo | — | confiança | Empregado de Confiança |
| Coordenador de Subscrição | — | confiança | Empregado de Confiança |
| Coordenador Comercial | — | confiança | Empregado de Confiança |
| Analista Administrativo | Jr · Pl · Sr | regular | conforme modelo de trabalho |
| Analista de Subscrição | Jr · Pl · Sr | regular | conforme modelo de trabalho |
| Analista de Riscos | Jr · Pl · Sr | regular | conforme modelo de trabalho |
| Analista de Sinistros | Jr · Pl · Sr | regular | conforme modelo de trabalho |
| Técnico de Campo | Jr · Pl · Sr | regular · **art. 62 I** | Jornada Externa (sem ponto) |

O regime da terceira coluna é **proposta minha, não informação do usuário** — precisa de
confirmação. Critério aplicado: `art. 62, II` para cargos de gestão com poderes distintos (de
Coordenador para cima), `art. 62, I` para o Técnico de Campo por ser jornada externa incompatível
com controle de ponto, e regime regular com ponto para os Analistas.

O regime define só *metade* da escolha: a minuta sai do par **regime × modelo de trabalho**
(presencial, híbrido, home office, externo) — e as cinco minutas cobrem exatamente essas
combinações.

### Duas divergências entre o catálogo e as descrições de cargo

Das 10 descrições em `.docx`, **8 correspondem** a cargos do catálogo. Duas não:

- `Descrição de Cargo - Analista Comercial.docx` — não há "Analista Comercial" no catálogo
- `Descrição de Cargo - Assistente Administrativo.docx` — não há "Assistente Administrativo"

E **6 cargos do catálogo não têm descrição**: CEO, Gerente Administrativo, Gerente de Subscrição,
Coordenador Comercial, Analista Administrativo, Analista de Sinistros.

O catálogo fecha a distância e faz três coisas funcionarem sozinhas:

- define o **regime padrão** → a minuta certa na emissão;
- guarda a **faixa salarial** min/médio/máx → o reajuste avisa quando sai da faixa;
- carrega a **descrição de cargo** anexada, hoje solta numa pasta.

É onde a política de cargos e salários já escrita deixa de ser documento e passa a ser regra que o
sistema conhece.

---

## 8. Permissões e LGPD

Os dados mais sensíveis do ERP. O controle hoje é por página; RH precisa de granularidade dentro
da página, porque um gestor precisa ver a ficha da equipe sem ver salário nem CPF.

| O que se vê | Colaborador (própria) | Gestor | RH | Diretoria |
|---|---|---|---|---|
| Ficha básica (nome, cargo, área, admissão) | ✔ | ✔ | ✔ | ✔ |
| Histórico e ocorrências | ✔ | ✔ | ✔ | ✔ |
| Dados pessoais sensíveis | ✔ | — | ✔ | — |
| Remuneração e benefícios | ✔ | — | ✔ | ✔ |
| Saúde ocupacional (ASO, laudos) | ✔ | — | ✔ | — |
| Emitir documentos | — | — | ✔ | ✔ |
| Registrar desligamento | — | — | ✔ | ✔ |

Novas permissões: `rh.ver`, `rh.sensivel`, `rh.remuneracao`, `rh.editar`, `rh.emitir`, `rh.desligar`.

**Duas coisas vêm de graça:** o autosserviço já existe (`erp_colaboradores.usuario_id` é como
Viáticos mostra "meu cadastro"), e o log de auditoria já registra quem abriu qual ficha e quem
alterou qual salário.

---

## 9. Plano de construção

Ordem por dor, não por técnica.

| Fase | Escopo | Entrega |
|---|---|---|
| **1 — a base** ✅ | campos de RH em `erp_colaboradores`, vínculos, dependentes, dossiê com categorias e checklist, tela de lista e ficha com abas | o acervo passa a viver no ERP, e o checklist mostra o que falta |
| **2 — a memória** | eventos, linha do tempo na ficha, painel com as filas de ação | a ficha vira histórico; nenhuma experiência se efetiva por esquecimento |
| **3 — o motor** | biblioteca de minutas, detecção de campos, mesclagem, saída `.docx`+PDF, arquivamento com estado de assinatura | admissão inteira emitida da ficha |
| **4 — o alcance** | catálogo de cargos, autosserviço, pontes com Contas a Pagar e Usuários | RH deixa de ser ilha |

---

## 10. Pendências — situação em 2026-09-08

| # | Pendência | Situação |
|---|---|---|
| 1 | As minutas em branco | **RESOLVIDA.** Chegaram 5 variantes de contrato + Carta Oferta, Distrato e Banco de Horas, todas com os campos em realce amarelo. Motor testado na variante Presencial. |
| 2 | Os dois erros | **RESPONDIDA.** Ver §5: corrigidos em 4 das 5 minutas; `seguro de vista` **ainda presente** na de Empregado de Confiança. Falta decidir o que fazer com os contratos já assinados. |
| 3 | A regra do checklist | **RESOLVIDA.** 11 documentos definidos, ver §6. Três precisam de regra (alternativa, condicional ao sexo, e um que é campo e não anexo). |
| 4 | O mapa cargo → regime | **PARCIAL.** Os 14 cargos e os níveis chegaram; o regime de cada um é proposta minha em §7 e precisa de confirmação. |
| 5 | `bytea` ou Supabase Storage | **EM ABERTO.** Usuário: "ainda não tenho certeza." Segue em `bytea` por ora — é o que já funciona; a troca é reversível e não bloqueia a fase 1. |

### Novas pendências que este teste criou

6. **Confirmar o regime de cada cargo** (a coluna proposta em §7).
7. **Corrigir `seguro de vista`** na minuta de Empregado de Confiança.
8. **Decidir sobre o `(a)`**: deixar o andaime `EMPREGADO(A)` ou o motor resolver o gênero no texto
   fixo também (ver §5, "Uma oferta em aberto").
9. **Mapear os slots das outras 4 minutas.** A da variante Presencial está mapeada e testada; as
   outras compartilham 17 dos slots, mas o miolo de cada uma precisa de confirmação — em especial
   o slot que na de Confiança **não é campo**, é texto fixo destacado.
10. **Duas descrições de cargo órfãs e seis cargos sem descrição** (ver §7): decidir se "Analista
    Comercial" e "Assistente Administrativo" entram no catálogo ou se as descrições são obsoletas.
