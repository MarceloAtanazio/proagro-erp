# Módulo de Recursos Humanos — desenho

**Estado:** desenho aprovado? **não** · nada implementado
**Data:** 2026-09-04
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

## 5. Emissão de documentos

### As minutas já são um formulário

A `Carta_Oferta_Tecnico_Campo_Proagro.docx` traz os campos variáveis entre colchetes:

```
[DIA]  [MÊS]  [ANO]
[NOME COMPLETO DO(A) CANDIDATO(A)]
[VALOR DA REMUNERAÇÃO MENSAL]
[DATA DE ADMISSÃO PREVISTA]
[CIDADE/REGIÃO DE ATUAÇÃO]
[NOME DO(A) GESTOR(A) IMEDIATO(A)]
[NOME DO(A) REPRESENTANTE]  [CARGO DO(A) REPRESENTANTE]
[DATA DO ACEITE]
```

Esse é o motor: lê o modelo, encontra os colchetes, mapeia cada um para um campo da ficha,
preenche. O modelo continua sendo o `.docx` da empresa, com timbre e folha de assinaturas.

### Fluxo

```
modelo .docx ──detecta [ ]──▶ mesclagem ──campo sem fonte──▶ PENDÊNCIAS (bloqueia)
                                  ▲       └──tudo ok────────▶ documento (.docx + PDF) ──▶ dossiê
                            ficha + vínculo                                              (emitido→enviado→assinado)
```

A emissão é **bloqueada**, não "melhor esforço": campo sem fonte vira pendência nomeada em vez de
um colchete vazio dentro de um contrato assinado. Mesmo princípio da coluna "Conciliado?".

A mesclagem resolve três coisas que o preenchimento manual erra:
- **valor por extenso** — o contrato escreve `R$ 8.236,53 (oito mil duzentos e trinta e seis reais
  e cinquenta e três centavos)`. Precisa de conversão número→texto em português.
- **concordância de gênero** — `brasileiro/brasileira`, `portador/portadora`, resolvidos do campo sexo.
- **datas calculadas** — fim da experiência (admissão + 45) e da prorrogação (+ 45).

### Duas variantes de contrato; o cargo decide qual

Comparando os dois modelos do acervo, não são versões — são regimes jurídicos distintos:

| | Empregado Regular | Empregado de Confiança |
|---|---|---|
| Base legal da jornada | art. 62, **I** da CLT (jornada externa) | art. 62, **II** (cargo de confiança) |
| Home office | eventual, mediante alinhamento | regime **híbrido** obrigatório |
| Cláusulas extras | ajuda de custo do art. 75-D | instrumentos de trabalho, reversibilidade do modelo, exclusividade flexibilizada |

Amarrando o regime ao cargo no catálogo, a minuta certa vem pré-selecionada.

### O argumento mais forte a favor do motor

Lendo as minutas para montar o mapeamento, dois erros de copiar-e-colar apareceram em contratos
**reais e já assinados**:

- `<NOME>, brasileira, solteiro, portador(a) do RG …` — concordância de gênero trocada num
  contrato de empregado homem.
- `… adiantamentos, transporte, refeição, seguro de vista, assistência …` — "seguro de **vista**"
  no lugar de "seguro de vida".

Nenhum invalida o contrato, mas os dois são exatamente o que o preenchimento manual produz e um
motor de mesclagem não produz.

### O detalhe técnico que parece trivial e não é

Preencher um `.docx` mantendo a formatação = editar `word/document.xml` dentro do zip. O Word
quebra texto em *runs* de formatação, e `[NOME COMPLETO DO(A) CANDIDATO(A)]` pode estar fatiado em
cinco pedaços no XML — um `replace` ingênuo não acha nada e o documento sai com o colchete intacto.
A solução é normalizar os runs de cada parágrafo antes de substituir. É a razão de a emissão ser a
fase 3 e não a fase 1.

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

Vencimentos entram no motor de alertas que já existe para CNH, CRLV e apólice em Viáticos:
ASO periódico, contrato de experiência, CCT, seguro de vida.

---

## 7. Cargos e salários

10 descrições de cargo no acervo contra 5 cargos no cadastro. O catálogo fecha a distância e faz
três coisas funcionarem sozinhas:

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
| **1 — a base** | campos de RH em `erp_colaboradores`, vínculos, dependentes, dossiê com categorias e checklist, tela de lista e ficha com abas | o acervo passa a viver no ERP, e o checklist mostra o que falta |
| **2 — a memória** | eventos, linha do tempo na ficha, painel com as filas de ação | a ficha vira histórico; nenhuma experiência se efetiva por esquecimento |
| **3 — o motor** | biblioteca de minutas, detecção de campos, mesclagem, saída `.docx`+PDF, arquivamento com estado de assinatura | admissão inteira emitida da ficha |
| **4 — o alcance** | catálogo de cargos, autosserviço, pontes com Contas a Pagar e Usuários | RH deixa de ser ilha |

---

## 10. Pendências para o usuário decidir

1. **As minutas em branco.** Só a Carta Oferta de Técnico de Campo tem os colchetes. Dos contratos
   de trabalho só há versões preenchidas — preciso da minuta em branco, ou autorização para gerá-la
   a partir de uma preenchida substituindo os dados pelos campos.
2. **Os dois erros nos contratos assinados.** Corrigir só nos modelos daqui para frente, ou
   registrar aditivo?
3. **A regra do checklist.** Quais documentos são obrigatórios na admissão.
4. **O mapa cargo → regime.** Quais dos 10 cargos são "de confiança" e quais "regular".
5. **Onde ficam os arquivos.** Hoje anexos vão como `bytea` no Postgres; os 22 atuais somam 8,6 MB
   e um dossiê completo de 11 pessoas é outra ordem de grandeza. Decidir entre continuar no banco
   ou mover para o Supabase Storage.
