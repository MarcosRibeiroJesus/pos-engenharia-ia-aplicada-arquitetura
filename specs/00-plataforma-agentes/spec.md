# Spec: Plataforma de agentes compartilhada na AWS

- **Projeto:** `00-plataforma-agentes` · **Disciplina:** 00 (plataforma, atende todas) · **Tipo:** plataforma
- **Status:** rascunho
- **Artigos da constituição que se aplicam:** I, II, III, IV, V, VI, VII, VIII

## Problema e objetivo
Hoje cada projeto da pós resolve sozinho o acesso ao Claude, as tools, a segurança contra prompt injection e a observabilidade. Isso repete trabalho e deixa a governança espalhada. Uma empresa resolve isso com um time de plataforma de IA, que publica um **caminho padrão** e capacidades compartilhadas consumidas pelos times de produto.

**Objetivo:** todo produto novo entra pela mesma esteira (`harness/novo_projeto.py`, gates SDD, CI, segurança e FinOps) e, quando roda na AWS, consome uma plataforma única que oferece:
- acesso governado ao Claude;
- gateway MCP com política e identidade;
- guardrails;
- observabilidade e evals.

**Deu certo quando:**
- um produto (D02 ou D03) faz uma demonstração usando só as interfaces da plataforma;
- o custo da plataforma fica dentro do teto de um dia desse produto;
- o destroy deixa a conta sem sobras.

Fontes oficiais que orientam o desenho:
- AWS Prescriptive Guidance, *Building an internal developer platform on AWS*: caminhos padrão como capacidade central da plataforma.
- AWS Machine Learning Blog, *Building an agentic AI platform on Amazon Bedrock AgentCore*: modelo federado, com conta de plataforma publicando interfaces versionadas e times de produto consumindo.
- Página de preços do Amazon Bedrock AgentCore: Runtime, Gateway, Policy, Identity, Memory, Observability e Evaluations, todos cobrados por uso.

## Histórias de usuário
- **H1.** Como dono do repositório, quero criar um produto novo com um comando e vê-lo passar pelos mesmos gates de todos, para não reconfigurar a esteira a cada disciplina.
  - Dado um projeto criado por `novo_projeto.py`, quando abro o PR, então rodam os gates SDD, o CI do harness, a esteira de segurança e o FinOps sem configuração extra.
- **H2.** Como agente de um produto, quero chamar tools só pelo gateway da plataforma, com uma política que limite o que posso fazer, para que uma injeção de prompt não vire ação indevida.
  - Dado um pedido de tool fora da política do produto, quando o agente chama o gateway, então a chamada é negada e o evento fica registrado.
- **H3.** Como dono, quero que cada chamada ao Claude seja atribuída ao produto que a fez, para comparar o custo com o teto diário.
  - Dado um produto com perfil de inferência de aplicação, quando ele chama o modelo, então o custo aparece com a tag `project` do produto.
- **H4.** Como avaliador, quero traces e métricas por produto e evals no CI, para decidir mudanças de prompt e de arquitetura com dados.

## Requisitos funcionais
- **RF-001:** a plataforma DEVE expor um gateway MCP único (AgentCore Gateway) onde cada produto registra os seus alvos de tool.
- **RF-002:** a plataforma DEVE aplicar uma política por produto (AgentCore Policy, em Cedar) às chamadas de tool, negando por padrão.
- **RF-003:** a plataforma DEVE autenticar os agentes no gateway (AgentCore Identity), sem segredo em prompt nem em variável de ambiente em texto.
- **RF-004:** a plataforma DEVE oferecer um guardrail do Bedrock (prompt injection, tópicos negados, dados sensíveis) usado em toda chamada dos produtos.
- **RF-005:** a plataforma DEVE criar, para cada produto que chama o Claude, um perfil de inferência de aplicação com a tag `project` do produto.
- **RF-006:** a plataforma DEVE coletar traces, logs e métricas por produto (AgentCore Observability e CloudWatch) e oferecer avaliação por uso (AgentCore Evaluations), sem tirar do CI o gate por respostas gravadas.
- **RF-007:** a plataforma DEVE publicar as suas interfaces (ids e ARNs) como outputs versionados, consumidos pelos produtos por `terraform_remote_state` ou SSM, sem copiar valores à mão.
- **RF-008:** a plataforma DEVE subir e descer pelo mesmo ciclo dos produtos: apply com prazo e destroy automático em até 24 h (D-021, D-024).

## Requisitos não funcionais
- **RNF-001** (segurança, Art. IV):
  - nada público;
  - criptografia com KMS em repouso e TLS em trânsito;
  - roles de menor privilégio;
  - isolamento entre produtos por tag `project` e prefixo, com ABAC (D-029);
  - defesa contra a tríade letal (dado privado, conteúdo não confiável e canal de saída no mesmo agente) por política e separação de agentes.
- **RNF-002** (custo, Art. V):
  - só serviços cobrados por uso, sem custo fixo ocioso;
  - teto = custo estimado de um dia de execução, calculado no plano;
  - limite mensal da conta de US$ 20 (D-022);
  - destroy por workflow sem sobras.
- **RNF-003** (operação, Art. VI):
  - tags `project`, `module` e `managed-by`;
  - alarmes de erro e de negação de política;
  - state remoto com lock;
  - README com no máximo 5 passos.
- **RNF-004** (conta, D-029): conta AWS única. Nada de Organizations, Control Tower ou serviço de governança com custo fixo.
- **RNF-005** (modelos, D-028): os agentes de código não passam pela plataforma; eles usam a assinatura do dono. Na AWS rodam só a plataforma e os agentes dos produtos, durante as demonstrações.

## Componente Claude e tarefas da prova
A plataforma não tem agente próprio; ela é a camada de governança dos agentes dos produtos. Ela exercita:
- 1.4: gates programáticos (política nega por padrão) e handoff para humano em ação sensível;
- 2.1, 2.2 e 2.4: interface de tools pelo gateway MCP, erros estruturados vindos da política e do guardrail, e registro de alvos;
- 4.6 e 5.5: evals e revisão humana com dados de observabilidade;
- 5.2 e 5.3: escalonamento quando o guardrail ou a política bloqueiam, com o motivo propagado ao produto.

**Teste:** `terraform test` com mock provider para a infraestrutura. Um agente de exemplo, com respostas gravadas, prova: chamada permitida, chamada negada pela política e entrada bloqueada pelo guardrail.

## Fora de escopo
- **Memória de longo prazo compartilhada (AgentCore Memory):** entra no produto que precisar, como o assistente da D02.
- **Gateway de inferência sempre ligado e Langfuse hospedado:** têm custo fixo. Langfuse é decisão pendente do dono na D02.
- **Multi-conta:** Organizations e Control Tower ficam fora (D-029).
- **Pacote npx do harness:** só depois da versão estável e testada (D-027).
- **Agentes de código rodando na AWS** (D-028).

## Perguntas ao dono
| id | pergunta | bloqueia | opções | recomendação |
|---|---|---|---|---|
| P00-P1 | Dentro de um plano SDD que você já aprovou, a orquestração pode delegar cada tarefa ao especialista sem pedir aprovação a cada disparo? O `CLAUDE.md` hoje pede aprovação antes de disparar subagentes. | automação das fases planejar, tarefas, analisar e implementar | aprovar cada disparo; aprovar o plano e liberar os disparos dentro dele; aprovar só a análise (fase analisar) | aprovar o plano e liberar os disparos: o gate `sdd-analisar` e o merge continuam com você |
| P00-P2 | Conta AWS com OIDC para o primeiro deploy real da plataforma (o card opcional já existente). | só a demonstração real; o desenvolvimento e o Floci seguem sem conta | criar agora; criar quando o primeiro produto estiver pronto | criar quando o primeiro produto estiver pronto |

## Decisões do dono que esta spec usa
D-021, D-022, D-024, D-025, D-027, D-028, D-029; e D-030 (delegada: componentes da plataforma).
