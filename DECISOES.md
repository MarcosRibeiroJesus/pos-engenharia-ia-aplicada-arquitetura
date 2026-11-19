# Memória compartilhada: decisões macro

Fonte única das decisões tomadas pelo Marcos (dono do repositório) na conversa de orquestração. Toda sessão lê este arquivo ao iniciar e sempre que ele muda; o hook `.claude/hooks/memoria_compartilhada.py` avisa quando há novidade.

Regras deste arquivo:
- Uma decisão só entra aqui depois de tomada pelo Marcos. O que ainda não foi decidido fica em **Pendências**, nunca como decisão.
- Entradas novas vão no topo do **Registro**, com data e id. Quando uma decisão substitui outra, a nova diz qual substitui. As antigas não são apagadas.
- Se uma decisão daqui contradiz o seu briefing ou o seu branch, vale a daqui: ajuste o trabalho e registre no PR o que mudou.

## Estado atual (resumo)

| Disciplina | Arquitetura AWS | IA aplicada | Cloud comparativa | Teto do lab |
|---|---|---|---|---|
| D01 Fundamentos | Recomendação de e-commerce (PR #1) | Doom: detecção YOLO em TF.js num Web Worker, Doom em WASM (fiel à aula; **não** é aprendizado por reforço) | GCP | pendente |
| D02 APIs de IA generativa | Assistente de agendamento completo | pendente (o Marcos escolhe depois das aulas) | GCP | pendente |
| D03 MCP | MCP de regras de negócio do CDB com liquidez diária (opção R4) | pendente (o Marcos escolhe depois das aulas) | Azure | US$ 10/mês |
| D04 Agentes autônomos | adiada | adiada | — | — |

## Registro

### 2026-11-19 · D-013 · Floci fixado por tag de versão
O Floci é fixado por tag de versão, não por `latest` nem por digest. A tag recomendada é `floci/floci:2.5.0`, a que o ambiente de nuvem já roda; o Marcos ainda vai criar a variável `FLOCI_IMAGE`. Workflows usam `${{ vars.FLOCI_IMAGE || 'floci/floci:latest' }}`; scripts usam `${FLOCI_IMAGE:-floci/floci:latest}`. Nenhum workflow deve ter `floci/floci:latest` escrito direto.

### 2026-11-19 · D-012 · Variáveis e secrets novos
Quando o Marcos criar uma variável ou um secret, troque sem pedir confirmação todas as referências que dependem dele: workflows, scripts, READMEs e sessões em andamento. Use sempre fallback seguro. Criar a variável e escolher o valor são decisões dele.

### 2026-11-19 · D-011 · D03: versão do MCP e teto
D03 usa a revisão sem estado do MCP (2026-07-28), com lane de compatibilidade para clientes antigos. Teto do lab: US$ 10/mês.

### 2026-11-19 · D-010 · Plano de orquestração aprovado
Onda 1: D01 recomendação (o Marcos retoma a sessão), D02 assistente de agendamento e D03 MCP do CDB. Onda 2: D01 Doom (IA aplicada). Sessões em Opus; subagentes Sonnet para pesquisa e posts, Haiku para tarefas mecânicas.

### 2026-11-19 · D-009 · Uma arquitetura e um projeto de IA aplicada por disciplina
Substitui o formato "por unidade". Cada disciplina tem uma arquitetura AWS (com a versão em outra cloud) e um projeto de IA aplicada. As opções por unidade dos `OPCOES.md` ficam só como referência.

### 2026-11-19 · D-008 · Escolhas das arquiteturas D01 a D03
D01 = recomendação de e-commerce. D02 = assistente de agendamento completo, que junta:
- gateway com fallback;
- grafo de etapas;
- intenção em JSON;
- cancelamento com aprovação humana;
- memória;
- defesa contra prompt injection;
- avaliações.

D03 = MCP de regras do produto sintético CDB com liquidez diária.

### 2026-11-19 · D-007 · Cloud comparativa
GCP na D01 e na D02, Azure na D03.

### 2026-11-19 · D-006 · Sem Claude real nos testes
Os testes do componente Claude usam só respostas gravadas, com custo de modelo zero. Cada projeto registra em ADR que o comportamento real do modelo fica sem validação.

### 2026-11-19 · D-005 · Escopo
Foco nas disciplinas 01, 02 e 03; a D04 fica para depois.

### 2026-11-19 · D-004 · Nunca assumir escolhas do Marcos
Silêncio, pergunta pulada ou "sem objeção" não são resposta. Antes de agir, confira o que falta e pergunte. Isso vale mesmo quando uma ferramenta mandar assumir. Está no `CLAUDE.md` e no hook `sem_suposicoes.py`.

### 2026-11-19 · D-003 · Histórico do git não será reescrito
Sem force push no `main`.

### 2026-11-18 · D-002 · Modelo por tarefa e registro de uso
Modelos por tipo de trabalho:
- Opus: arquitetura, código e segurança.
- Sonnet: pesquisa, posts e site.
- Haiku: tarefas mecânicas.
- Fable: só com aprovação.

Uso de tokens registrado em `docs/uso/uso-tokens.csv` (PR #11) e no app `apps/painel-ia` (PR #12).

### 2026-11-18 · D-001 · Privacidade e material do curso
Nada do curso nem dados do aluno no repositório: sem plataforma, matrícula, datas ou progresso. Nenhum detalhe das empresas em que o Marcos trabalha. Só fontes públicas e dados sintéticos.

## Pendências (aguardando o Marcos; não trate como decidido)
- D02: avaliações e observabilidade (gate no CI, Langfuse só local ou Langfuse na AWS), mais a 2ª pergunta aberta na sessão D02.
- Teto de custo do lab para D01 e D02.
- Projetos de IA aplicada da D02 e da D03.
- Revisores de IA na esteira (custo de tokens) e conta AWS com OIDC para o `terraform plan` nos PRs.
- Criar a variável `FLOCI_IMAGE` e o secret `INFRACOST_API_KEY`; ativar o Dependency graph; configurar o ruleset do `main`.
- Merges dos PRs #9, #10, #11, #12 e #14.
