# Spec: Plataforma de agentes compartilhada na AWS

- **Projeto:** `00-plataforma-agentes` · **Disciplina:** 00 (plataforma, atende todas) · **Tipo:** plataforma
- **Status:** esclarecida (2026-11-19). Não resta ambiguidade técnica. As perguntas do dono P00-P3 a P00-P5 foram respondidas em 2026-11-19 (D-034); não há pergunta aberta.
- **Artigos da constituição que se aplicam:** I, II, III, IV, V, VI, VII, VIII

## Problema e objetivo
Hoje cada projeto da pós resolve sozinho o acesso ao Claude, as tools, a defesa contra prompt injection e a observabilidade. Isso repete trabalho e espalha a governança. Uma empresa resolve isso com um time de plataforma de IA, que publica um **caminho padrão** e capacidades compartilhadas que os times de produto consomem.

**Objetivo:** todo produto novo entra pela mesma esteira (`harness/novo_projeto.py`, gates SDD, CI, segurança e FinOps). Quando roda na AWS, ele consome uma plataforma única que oferece:
- acesso governado ao Claude;
- gateway MCP com política e identidade;
- guardrails;
- observabilidade e evals.

**Deu certo quando** (os três critérios são verificados na fase verificar):
1. **Demonstração só pelas interfaces.** O primeiro produto consumidor, a D03 (`03-mcp-regras-cdb`, alvo servidor MCP; D-034, resposta à P00-P3), faz o roteiro de demonstração (RF-010) só pelo contrato v1 (RF-007).
   - **Então:** o código e o Terraform do produto não têm nenhum ARN ou id da plataforma escrito à mão (busca por `arn:aws:bedrock-agentcore` e `arn:aws:bedrock` dá zero ocorrência fora de testes com dados gravados).
   - **E:** as métricas do dia mostram `AllowDecisions` ≥ 1 e `DenyDecisions` ≥ 1 no motor de política.
2. **Custo dentro do teto.** O custo de 24 horas estimado pelo Infracost no PR fica ≤ `teto_diario_usd` da plataforma, calculado no plano. O custo real do dia da demonstração, lido no Cost Explorer pela tag `project=00-plataforma-agentes` depois de 48 horas, também fica ≤ esse teto.
3. **Destroy sem sobras.** Depois do destroy, a busca por recursos com a tag `project=00-plataforma-agentes` (Resource Groups Tagging API) devolve zero, e não sobra parâmetro SSM sob `/00-plataforma-agentes/`.

Fontes oficiais que orientam o desenho (detalhe na seção "Proveniência"):
- AWS Prescriptive Guidance, *Building an internal developer platform on AWS*: caminhos padrão como capacidade central da plataforma.
- AWS Machine Learning Blog, *Building an agentic AI platform on Amazon Bedrock AgentCore*: modelo federado, com a plataforma publicando interfaces versionadas e os times de produto consumindo.
- Página de preços do Amazon Bedrock AgentCore: Gateway, Policy, Identity, Observability e Evaluations cobrados por uso, sem taxa fixa.

## Termos
- **Produto:** projeto de `harness/estado.json` com tipo `arquitetura` ou `ia-aplicada` que chama o Claude ou expõe tools na AWS.
- **Alvo:** conjunto de tools de um produto registrado no gateway. O nome do alvo começa pela chave do produto (D-029). No gateway, a ação de cada tool se chama `<alvo>___<tool>`.
- **Classe da tool:** rótulo obrigatório, declarado pelo produto, de cada tool registrada. Os valores são `dado_privado`, `conteudo_nao_confiavel`, `canal_saida` e `sensivel`; uma tool pode ter mais de um. Os três primeiros são as pernas da tríade letal.
- **Ação sensível:** tool com a classe `sensivel`. É uma ação que muda estado fora do agente ou que não se desfaz (gravar, enviar, agendar, pagar).
- **Demonstração:** apply, roteiro de demonstração, gravação e destroy no mesmo dia (D-021).
- **Contrato v1:** o conjunto de interfaces publicado pela plataforma (RF-007).

## Histórias de usuário
- **H1.** Como dono do repositório, quero criar um produto novo com um comando e vê-lo passar pelos mesmos gates de todos, para não reconfigurar a esteira a cada disciplina.
  - **Dado** um projeto criado por `novo_projeto.py`, **quando** abro o PR, **então** rodam os gates SDD, o CI do harness, a esteira de segurança e o FinOps sem nenhuma edição em `.github/workflows/` além dos arquivos gerados pelo próprio comando.
- **H2.** Como agente de um produto, quero chamar tools só pelo gateway da plataforma, com uma política que limite o que posso fazer, para que uma injeção de prompt não vire ação indevida.
  - **Dado** um pedido de tool fora da política do produto, **quando** o agente chama o gateway, **então** a resposta tem `isError: true`, o alvo não é invocado e a métrica `DenyDecisions` soma 1.
- **H3.** Como dono, quero que cada chamada ao Claude seja atribuída ao produto que a fez, para comparar o custo com o teto diário.
  - **Dado** um produto com perfil de inferência de aplicação, **quando** ele chama o modelo, **então** o custo aparece no Cost Explorer agrupado pela tag `project` do produto. Isso exige a tag de alocação de custo ativa pelo menos 48 horas antes da demonstração (D-034, resposta à P00-P4).
- **H4.** Como avaliador, quero traces e métricas por produto e evals depois da demonstração, para decidir mudanças de prompt e de arquitetura com dados.
  - **Dado** uma demonstração concluída, **quando** abro o relatório da fase verificar, **então** ele traz, por produto, a contagem de decisões de política (permitidas e negadas), as intervenções de guardrail, os ids de trace da sessão e a nota de cada avaliador da avaliação sob demanda (RF-006).

## Requisitos funcionais
Cada requisito traz o critério de aceite e como ele é verificado. Na coluna de verificação: **TT** = `terraform test` com mock provider e asserts no plan; **RG** = teste com respostas gravadas (D-006); **FL** = integração no Floci; **DM** = evidência da demonstração real.

- **RF-001: gateway MCP único.** A plataforma DEVE expor um único AgentCore Gateway, com protocolo MCP, onde cada produto registra os seus alvos. O contrato v1 aceita alvos do tipo Lambda e do tipo servidor MCP, que cobrem os dois candidatos a primeiro consumidor (P00-P3). Outros tipos entram como versão menor do contrato.
  - **Aceite:** dado o catálogo de produtos da plataforma com dois produtos sintéticos, quando o plan é gerado, então existe exatamente um gateway, todo alvo tem nome iniciado pela chave do seu produto e cada tool tem pelo menos uma classe. (TT, FL)
  - **Aceite:** um produto não consegue criar, alterar nem remover alvo de outro produto. O caminho de registro mantém o alvo e a política do produto revisados no mesmo PR; o mecanismo é decidido no plano. (TT)
- **RF-002: política por produto, negando por padrão.** A plataforma DEVE anexar ao gateway um motor do AgentCore Policy, com políticas Cedar por produto, em modo `ENFORCE`.
  - **Aceite:** dado um principal de produto A, quando ele chama uma tool do produto B ou uma tool sem `permit` explícito, então a chamada é negada. A negação por padrão e a regra de que `forbid` vence `permit` são do serviço, não de código nosso. (TT para a política gerada; RG para o comportamento; DM para a negação real)
  - **Aceite:** o modo do motor é `ENFORCE` por padrão. `LOG_ONLY` só existe com uma variável explícita de calibração, e o workflow de apply da demonstração recusa esse valor. (TT)
  - **Aceite:** em `tools/list`, o principal só vê as tools que a política dele pode permitir. (DM)
- **RF-003: identidade sem segredo.** A plataforma DEVE autenticar os agentes no gateway por IAM (SigV4), com a role do produto.
  - Na política, o principal é `AgentCore::IamEntity`, identificado pelo ARN da role.
  - Na saída, para alvos da AWS, o gateway usa a role de execução dele. Para alvo fora da AWS que exija credencial, a credencial fica num provedor de credenciais do AgentCore Identity, nunca no Terraform, no prompt ou em variável de ambiente em texto.
  - **Aceite:** o tipo de autorizador do gateway é IAM; os tipos `NONE` e `AUTHENTICATE_ONLY` reprovam o teste. (TT)
  - **Aceite:** a varredura do gitleaks e um teste de plan não encontram credencial em variável, output, tag ou parâmetro SSM. (TT, esteira)
  - **Aceite:** uma role sem `bedrock-agentcore:InvokeGateway` no ARN do gateway recebe erro de autenticação. (FL, se o Floci avaliar IAM; senão DM)
- **RF-004: guardrail na camada do modelo.** A plataforma DEVE criar um guardrail do Bedrock por produto, a partir de uma base comum, e publicar o id e uma versão numerada (nunca `DRAFT`) no contrato. A base comum tem:
  - filtros de conteúdo `HATE`, `INSULTS`, `SEXUAL`, `VIOLENCE` e `MISCONDUCT` em força `HIGH` na entrada e na saída;
  - filtro de ataque de prompt (`PROMPT_ATTACK`) em força `HIGH` na entrada; o serviço não oferece esse filtro na saída;
  - informação sensível: credenciais (como `AWS_ACCESS_KEY` e as demais do catálogo oficial, listadas no plano) bloqueadas na entrada e na saída; CPF e CNPJ por regex, mascarados na saída;
  - camada `STANDARD`, porque a `CLASSIC` não atende português;
  - mensagens de bloqueio fixas, em português, sem ecoar o conteúdo bloqueado.

  Os tópicos negados vêm da spec de cada produto, porque são decisão de produto; a base não tem tópico negado.
  - **Aceite:** o plan de cada guardrail tem as cinco categorias de conteúdo em `HIGH` nos dois sentidos, ataque de prompt em `HIGH` na entrada, as regex de CPF e CNPJ e a camada `STANDARD`. (TT)
  - **Aceite:** dada uma chamada `Converse` com o guardrail do produto, quando a entrada tem uma injeção, então o `stopReason` é `guardrail_intervened` e o produto classifica o resultado como `guardrail_entrada` (RF-011). (RG)
- **RF-005: perfil de inferência por produto.** A plataforma DEVE criar, para cada produto que chama o Claude, um perfil de inferência de aplicação, com as tags `project=<chave do produto>`, `module` e `managed-by=terraform`. A origem do perfil é um perfil entre regiões do sistema ou um modelo, e o modelo de cada produto vem do plano do produto.
  - **Aceite:** existe um perfil por produto do catálogo que chama o Claude, com a tag `project` igual à chave do produto, e a role do produto só pode invocar o próprio perfil. (TT)
  - **Aceite:** no dia seguinte à demonstração, o Cost Explorer mostra o custo de inferência agrupado pela tag `project` do produto. (DM; depende de P00-P4)
- **RF-006: observabilidade e evals por uso.** A plataforma DEVE:
  - entregar os logs de aplicação do gateway no grupo `/aws/vendedlogs/bedrock-agentcore/gateway/APPLICATION_LOGS/{gateway_id}`;
  - ligar o tracing do gateway, com os spans no grupo `aws/spans`;
  - publicar as métricas do gateway e do motor de política no namespace `AWS/Bedrock-AgentCore`;
  - atribuir cada evento a um produto pelo prefixo do alvo no nome da tool e pela tag do perfil de inferência;
  - rodar, depois da demonstração, uma avaliação **sob demanda** do AgentCore Evaluations sobre os traces da sessão, com avaliadores nativos (pelo menos `Builtin.Helpfulness`; os demais são escolhidos no plano entre os da documentação).

  O gate de CI continua sendo o das respostas gravadas (D-006); a avaliação na AWS é evidência da demonstração, não gate.
  - **Aceite:** os recursos de entrega de logs e de traces existem no plan, com retenção de 7 dias nos grupos de log criados pela plataforma, e são removidos no destroy. (TT)
  - **Aceite:** o relatório da demonstração tem, por produto: `AllowDecisions`, `DenyDecisions`, intervenções de guardrail, pelo menos um id de trace e a nota de cada avaliador. Esses números são tirados antes do destroy. (DM)
- **RF-007: contrato de interfaces versionado.** A plataforma DEVE publicar as interfaces num contrato versionado, para os produtos consumirem sem copiar valores à mão.
  - **Nome:** `contrato-plataforma`, versão maior `v1` no caminho e versão completa `1.MENOR.CORRECAO` no campo `versao_contrato`.
  - **Onde:** parâmetros SSM da camada padrão (sem custo adicional, até 4 KB cada):
    - `/00-plataforma-agentes/contrato/v1/comum`: região, ARN e URL MCP do gateway, id do motor de política, versões de MCP aceitas pelo gateway (confirmadas no plano), grupos de log e o mapa de erros do RF-011;
    - `/00-plataforma-agentes/contrato/v1/produtos/<chave>`: para cada produto, o ARN do perfil de inferência, o id e a versão do guardrail, o nome dos alvos e o ARN da role que a política reconhece.
  - **Formato:** JSON validado por um JSON Schema versionado junto com o código da plataforma. O mesmo objeto sai como output `contrato_v1` do Terraform, para os testes.
  - **Mudanças:** campo novo sobe a versão menor. Remover, renomear ou mudar o sentido de um campo é mudança de versão maior: o `v2` é publicado ao lado do `v1`, que só sai quando nenhum produto de `harness/estado.json` o consome.
  - **Consumo:** o produto lê o parâmetro com o data source `aws_ssm_parameter`. Não usa `terraform_remote_state`, para não precisar de leitura do state inteiro da plataforma.
  - **Aceite:** o output `contrato_v1` passa no JSON Schema, cada parâmetro tem ≤ 4 KB, e nenhum campo tem nome ou valor de segredo. (TT)
  - **Aceite:** um produto sintético de teste lê o contrato do SSM do Floci e monta a chamada sem nenhum valor escrito à mão. (FL)
- **RF-008: mesmo ciclo dos produtos.** A plataforma DEVE subir e descer pelo mesmo ciclo dos produtos: apply com prazo, e destroy automático em até 24 horas (D-021, D-024), pelos workflows `00-plataforma-agentes-apply.yml` e `00-plataforma-agentes-destroy.yml`.
  - **Aceite:** o `estado.py validar` aprova os dois workflows, e o teste do harness que compara os workflows com os modelos passa. (CI do harness)
  - **Aceite:** o prazo de um produto consumidor nunca passa do prazo da plataforma, e, quando os dois vencem juntos, o destroy dos produtos roda antes do da plataforma. O mecanismo é decidido no plano. (teste do harness)
  - **Aceite:** o destroy termina com a verificação de sobras pela tag `project` em zero. (DM)
- **RF-009: tríade letal bloqueada na configuração.** A plataforma DEVE recusar uma configuração em que um mesmo principal de produto tenha `permit` para tools que, somadas, cubram `dado_privado`, `conteudo_nao_confiavel` e `canal_saida`. Um produto que precise das três se divide em agentes com roles separadas.
  - **Aceite:** um catálogo sintético com um principal que cobre as três classes faz o `terraform plan` falhar por validação, com mensagem que cita o principal e as tools. (TT)
- **RF-010: guardrail na camada de tools.** A política DEVE aplicar checagens do Bedrock Guardrails dentro do AgentCore Policy:
  - ataque de prompt (`JAILBREAK`, `PROMPT_INJECTION`, `PROMPT_LEAKAGE`) na entrada de toda tool, com `forbid` quando a confiança for maior que 0,4;
  - informação sensível na entrada das tools `canal_saida`, com `forbid` quando a confiança for maior que 0,2, para impedir exfiltração;
  - os limiares são os padrões da documentação. Mudar um limiar exige calibração em `LOG_ONLY` e ADR.

  Conteúdo de tool `conteudo_nao_confiavel` passa por checagem de ataque de prompt antes de entrar no contexto do modelo. Isso é necessário porque o guardrail do modelo não avalia resultados de tool. O mecanismo (efeito `suppressOutput` no gateway ou `ApplyGuardrail` no produto) é decidido no plano, porque a documentação consultada não confirma ataque de prompt em `context.output` (incerto).

  O **roteiro de demonstração** que prova a plataforma tem: uma chamada permitida, uma negada por falta de política, uma negada pelo guardrail da camada de tools e uma entrada bloqueada pelo guardrail do modelo.
  - **Aceite:** as políticas geradas têm as cláusulas `forbid` acima, com os limiares acima. (TT)
  - **Aceite:** os quatro passos do roteiro passam com respostas gravadas (RG) e aparecem nas métricas da demonstração (DM).
- **RF-011: erros estruturados.** O contrato DEVE publicar o mapa que leva cada resposta do gateway e do guardrail a uma categoria, com indicação de retentável:

  | categoria | origem | retentável | o que o produto faz |
  |---|---|---|---|
  | `politica_negada` | `isError: true` com `AuthorizeActionException` | não | informa o usuário; não tenta de novo |
  | `requer_aprovacao_humana` | negação de tool `sensivel` (RF-012) | não | escala para humano (handoff) |
  | `guardrail_entrada` | `stopReason: guardrail_intervened` com ação `BLOCKED` | não | responde com a mensagem de bloqueio |
  | `guardrail_saida` | saída suprimida ou bloqueada | não | responde com a mensagem de bloqueio |
  | `autenticacao` | 4xx de autorização do gateway | não | falha a sessão e alarma |
  | `limite_taxa` | 429 (`Throttles`) | sim | até 3 tentativas, espera exponencial de 1, 2 e 4 s |
  | `falha_transitoria` | 5xx (`SystemErrors`) | sim | até 3 tentativas, depois escala com o erro propagado |
  | `erro_desconhecido` | qualquer `isError: true` sem regra no mapa | não | trata como negação (falha fechada) |

  Mascaramento (`ANONYMIZED` no trace) não é erro: a resposta segue mascarada.
  - **Aceite:** com uma resposta gravada para cada linha da tabela, o classificador do agente de exemplo devolve a categoria e o retentável esperados. Um texto de erro inédito cai em `erro_desconhecido`. (RG)
  - **Aceite:** o trace do guardrail tem valores sem máscara, então o agente de exemplo não grava esse trace em log de aplicação. (RG)
- **RF-012: ação sensível com handoff para humano.** Tool `sensivel` DEVE ser negada ao principal do agente. Só a role de aprovação do produto, acionada depois de uma aprovação humana fora do modelo, recebe `permit`. Um campo de aprovação dentro dos argumentos da tool não vale, porque o modelo pode forjá-lo.
  - **Aceite:** na política gerada, nenhuma tool `sensivel` tem `permit` para a role do agente. (TT)
  - **Aceite:** o agente de exemplo, ao receber a negação de uma tool `sensivel`, para o loop e devolve `requer_aprovacao_humana` com o nome da tool e o motivo. (RG)

## Requisitos não funcionais
- **RNF-001** (segurança, Art. IV):
  - **Nada público:** o gateway só aceita chamadas assinadas por IAM; nenhum recurso tem política com `Principal: "*"` sem condição de conta.
  - **Criptografia:** em repouso com KMS nos recursos que aceitam chave (logs, SNS, parâmetros do contrato quando o tipo exigir); em trânsito só TLS. O tipo de chave (do cliente ou gerenciada pela AWS) e o custo dela vão para o plano, com ADR.
  - **Menor privilégio:** a role do produto só invoca o gateway e o próprio perfil de inferência e só lê o próprio parâmetro de produto e o `comum`. Nenhuma ação `*` em recurso `*`.
  - **Isolamento:** prefixo e tag `project` com ABAC (D-029). O compartilhamento entre produtos existe só no gateway e no motor de política, e a separação ali é feita pelo Cedar (RF-002).
  - **Tríade letal:** RF-009, RF-010 e RF-012.
  - **Aceite:** checkov e tflint sem achado alto ou crítico; asserts de plan para cada item acima. (TT, esteira)
- **RNF-002** (custo, Art. V):
  - só serviços cobrados por uso, sem taxa fixa independente de uso (o Gateway cobra a indexação de tools por mês; o efeito disso num stack de um dia é calculado no plano);
  - teto = custo estimado de um dia de execução, calculado no plano e gravado em `teto_diario_usd`, no README e num AWS Budgets diário;
  - limite mensal da conta de US$ 20 (D-022);
  - avaliação sob demanda, não online, porque a amostragem contínua não agrega numa demonstração de um dia e é cobrada por token;
  - o teste de fumaça da plataforma na demonstração não chama o Claude: ele chama o gateway e o guardrail direto. O Claude real só roda no produto.
  - **Aceite:** Infracost do PR ≤ teto; Budgets diário e mensal no plan; nenhum recurso da lista de custo fixo ocioso da constituição sem ADR. (TT, esteira)
- **RNF-003** (operação, Art. VI):
  - tags `project=00-plataforma-agentes`, `module` em kebab e `managed-by=terraform` em todo recurso, a partir de `harness/modelos/tags.tftest.hcl` (D-031);
  - state remoto com lock;
  - README com no máximo 5 passos;
  - **alarmes**, todos com período de 5 minutos, 1 período de avaliação, estatística `Sum` e dado ausente tratado como "não violado" (fora da demonstração não há tráfego). Os limiares são contagens absolutas e não taxas, porque o volume de uma demonstração é de dezenas de chamadas e uma taxa ficaria ruidosa:

    | alarme | métrica (namespace `AWS/Bedrock-AgentCore`) | dispara quando | porquê |
    |---|---|---|---|
    | erro do gateway | `SystemErrors` do gateway | ≥ 1 | qualquer 5xx numa demonstração é defeito |
    | limite de taxa | `Throttles` do gateway | ≥ 1 | a demonstração não chega perto do limite; 429 indica loop |
    | erro de cliente | `UserErrors` do gateway | ≥ 3 | parâmetro ou autenticação errados em série |
    | erro do motor de política | `SystemErrors` do motor | ≥ 1 | falha na decisão de política |
    | negações de política | `DenyDecisions` | ≥ 5 | o roteiro prevê no máximo 2 negações; 5 indica loop ou tentativa de injeção |
    | intervenção do guardrail do modelo | métrica de intervenção do Bedrock Guardrails (nome confirmado no plano) | ≥ 5 | o roteiro prevê 1 bloqueio |

    Os alarmes publicam num tópico SNS criptografado. Quem recebe são os mesmos e-mails de `emails_alerta` do `infra/conta`, sem variável nova (D-034, resposta à P00-P5; mecanismo no ADR-0008 do plano).
  - **Aceite:** os seis alarmes existem no plan com esses parâmetros. (TT, FL se o Floci emular CloudWatch)
- **RNF-004** (conta, D-029): conta AWS única. Nada de Organizations, Control Tower ou serviço de governança com custo fixo. A conta com OIDC é criada quando o primeiro produto estiver pronto (P00-P2); até lá tudo roda com mock e Floci.
  - **Aceite:** o plan não tem recurso `aws_organizations_*` nem `aws_controltower_*`. (TT)
- **RNF-005** (modelos, D-028): os agentes de código não passam pela plataforma; eles usam a assinatura do dono. Na AWS rodam só a plataforma e os agentes dos produtos, durante as demonstrações.
  - **Aceite:** nenhum workflow de CI de código chama o Bedrock. (revisão do plano e grep nos workflows)
- **RNF-006** (região): `us-east-1`, padrão de `vars.AWS_REGION` nos modelos de workflow. É a região que aparece, nos anúncios consultados, para as três peças com cobertura regional mais estreita: Policy, guardrails dentro do Policy e Evaluations.
  - **Aceite:** o provider usa `var.regiao` com padrão `us-east-1`, e o plano confirma de novo a disponibilidade regional antes do primeiro apply real. (TT)
- **RNF-007** (testes, Art. III):
  - matriz regra → teste com cada RF e RNF; regra sem teste conta como falha;
  - integração no Floci só com o projeto completo, gerando relatório em `testing/reports/`;
  - lacunas do emulador marcadas só com evidência. Pela documentação do Floci consultada, o Gateway, os alvos e o Identity são emulados; o Policy guarda políticas de recurso, mas não há menção a avaliação Cedar; o Bedrock Guardrails está fora de escopo; o `CreateInferenceProfile` não é emulado; Observability e Evaluations não são citados. Essas partes são provadas por TT e RG no CI, e por DM na demonstração;
  - **Aceite:** a matriz está no plano e o relatório do Floci separa falha real de lacuna, com link para a evidência.
- **RNF-008** (proveniência e privacidade, Art. VIII): os logs de aplicação do gateway gravam o corpo das requisições e respostas MCP, e o trace do guardrail traz valores sem máscara. Por isso as demonstrações usam só dados sintéticos, e nenhum log, trace ou relatório publicado traz dado pessoal real.
  - **Aceite:** os dados do roteiro de demonstração são sintéticos e ficam versionados no repositório; a revisão do relatório antes da publicação confirma isso.

## Esclarecimentos
| id | ambiguidade | tipo | decisão | porquê (tarefas da prova) |
|---|---|---|---|---|
| E1 | O que é "alarme de erro" | técnica | seis alarmes com métrica, limiar e janela (RNF-003) | critério explícito e mensurável em vez de "alarmar erros" (4.1); contagem absoluta porque o volume é baixo; o alarme de negações sinaliza escalonamento (5.2) |
| E2 | Quais categorias o guardrail cobre | técnica | duas camadas: guardrail do modelo (RF-004) e checagens dentro do Policy na camada de tools (RF-010) | o guardrail do modelo não avalia resultados nem argumentos de tool, então a defesa contra injeção indireta precisa estar no gateway (1.4, 2.2, 5.2) |
| E3 | Tópicos negados na plataforma | do dono, decidida na spec de cada produto | a base não tem tópico negado; cada produto declara os seus na própria spec | tópico negado é decisão de produto (Art. II); um tópico da base podia barrar um produto legítimo, como o de regras de CDB da D03 |
| E4 | Output versionado do RF-007 | técnica | SSM padrão com JSON Schema, `v1` no caminho, sem `terraform_remote_state` | a HashiCorp recomenda publicar os dados num lugar separado em vez de ler o state; a role do produto não precisa ler o state inteiro (menor privilégio); contrato estável é interface de tool bem definida (2.1) |
| E5 | Como o agente se autentica | técnica | IAM SigV4 com a role do produto; Identity só para credencial de alvo fora da AWS | IAM não cria segredo, cabe no ABAC da D-029 e é aceito como principal no Cedar (`AgentCore::IamEntity`); JWT exigiria um provedor OAuth a mais (2.2, 2.4) |
| E6 | Modo do motor de política | técnica | `ENFORCE` na demonstração; `LOG_ONLY` só para calibrar, com ADR | gate programático só é gate se bloqueia (1.4); calibração com dados antes de mudar limiar (5.5) |
| E7 | Como a "ação sensível" chega ao humano | técnica | tool `sensivel` negada ao agente e liberada só à role de aprovação (RF-012) | um campo de aprovação no argumento poderia ser forjado por injeção; a decisão fica fora do modelo (1.4, 5.2) |
| E8 | Formato do erro que o produto recebe | técnica | mapa de categorias com retentável no contrato (RF-011) | o gateway devolve `isError: true` com texto, não um código; o produto precisa de categoria e de retentável para decidir entre tentar de novo e escalar (2.2, 5.3) |
| E9 | Evals online ou sob demanda | técnica | sob demanda, depois da demonstração | custo por token sem ganho numa sessão curta; o gate de CI segue nas respostas gravadas (4.6, 5.5, D-006) |
| E10 | Qual produto é o primeiro consumidor | do dono | D03, `03-mcp-regras-cdb`, alvo servidor MCP (D-034) | escolha de produto (Art. II); o contrato v1 continua aceitando os dois tipos de alvo |
| E11 | Configurações da conta AWS que a plataforma exige | do dono | caminho misto (D-034): tag `project` de alocação de custo e Transaction Search por Terraform em `infra/conta`, aplicado pelo dono; caso de uso da Anthropic à mão, pelo dono, se o modelo for anterior ao Claude Opus 4.7; tag ativa pelo menos 48 horas antes da demonstração | configuração da conta é do dono (CLAUDE.md) |
| E12 | Quem recebe os alarmes | do dono | os mesmos e-mails de `emails_alerta` do `infra/conta`, sem variável nova (D-034) | contato e valor de variável são do dono |
| E13 | Região | técnica | `us-east-1` (RNF-006) | já é o padrão dos modelos de workflow e aparece nos anúncios das três peças com cobertura regional mais estreita |
| E14 | Camada do guardrail | técnica | `STANDARD` | a `CLASSIC` atende só inglês, francês e espanhol, e os produtos falam português; a `STANDARD` usa inferência entre regiões. O suporte a português na `STANDARD` é confirmado no plano (incerto) |

## Componente Claude e tarefas da prova
A plataforma não tem agente de produto. Ela é a camada de governança dos agentes dos produtos e traz um **agente de exemplo** só para os testes, que exercita o contrato. Ele roda sempre com respostas gravadas, nunca contra o Claude real (D-006).

| tarefa | onde aparece |
|---|---|
| 1.1 | loop do agente de exemplo pelo `stopReason`: `tool_use` chama o gateway; `end_turn` encerra; `guardrail_intervened` para e classifica; limite de 10 turnos de tool por sessão |
| 1.4 | política nega por padrão em `ENFORCE`; ação sensível só com aprovação humana (RF-002, RF-012) |
| 2.1 e 2.4 | tools registradas como alvos do gateway, com classes e contrato versionado (RF-001, RF-007) |
| 2.2 e 5.3 | erros estruturados com categoria e retentável, e o motivo propagado ao produto (RF-011) |
| 4.6 e 5.5 | avaliação sob demanda e revisão humana do relatório com dados de observabilidade (RF-006) |
| 5.2 | escalonamento quando a política ou o guardrail bloqueiam (RF-011, RF-012) |
| 5.6 | proveniência dos fatos de serviço desta spec (seção abaixo) |

**Teste com respostas gravadas:** uma resposta gravada por linha da tabela do RF-011 e uma por passo do roteiro do RF-010.
- As respostas de negação de política e de chamada permitida seguem o formato publicado na documentação do Gateway com Policy.
- A de bloqueio do guardrail segue o formato do `Converse` com guardrail.
- Respostas cujo formato a documentação não mostra, como a saída suprimida, ficam marcadas `proveniencia: sintetica` e são trocadas pela captura real na primeira demonstração. Até lá, o classificador as trata pela regra de falha fechada (`erro_desconhecido`).

## Proveniência (consulta em 2026-11-19)
| afirmação | fonte | data da fonte | certeza |
|---|---|---|---|
| O gateway aceita autorização de entrada JWT, IAM, só autenticação e nenhuma; a documentação desaconselha "nenhuma" em produção | [Set up inbound authorization for your gateway](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-inbound-auth.html) | sem data (página viva) | confirmado |
| O motor de política nega por padrão, `forbid` vence `permit`, e o principal IAM é `AgentCore::IamEntity` com o ARN da role | [Core concepts (AgentCore Policy)](https://docs.aws.amazon.com/de_de/bedrock-agentcore/latest/devguide/policy-core-concepts.html) | sem data | confirmado |
| O Policy está em GA, em 13 regiões, com políticas em linguagem natural convertidas para Cedar | [Policy in Amazon Bedrock AgentCore is now generally available](https://aws.amazon.com/about-aws/whats-new/2026/03/policy-amazon-bedrock-agentcore-generally-available) | 2026-03-03 | confirmado |
| O Bedrock Guardrails dentro do Policy avalia entradas de alvos e saídas de ações autorizadas, em us-east-1 e mais quatro regiões | [Amazon Bedrock AgentCore now supports Bedrock Guardrails in policy](https://aws.amazon.com/about-aws/whats-new/2026/06/amazon-bedrock-agentcore-policy-guardrails-generally-available) | 2026-06-17 | confirmado |
| Guardrails no Policy: tipos ContentFilter, PromptAttack e SensitiveInformation (sem tópicos negados); limiares padrão de 0,2, 0,4 e 0,2; `suppressOutput` lê só `context.output` | [Guardrails in policies](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-guardrails-in-policies.html) | sem data | confirmado; ataque de prompt sobre `context.output`: incerto |
| Negação de política volta como `isError: true` com `AuthorizeActionException`; `tools/list` é filtrado pela política | [Use a AgentCore Gateway with AgentCore Policy](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/use-gateway-with-policy.html) | sem data | confirmado |
| Métricas do gateway (`Invocations`, `Throttles`, `SystemErrors`, `UserErrors`, `Latency`) no namespace `AWS/Bedrock-AgentCore`; grupo de log padrão; os logs de aplicação não trazem decisões de política | [Gateway metrics and logs](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-gateway-metrics.html) | sem data | confirmado |
| Métricas do Policy `AllowDecisions`, `DenyDecisions` e `NoDeterminingPolicies`, com as dimensões `Mode` (`LOG_ONLY`, `ENFORCE`) e `Category` | [Policy observability data](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-policy-metrics.html) | sem data | confirmado |
| O tracing do gateway exige Transaction Search do CloudWatch, ligado uma vez | [Add observability to your AgentCore resources](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-configure.html) | sem data | confirmado |
| Evaluations em GA, com 13 avaliadores nativos, avaliação online e sob demanda e uso em CI, em 9 regiões, incluindo us-east-1 | [AgentCore Evaluations is now generally available](https://aws.amazon.com/about-aws/whats-new/2026/03/agentcore-evaluations-generally-available) | 2026-03-31 | confirmado; nomes dos avaliadores além de `Builtin.Helpfulness`: confirmar no plano |
| Os preços do AgentCore não têm taxa fixa; a indexação de tools é cobrada por 100 tools por mês; Observability segue o preço do CloudWatch | [Amazon Bedrock AgentCore pricing](https://aws.amazon.com/bedrock/agentcore/pricing/) | sem data | confirmado |
| Categorias do filtro de conteúdo e demais políticas do guardrail; ataque de prompt inclui jailbreak, injeção e vazamento | [Create your guardrail](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-components.html) | sem data | confirmado |
| O filtro de ataque de prompt só tem configuração de entrada e não avalia resultados de tool | [Detect prompt attacks](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-prompt-attack.html) | sem data | confirmado |
| No `Converse`, o guardrail não avalia resultados, definições nem argumentos de tool; o `stopReason` é `guardrail_intervened`; o trace traz valores sem máscara | [Include a guardrail with the Converse API](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-use-converse-api.html) | sem data | confirmado |
| A camada `CLASSIC` atende inglês, francês e espanhol; a `STANDARD` usa inferência entre regiões | [Safeguard tiers for guardrails policies](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-tiers.html) | sem data | confirmado; português na `STANDARD`: incerto |
| O perfil de inferência de aplicação aceita tags para alocação de custo | [Create an application inference profile](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-create.html) e [anúncio de 2024-11-01](https://aws.amazon.com/about-aws/whats-new/2024/11/amazon-bedrock-cost-allocation-tags-inference-profiles) | 2024-11-01 | confirmado |
| A tag de alocação de custo leva até 24 horas para aparecer e mais até 24 horas para ativar; a API é `UpdateCostAllocationTagsStatus` | [Activating user-defined cost allocation tags](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/activating-tags.html) | sem data | confirmado |
| Modelos Anthropic anteriores ao Claude Opus 4.7 exigem o envio do caso de uso uma vez por conta | [Access Amazon Bedrock foundation models](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) | sem data | confirmado |
| Parâmetro SSM padrão: sem custo adicional, até 4 KB e 10.000 por conta e região | [Managing parameter tiers](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-advanced-parameters.html) | sem data | confirmado |
| A HashiCorp recomenda publicar dados para consumo externo num lugar separado (SSM é um dos listados) em vez de ler o state remoto | [The terraform_remote_state Data Source](https://developer.hashicorp.com/terraform/language/state/remote-state-data) | sem data | confirmado |
| Floci: Gateway, alvos e Identity emulados; Policy só como política de recurso; Runtime sem execução real | [Floci: Bedrock AgentCore](https://floci.io/floci/services/bedrock-agentcore/) | sem data | confirmado; avaliação Cedar: não citada |
| Floci: `Converse` com resposta fixa ou proxy; Guardrails fora de escopo; `CreateInferenceProfile` não descrito | [Floci: Bedrock Runtime](https://floci.io/floci/services/bedrock-runtime/) | sem data | confirmado |
| Métrica de intervenção do Bedrock Guardrails no CloudWatch | não verificada nesta fase | — | incerto: o nome é confirmado no plano |

## Fora de escopo
- **Memória de longo prazo compartilhada (AgentCore Memory):** entra no produto que precisar, como o assistente da D02.
- **Gateway de inferência sempre ligado e Langfuse hospedado:** têm custo fixo. O Langfuse é decisão pendente do dono na D02.
- **Multi-conta:** Organizations e Control Tower ficam fora (D-029).
- **Pacote npx do harness:** só depois da versão estável e testada (D-027).
- **Agentes de código rodando na AWS** (D-028).
- **Avaliação online contínua,** autorização de entrada por JWT ou Cognito, tópicos negados na base do guardrail e várias regiões (E5, E9, E3, RNF-006).

## Decisões do dono que esta spec usa
D-021, D-022, D-024, D-025, D-027, D-028, D-029, D-031, D-033, D-034 e a resposta à P00-P2; e D-030 (delegada: componentes da plataforma).

## Perguntas ao dono
Nenhuma pergunta aberta. As perguntas P00-P1 a P00-P5 já foram respondidas e estão na seção seguinte, fora da tabela de perguntas, para o coletor não as levar de novo ao board.

## Perguntas respondidas
| id | pergunta | resposta |
|---|---|---|
| P00-P3 | Qual produto é o primeiro consumidor da plataforma na demonstração real? | **Respondida, D-034 (dono, 2026-11-19):** a D03, MCP de regras do CDB (alvo servidor MCP), como recomendado. A versão de MCP aceita pelo gateway contra a lane de compatibilidade da D03 fica como risco no plano. |
| P00-P4 | Como aplicar as configurações da conta que a plataforma exige (tag `project` de alocação de custo, Transaction Search, caso de uso da Anthropic)? | **Respondida, D-034 (dono, 2026-11-19):** o caminho misto, como recomendado. A tag e o Transaction Search vão por Terraform em `infra/conta`, aplicado pelo dono; o caso de uso vai à mão, pelo dono, no console, se o modelo for anterior ao Claude Opus 4.7. A tag precisa estar ativa pelo menos 48 horas antes da demonstração. |
| P00-P5 | Quem recebe os alarmes da plataforma (tópico SNS)? | **Respondida, D-034 (dono, 2026-11-19):** os mesmos e-mails de `emails_alerta` do `infra/conta`, sem variável nova, como recomendado. O mecanismo está no ADR-0008 do plano. |
| P00-P1 | Dentro de um plano SDD aprovado, a orquestração pode delegar cada tarefa ao especialista sem pedir aprovação a cada disparo? | **Respondida (D-033):** sim, nas fases tarefas, analisar, implementar e verificar de um plano aprovado e registrado. O gate `sdd-analisar`, o merge e a publicação continuam com o dono. |
| P00-P2 | Conta AWS com OIDC para o primeiro deploy real da plataforma: criar agora ou quando o primeiro produto estiver pronto? | **Respondida pelo dono (2026-11-19):** a conta com OIDC será criada quando o primeiro produto estiver pronto. O desenvolvimento e o Floci seguem sem conta. |
