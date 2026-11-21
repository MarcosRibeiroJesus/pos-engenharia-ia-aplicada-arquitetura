# Prompts das sessões de projeto (D-066)

Uma sessão por vez, aberta pelo dono no ambiente de nuvem `pos-arquitetura`, na ordem D02 (assistente de agendamento), D03 (MCP de regras do CDB) e D01 (recomendação). Cada sessão termina com push e PR; só abra a próxima quando a anterior terminar, para não estourar o limite de uso de 5 horas (três em paralelo estouraram em 25 minutos).

## Como abrir cada sessão (passo a passo)

1. Abra o Claude Code na web (claude.ai/code) e clique para criar uma sessão nova.
2. Em **repositório**, escolha `MarcosRibeiroJesus/pos-engenharia-ia-aplicada-arquitetura`.
3. Em **ambiente**, escolha `pos-arquitetura` (o ambiente com a rede em modo Custom e o script `scripts/setup-ambiente.sh`). Se aparecer outro ambiente, troque antes de enviar.
4. Em **modelo**, escolha Opus.
5. Cole o prompt da sessão (abaixo) e envie. Deixe a sessão rodar até ela avisar que terminou ou parou num bloqueio.
6. Confira o PR no GitHub: a primeira linha traz o estado. Só então abra a próxima sessão.

Antes da D01 confira no ambiente `pos-arquitetura`: variável `FLOCI_IMAGE` (por exemplo `floci/floci:2.5.0`) e a rede liberando o registry do Terraform, o Docker Hub e o floci.io. A sessão da D01 confere isso no passo 1 e para se faltar algo.

## Sessão 1: D02 (assistente de agendamento)

```
Projeto: 02-assistente-agendamento
Repositório: MarcosRibeiroJesus/pos-engenharia-ia-aplicada-arquitetura. Branch de trabalho: modulo/02-apis-ia-generativa/assistente-agendamento (já existe, com código e 142 testes feitos antes do SDD). Modelo desta sessão: Opus.

Você é a sessão do projeto D02 (assistente de agendamento), aberta pelo dono (Marcos) em 2026-11-21 (D-064, D-066): uma sessão por vez, aberta por ele no ambiente pos-arquitetura.

1. Ritual: clone o repositório, faça checkout do branch e traga o main para ele (git fetch origin main && git merge origin/main), porque o branch é anterior ao harness atual (gate D-061). Rode a skill `retomar`: `bash harness/init.sh`, `python3 harness/memoria.py ler` e os testes do harness. Leia CLAUDE.md, AGENTS.md e a constituição.
2. Objetivo: levar o projeto de `especificar` até o `plan.md` pronto para a aprovação do dono, pelo SDD:
   - spec retroativa do que já existe (skill `sdd-especificar`, especialista `especificador`), depois `esclarecer`;
   - plano (skill `sdd-planejar`, especialista `arquiteto-aws`) com a arquitetura âncora escolhida pelo dono (D-065): https://aws.amazon.com/blogs/machine-learning/nateras-intelligent-appointment-scheduling-with-amazon-bedrock-agentcore/ (26/08/2026). O ADR-0001 registra o que se segue da âncora e o que muda: a Natera é agente de voz sem aprovação humana; o nosso é de texto, com cancelamento aprovado por humano (D-008), gateway com fallback, intenção em JSON, memória, defesa contra prompt injection e avaliações (D-048);
   - custo de um dia de demonstração e teto diário proposto (skill `custo-diario`, especialista `finops-demonstracao`); o valor do teto diário é decisão do dono;
   - rodada real paga para medir acerto e custo: teto por execução de US$ 20 (D-068); proponha o custo estimado dela no plano;
   - cloud comparativa GCP (D-007).
   Os disparos dessas fases são livres (D-055). Use `python3 harness/estado.py avancar` para mudar de fase. Cada entrega passa por revisor independente em outra instância antes do commit.
3. Pare quando o `plan.md` estiver pronto: o plano vai para a aprovação do dono. Não registre aprovação de plano e não avance para `tarefas`.
4. Terraform só se a sessão tiver `terraform`, providers e Floci (D-063); nesta fase não deve ser preciso. Nunca rode apply.
5. Ao terminar: commits com o que estiver verde, linha em `harness/progresso.md`, uso registrado em `harness/uso/`, push (o pre-push exige a memória lida) e PR para o main, ou atualize o PR existente do branch. Perguntas ao dono vão na seção `## Perguntas ao dono` do PR, na tabela `| id | pergunta | bloqueia | opções | recomendação |`, com ids D02-Pn. Inclua as pendências já conhecidas: a 2ª pergunta da sessão D02 e as chaves do Langfuse (D-048). Não assuma escolhas do dono.
6. Avise no PR, na primeira linha, "Pronto para revisão do dono: plano da D02" quando chegar lá. O dono revisa e mergeia; não peça aprovação formal (D-062).
```

## Sessão 2: D03 (MCP de regras do CDB)

```
Projeto: 03-mcp-regras-cdb
Repositório: MarcosRibeiroJesus/pos-engenharia-ia-aplicada-arquitetura. Branch de trabalho: modulo/03-mcp/mcp-regras-cdb (crie a partir do origin/main se não existir). Modelo desta sessão: Opus.

Você é a sessão do projeto D03 (MCP de regras do produto sintético CDB com liquidez diária), aberta pelo dono (Marcos) em 2026-11-21 (D-064, D-066): uma sessão por vez, aberta por ele no ambiente pos-arquitetura.

1. Ritual: clone o repositório, crie ou faça checkout do branch e rode a skill `retomar`: `bash harness/init.sh`, `python3 harness/memoria.py ler` e os testes do harness. Leia CLAUDE.md, AGENTS.md, a constituição, `modulos/03-mcp/` e o que existir em `specs/03-mcp-regras-cdb/`. O OPCOES.md da D03 está no branch modulo/03-mcp/opcoes (PR #6), só como referência.
2. Objetivo: levar o projeto de `especificar` até o `plan.md` pronto para a aprovação do dono, pelo SDD:
   - spec (skill `sdd-especificar`, especialista `especificador`), com spec retroativa do pouco que já existe, depois `esclarecer`;
   - plano (skill `sdd-planejar`, especialista `arquiteto-aws`) com a arquitetura âncora escolhida pelo dono (D-065): https://aws.amazon.com/blogs/architecture/mcp-went-stateless-is-your-aws-mcp-server-deployment-well-architected (01/09/2026). Decisões do dono que valem: MCP 2026-07-28 sem estado, com lane de compatibilidade para clientes antigos (D-011); a D03 é o primeiro consumidor da plataforma `00-plataforma-agentes` (D-034, skill `plataforma-agentes`); cloud comparativa Azure (D-007). O ADR-0001 registra o que se segue da âncora e o que muda;
   - design de tools e erros estruturados pela skill `servidor-mcp` (especialista `engenheiro-mcp` só a partir de implementar);
   - custo de um dia de demonstração e teto diário proposto (skill `custo-diario`, especialista `finops-demonstracao`); o valor do teto diário é decisão do dono. Se o plano tiver rodada real paga do componente Claude, o teto por execução é US$ 20 (D-068).
   Os disparos dessas fases são livres (D-055). Use `python3 harness/estado.py avancar` para mudar de fase. Cada entrega passa por revisor independente em outra instância antes do commit.
3. Pare quando o `plan.md` estiver pronto: o plano vai para a aprovação do dono. Não registre aprovação de plano e não avance para `tarefas`.
4. Terraform só se a sessão tiver `terraform`, providers e Floci (D-063); nesta fase não deve ser preciso. Nunca rode apply.
5. Ao terminar: commits com o que estiver verde, linha em `harness/progresso.md`, uso registrado em `harness/uso/`, push (o pre-push exige a memória lida) e PR para o main. Perguntas ao dono vão na seção `## Perguntas ao dono` do PR, na tabela `| id | pergunta | bloqueia | opções | recomendação |`, com ids D03-Pn. Não assuma escolhas do dono.
6. Avise no PR, na primeira linha, "Pronto para revisão do dono: plano da D03" quando chegar lá. O dono revisa e mergeia; não peça aprovação formal (D-062).
```

## Sessão 3: D01 (recomendação), só depois de confirmar a rede

```
Projeto: 01-recomendacao
Repositório: MarcosRibeiroJesus/pos-engenharia-ia-aplicada-arquitetura. Branch de trabalho: modulo/01-fundamentos-ia-llms/03-recomendacao (PR #1). Modelo desta sessão: Opus.

Você é a sessão do projeto D01 (recomendação de e-commerce), aberta pelo dono (Marcos) em 2026-11-21 (D-064, D-066), com o Terraform rodando nas sessões de nuvem, sem ciclo local (D-063, substitui a D-042). Trabalhe pelos critérios de interrupção da skill `executar-tarefas`.

1. Ambiente primeiro. Rode `terraform version`, `docker info` (se o Docker estiver parado, inicie com `dockerd`) e confira se a imagem do Floci está presente (`${FLOCI_IMAGE:-floci/floci:latest}`). Num stack do projeto, rode `terraform init -backend=false`. Se o Terraform, os providers ou o Floci faltarem, não escreva Terraform às cegas: anote o bloqueio no `harness/progresso.md` e na seção `## Bloqueios` do PR #1, com o comando e o erro, e pare.
2. Ritual: faça checkout do branch e traga o main (git fetch origin main && git merge origin/main), porque o branch pode estar atrás do harness (gate D-061). Num conflito no `harness/estado.json`, mantenha a entrada `01-recomendacao` do branch (fase implementar, plano aprovado em D-056 e D-057, teto diário de US$ 7,10). Rode a skill `retomar`: `bash harness/init.sh`, `python3 harness/memoria.py ler` e os testes. Confira `python3 harness/estado.py pode-delegar 01-recomendacao`.
3. Objetivo: executar a fase `implementar` com a skill `executar-tarefas` (D-047), seguindo `specs/01-recomendacao/tasks.md`. Uma tarefa por vez, especialista da tarefa → revisor independente em outra instância (no máximo 2 rodadas) → commit só do que foi aprovado, com teste vermelho antes do código. Trabalho mecânico e ajuste de texto em Sonnet (D-058); código, Terraform e segurança em Opus. A arquitetura âncora é a do post do AWS Big Data Blog de 27/07/2026 (D-065): https://aws.amazon.com/blogs/big-data/building-a-scalable-personalized-recommendation-system-on-aws-from-batch-to-real-time/
4. Nunca: apply ou destroy fora do Floci, push com força, push no main, merge. Integração no Floci só na fase verificar, com o projeto completo.
5. Interrupção só pelos critérios da skill (tarefa [DONO], mudança de plano, falha repetida, ação irreversível): registre em `## Bloqueios` e `## Perguntas ao dono` do PR #1, na tabela `| id | pergunta | bloqueia | opções | recomendação |`, com ids D01-Pn, e siga com as tarefas que não dependem disso. Não assuma escolhas do dono.
6. Ao parar ou terminar a fase: commits do que estiver verde, linha em `harness/progresso.md`, uso registrado em `harness/uso/`, push (o pre-push exige a memória lida) e a primeira linha do PR #1 com o estado: "Em andamento: Tn de 76" ou "Pronto para revisão do dono: implementação da D01". O dono revisa e mergeia; não peça aprovação formal (D-062).
```
