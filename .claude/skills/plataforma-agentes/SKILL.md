---
name: plataforma-agentes
description: Consumir a plataforma compartilhada de agentes na AWS (projeto 00-plataforma-agentes, D-030), com gateway MCP, política e identidade, guardrails, perfil de inferência por produto, observabilidade e evals. Use ao planejar ou implementar um produto que chama o Claude no Bedrock ou expõe tools MCP.
---

# Plataforma de agentes compartilhada

## Por que existe
Os produtos não repetem governança: a plataforma concentra o que uma empresa centraliza num time de plataforma de IA. Cada produto consome por interface versionada, como no modelo federado do blog oficial da AWS sobre plataforma agêntica no AgentCore.

## Modelo de uso (D-028)
- **Agentes de código:** usam a assinatura do dono, fora da AWS.
- **Na AWS:** roda a plataforma e o agente do produto, só durante a demonstração, com o Claude via Bedrock.

## O que o produto usa
| Capacidade | Como o produto consome | Tarefas da prova |
|---|---|---|
| Acesso ao modelo | perfil de inferência de aplicação do produto (custo por tag) e a role do produto | 4.5 (custo) |
| Guardrails | id do guardrail da plataforma em toda chamada; o resultado do guardrail entra nos testes gravados | 5.2 |
| Gateway MCP | tools do produto registradas como alvo do gateway; o agente chama só pelo gateway | 2.1, 2.4 |
| Política | regras Cedar sobre quem chama qual tool e com quais limites; ação sensível sem regra explícita é negada | 1.4 |
| Identidade | o agente se autentica no gateway; segredo nunca entra no prompt | 2.2 |
| Observabilidade e evals | spans e métricas por produto; o gate de CI segue com respostas gravadas | 4.6, 5.5 |

## Consumo completo obrigatório em toda arquitetura AWS (D-074)
- **Separação de papéis entre os dois projetos da disciplina:**
  - **Projeto de IA aplicada (`ia-aplicada`):** 100% alinhado às aulas da disciplina.
  - **Arquitetura AWS (`arquitetura`):** foco em conceitos e ferramentas de produção na AWS, coerente com os exemplos oficiais da AWS (âncora D-065) e não restrito às simplificações da aula.
- **Todo projeto de arquitetura AWS (`01-recomendacao`, `02-assistente-agendamento`, `03-mcp-regras-cdb` e seguintes) consome completamente a `00-plataforma-agentes`** pelo módulo `registro-produto` e pelo contrato SSM:
  1. **Gateway MCP (`AgentCore Gateway`):** tools ou ações do produto registradas como alvo do gateway;
  2. **Política (`AgentCore Policy` em `ENFORCE`):** regras Cedar geradas a partir das classes das tools (`leitura_publica`, `dado_privado`, `conteudo_nao_confiavel`, `canal_saida`, `sensivel`), com validação contra a tríade letal e `InvokeGuardrailChecks`;
  3. **Guardrails (`Bedrock Guardrails`):** guardrail do produto imposto por condição IAM (`bedrock:GuardrailIdentifier`);
  4. **Acesso ao modelo (`Application Inference Profile`):** perfil de inferência por produto para atribuição de custo por tag `project`;
  5. **Observabilidade, alarmes e avaliações (`AgentCore Evaluations`):** spans no Transaction Search, alarmes no tópico SNS do contrato `comum` e coleta de evidências/avaliações sob demanda.
- Substitui o consumo parcial na D02 (passa da opção A da D-070 para o consumo completo, opção B do ADR-0003 da D02) e estende a D01 para registrar também alvo e política Cedar no gateway além de perfil, guardrail e alarme.

## Primeiro consumidor e alarmes (D-034)
- **O primeiro produto a consumir a plataforma é a D03** (`03-mcp-regras-cdb`, servidor MCP como alvo do gateway). Confira a versão de MCP que o gateway aceita contra a lane de compatibilidade da D03.
- **Os alarmes da plataforma vão para os mesmos e-mails de `emails_alerta` do `infra/conta`,** sem variável nova.
- **As configurações da conta** (tag de custo e Transaction Search) seguem a skill `ciclo-demonstracao`.

## Tríade letal
O mesmo agente não pode ter, ao mesmo tempo, dado privado, conteúdo não confiável e um canal de saída. Se o produto precisa das três, divida em agentes com a política separando os papéis, e documente no modelo de ameaças.

## Custo e ciclo
- **Tudo é cobrado por uso.** A plataforma sobe e desce com a demonstração (skill `ciclo-demonstracao`), e o custo dela entra no teto de um dia do produto.
- **Serviço novo com custo fixo,** como um gateway de inferência sempre ligado ou Langfuse hospedado, precisa de ADR e da decisão do dono.
