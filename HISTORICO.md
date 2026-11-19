# Memória compartilhada: histórico de decisões

Registro completo, do mais novo para o mais antigo. Cada entrada traz data, id e fonte:
- "Marcos": ele decidiu.
- "delegada": decisão técnica ou de processo tomada pela orquestração com base nas boas práticas da prova, conforme a D-014.

Quando uma decisão substitui outra, a nova diz qual substitui. Nada é apagado.

### 2026-11-19 · D-017 · Harness fase 1 · fonte: delegada
- **Continuidade em arquivos** (estado.json, progresso.md, init.sh e ritual `retomar`), não em chat. É o padrão de harness para agentes de longa duração da Anthropic (1.7, 5.1).
- **Gate de SDD por hook:** uma instrução pode ser ignorada; o gate garante o Artigo I (1.4, 1.5).
- **Análise feita por subagente independente,** porque quem escreveu a spec não enxerga as próprias lacunas (4.6).
- **Uma tarefa por sessão,** para o trabalho caber no contexto e cada passo ser verificável (1.6).
- **Uso de tokens num arquivo por sessão,** para que sessões em paralelo não gerem conflito.
- **Spec Kit:** a mesma estrutura de arquivos, implementada no próprio harness; o CLI pode ser adotado depois sem migração.

### 2026-11-19 · D-016 · SDD obrigatório em todos os projetos · fonte: Marcos
Todo projeto passa por especificar → esclarecer → planejar → tarefas → analisar → implementar → verificar → publicar. Os projetos em andamento (D01, D02, D03) fazem a spec retroativa antes de novas mudanças. O harness com SDD deve ser reutilizável em outros projetos.

### 2026-11-19 · D-015 · Gate de entrega, retomada e perguntas no PR · fonte: delegada
- **Gate de entrega:** um hook `PreToolUse` nega push e PR enquanto a sessão não recebeu a memória mais recente. Uma instrução no prompt pode ser ignorada; o hook garante que nenhuma entrega sai com decisão velha (tarefas 1.4 e 1.5).
- **Proteção da fonte:** só a orquestração escreve no branch de memória (1.2).
- **Retomada:** sessão parada mais de 8 horas, ou com memória alterada, recomeça com resumo estruturado. Retomar sobre resultados de ferramenta antigos leva a decisões com dados velhos (1.7, 5.1).
- **Perguntas:** vão em tabela no corpo do PR e são coletadas pela orquestração para o Monday. É um canal estruturado de escalonamento, para nenhuma pergunta ficar presa na interface de uma sessão (5.2).
- **Memória em dois arquivos:** estado curto mais histórico. O contexto é orçamento, e o bloco de fatos que sempre entra precisa ser pequeno (5.1).
- **Proveniência:** cada entrada passa a ter fonte (5.6).

### 2026-11-19 · D-014 · Decisões técnicas e de processo delegadas · fonte: Marcos
A orquestração toma, sem pedir aprovação, as decisões técnicas e de processo sobre como construir com Claude, segundo as boas práticas da prova CCAR-F e na ordem recomendada. Sempre explica o porquê, com os ids das tarefas.

Continuam com o Marcos:
- escopo e produto;
- orçamento e custos reais;
- cloud comparativa;
- projetos de IA aplicada;
- merge e publicação;
- variáveis, secrets e configurações da conta dele.

### 2026-11-19 · D-013 · Floci fixado por tag de versão · fonte: Marcos
Tag em vez de `latest` ou digest. Recomendada `floci/floci:2.5.0`, a versão que o ambiente de nuvem roda. Workflows e scripts leem `FLOCI_IMAGE`, com fallback.

### 2026-11-19 · D-012 · Variáveis e secrets novos · fonte: Marcos
Quando o Marcos criar uma variável ou um secret, troque sem pedir confirmação em todo lugar que depende dele, com fallback seguro. Criar a variável e escolher o valor são dele.

### 2026-11-19 · D-011 · D03: versão do MCP e teto · fonte: Marcos (respondido na sessão D03)
MCP 2026-07-28, sem estado, com lane de compatibilidade para clientes antigos. Teto do lab: US$ 10/mês.

### 2026-11-19 · D-010 · Plano de orquestração aprovado · fonte: Marcos
Onda 1: D01 recomendação (o Marcos retoma a sessão), D02 assistente de agendamento e D03 MCP do CDB. Onda 2: D01 Doom. Sessões em Opus, com subagentes Sonnet e Haiku.

### 2026-11-19 · D-009 · Uma arquitetura e um projeto de IA aplicada por disciplina · fonte: Marcos
Substitui o formato "por unidade". As opções por unidade dos `OPCOES.md` ficam só como referência.

### 2026-11-19 · D-008 · Escolhas das arquiteturas D01 a D03 · fonte: Marcos
- D01: recomendação de e-commerce.
- D02: assistente de agendamento completo, que junta gateway com fallback, grafo de etapas, intenção em JSON, cancelamento com aprovação humana, memória, defesa contra prompt injection e avaliações.
- D03: MCP de regras do produto sintético CDB com liquidez diária.

### 2026-11-19 · D-007 · Cloud comparativa · fonte: Marcos
GCP na D01 e na D02, Azure na D03.

### 2026-11-19 · D-006 · Sem Claude real nos testes · fonte: Marcos
Os testes do componente Claude usam só respostas gravadas. Cada projeto registra em ADR que o comportamento real do modelo fica sem validação.

### 2026-11-19 · D-005 · Escopo · fonte: Marcos
Foco nas disciplinas 01, 02 e 03; a D04 fica para depois.

### 2026-11-19 · D-004 · Nunca assumir escolhas do Marcos · fonte: Marcos
Silêncio, pergunta pulada ou "sem objeção" não são resposta. Está no `CLAUDE.md` e no hook `sem_suposicoes.py`.

### 2026-11-19 · D-003 · Histórico do git não será reescrito · fonte: Marcos
Sem force push no `main`.

### 2026-11-18 · D-002 · Modelo por tarefa e registro de uso · fonte: Marcos
Opus, Sonnet e Haiku conforme o tipo de trabalho; Fable só com aprovação. Uso de tokens registrado em `docs/uso/uso-tokens.csv` e no app `apps/painel-ia`.

### 2026-11-18 · D-001 · Privacidade e material do curso · fonte: Marcos
Nada do curso nem dados do aluno no repositório. Nenhum detalhe das empresas em que o Marcos trabalha. Só fontes públicas e dados sintéticos.
