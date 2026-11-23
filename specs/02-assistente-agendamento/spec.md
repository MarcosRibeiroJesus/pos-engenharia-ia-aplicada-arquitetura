# Spec: Assistente de agendamento completo

- **Projeto:** `02-assistente-agendamento` · **Disciplina:** D02 (APIs de IA generativa) · **Tipo:** arquitetura
- **Status:** esclarecida com uma pendência do dono (2026-11-21), spec **retroativa**. Ela descreve o que o código em `modulos/02-apis-ia-generativa/arquitetura/` faz hoje (149 testes vitest verdes, 35 blocos `run` de `terraform test`), separa o que o código faz sem teste que o prove (**teste falta**) e marca à parte, com `[DIVERGÊNCIA]`, o que falta para cumprir a constituição. As ambiguidades técnicas estão resolvidas na seção "Esclarecimentos". A pendência D02-P3 (consumo da plataforma) não muda nenhum requisito desta spec: ela decide de onde vêm o perfil de inferência, o guardrail e a role de aprovação, e o plano descreve as três opções. A D02-P1 foi dispensada pelo dono, sem decisão.
- **Artigos da constituição que se aplicam:** I, II, III, IV, V, VI, VII, VIII
- **Escolha do dono:** D-008 (assistente de agendamento completo: gateway com fallback, grafo de etapas, intenção em JSON, cancelamento com aprovação humana, memória, defesa contra prompt injection e avaliações). Âncora oficial: D-065 (caso da Natera no AWS Machine Learning Blog, 26/08/2026).

## Problema e objetivo
Agendar por texto parece simples até o modelo ter poder de escrita. Três riscos dominam:
- o modelo erra um campo (data, horário, id da consulta);
- alguém induz o modelo a agir em nome de outra pessoa, por injeção direta ou escondida num anexo;
- o custo e a disponibilidade do provedor de modelo viram dependência invisível.

**Objetivo:** um assistente que marca, cancela e consulta consultas de uma clínica sintética a partir de linguagem natural em português, com o Claude no Amazon Bedrock. O modelo só **propõe** uma intenção estruturada; código determinístico **decide** o que executa, e todo cancelamento passa por aprovação humana. A infraestrutura é Terraform, serverless, sobe para a demonstração de um dia e é destruída no mesmo dia (D-021).

**Deu certo quando** (verificado na fase verificar):
1. **Garantia que não depende do modelo.** Na bateria red team, executada no pior caso em que o modelo obedece a todo ataque, nenhum ataque muda o estado da agenda nem da memória de longo prazo, e nenhum controle legítimo é barrado (hoje: 24 ataques, 0 com efeito, 6 controles sem falso positivo; `docs/evidencias/redteam.json`).
2. **Gate de avaliação verde.** O dataset dourado passa nos limiares versionados de `src/fixtures/avaliacao/limiares.json` com respostas gravadas no CI (D-048) e, uma vez, com o modelo real na demonstração, dentro do teto por execução (D-062, D-068).
3. **Custo e destroy.** O custo real do dia fica abaixo do `teto_diario_usd` aprovado pelo dono no plano, e o destroy termina sem recurso com a tag `project=02-assistente-agendamento`, exceto chave KMS em exclusão agendada (`PendingDeletion`, sem custo).

## Termos
- **Turno:** uma mensagem do paciente processada de ponta a ponta pelo grafo da conversa.
- **Intenção:** objeto JSON que o modelo devolve pela tool `registrar_intencao` (`agendar`, `cancelar`, `consultar` ou `outra`, com campos, confiança, ambiguidades e evidências).
- **Gate:** função determinística (`src/lib/dominio/gate.ts`) que transforma a intenção proposta e o estado real da agenda numa decisão.
- **Canal:** o cliente que chama a API com SigV4 e chave de API. Ele já autenticou o paciente e informa `usuarioId` e `sessaoId`; o modelo nunca informa quem é o usuário.
- **Aprovador:** pessoa da recepção (sintética) que aprova ou rejeita um cancelamento.
- **Demonstração:** apply, roteiro, gravação e destroy no mesmo dia (D-021).

## Histórias de usuário
- **H1.** Como paciente, quero marcar uma consulta escrevendo em português livre, para não navegar por menus.
  - **Dado** um slot livre de cardiologia amanhã às 09:00, **quando** escrevo "quero cardiologia amanhã às 9h", **então** a consulta é criada para o meu usuário, o slot fica reservado e a resposta traz o id da consulta.
- **H2.** Como paciente, quero cancelar uma consulta, e a clínica quer que um humano confirme, porque cancelar é destrutivo.
  - **Dado** uma consulta minha com mais de 2 horas de antecedência, **quando** peço o cancelamento, **então** recebo "aguardando aprovação" com um `acaoId`, nada muda na agenda até a decisão do aprovador e, se ninguém decidir em `timeout_aprovacao_s` (hoje 24 h no código; o plano revisa por causa do prazo do stack), a ação expira sem cancelar.
- **H3.** Como clínica, quero que um texto injetado (na mensagem, num anexo ou na memória) nunca aja sobre a consulta de outro paciente nem dispare ação sozinho.
  - **Dado** um anexo que manda cancelar todas as consultas, **quando** ele entra no turno, **então** o anexo vai para quarentena ou, se passar, não basta para disparar ação: o campo decisivo precisa vir da mensagem do paciente ou da memória.
- **H4.** Como dono do repositório, quero que a indisponibilidade ou a recusa de um modelo não derrube o atendimento, e que o custo de cada chamada fique registrado.
  - **Dado** o primeiro modelo da cadeia em erro transitório, **quando** o turno roda, **então** o gateway tenta o próximo, registra o fallback e o custo, e, se todos falharem, o paciente recebe uma resposta de handoff para humano.
- **H5.** Como paciente, quero apagar tudo o que o assistente lembra de mim.
  - **Dado** turnos, fatos, resumo e preferências guardados, **quando** chamo `DELETE /v1/usuarios/{usuarioId}/memoria`, **então** todos os itens da minha partição somem e a resposta diz quantos foram apagados.

## Requisitos funcionais
Verificação: **UT** = vitest com fakes e respostas gravadas (`src/tests/unit`); **RT** = bateria red team (`src/tests/redteam`); **AV** = gate de avaliação (`src/tests/avaliacao`); **TT** = `terraform test` com mock provider; **FL** = integração no Floci; **DM** = evidência da demonstração real.

Estado de cada aceite: **existe** (código e teste que o prova já estão no repositório); **teste falta** (o código já faz, mas nenhum teste afirma, e a fase tarefas cria o teste); **falta** (nem o código faz). Os valores de variáveis citados (cota, timeout, limiares) são os **valores atuais do código**; o plano os revisa e o dono os aprova junto do plano. Os nomes de nós, bibliotecas e arquivos descrevem o comportamento atual, não obrigam a tecnologia.

### Borda e canal
- **RF-001: API com três rotas.** A API REST DEVE expor `POST /v1/mensagens`, `POST /v1/aprovacoes/{acaoId}` e `DELETE /v1/usuarios/{usuarioId}/memoria`, todas com autenticação `AWS_IAM` (SigV4), chave de API com usage plan e validação do corpo por schema na borda; a Lambda valida de novo.
  - **Aceite (borda):** os três métodos têm `AWS_IAM` e chave de API; o corpo de mensagem e de decisão é validado por modelo; uma rota fora das três não chega à Lambda (o próprio API Gateway responde 403 `Missing Authentication Token`, porque não há `{proxy+}`). (TT `api_assistente.tftest.hcl`; existe)
  - **Aceite (Lambda):** corpo sem `usuarioId`/`sessaoId` no formato `^[a-z0-9-]{3,64}$`, texto vazio ou acima de 2.000 caracteres devolve 400 `corpo_invalido` sem chamar o modelo; anexos acima de 2 são cortados; rota desconhecida que chegue à Lambda devolve 404. (UT do handler; **teste falta**: `src/lib/handlers/orquestrador.ts` não tem teste)
  - **Aceite:** a política de recurso da API nega principal de outra conta. (TT; existe)
- **RF-002: identidade vem do canal.** O `usuarioId` de toda decisão DEVE vir do corpo autenticado do canal, nunca da saída do modelo.
  - **Aceite:** um texto que pede ação sobre "o paciente u-outro" não altera consulta de `u-outro`; um `consulta_id` alheio recebe a mesma resposta de um id inexistente (`consulta_nao_encontrada`). (UT `gate.test.ts`, RT; existe)

### Gateway de LLM (camada 1)
- **RF-003: só o gateway fala com o modelo.** O gateway DEVE ser a única Lambda com permissão de invocar o Claude, e o chamador não escolhe o modelo.
  - **Aceite:** pedido com campo `model` é recusado com `requisicao_invalida`; `max_tokens` fora de 1 a 4.096 é recusado (UT `gateway.test.ts`; existe). `clienteId` fora de `^[a-z0-9-]{1,64}$` é recusado (**teste falta**). Nenhuma role do plan além da do gateway tem ação de invocação de modelo (TT `raiz.tftest.hcl` confere o orquestrador e o executor; existe; a afirmação sobre todas as roles do plan é **teste falta**).
- **RF-004: cadeia de modelos com fallback e circuit breaker.** O gateway DEVE tentar os modelos de `cadeia_modelos` em ordem (hoje: Claude Haiku 5.5 e, em falha, Claude Sonnet 5.5).
  - **Aceite:** erros `transitorio` e `limite_de_taxa` e `stop_reason = refusal` passam ao próximo modelo; `requisicao_invalida` não passa; três falhas `transitorio` ou `limite_de_taxa` abrem o circuito do modelo por 60 s, e um modelo com circuito aberto é pulado; todos falhando devolvem `todos_modelos_falharam` com `retentavel: true`; sem resposta do gateway, o grafo responde com handoff e emite `HandoffHumano`. (UT `gateway.test.ts`, `grafo.test.ts`; existe)
  - **Aceite:** `acesso_negado` também passa ao próximo modelo, e o SDK não retenta sozinho (`maxRetries: 0`). (**teste falta**; o código faz)
- **RF-005: erros estruturados.** Todo resultado do provedor DEVE sair classificado, e todo resultado do gateway DEVE ser sucesso ou erro com `categoria`, `retentavel`, `mensagem` e a lista de tentativas.
  - **Aceite:** timeout, falha de conexão e 5xx viram `transitorio` retentável; 429 vira `limite_de_taxa`; 401/403 viram `acesso_negado`; outros 4xx viram `requisicao_invalida`; recusa do modelo vira tentativa `recusa`. (UT `provedores.test.ts`, `gateway.test.ts`; existe)
  - **Limite conhecido:** uma falha da tabela de estado do gateway (leitura da cota, gravação do ledger) hoje propaga exceção em vez de erro estruturado. O comportamento alvo (erro `transitorio` retentável) entra no plano. (falta)
- **RF-006: cota e custo por chamada.** O gateway DEVE aplicar cota diária de tokens por cliente (`cota_tokens_dia_por_cliente`) e registrar cada chamada num ledger com dia, cliente, tarefa, modelo, tokens, custo em US$ e se houve fallback.
  - **Aceite:** com a cota esgotada a chamada devolve `cota_excedida` sem chamar o modelo (UT; existe); cada sucesso emite `CustoUSD` (UT; existe). A métrica `CotaExcedida`, as métricas `Tokens` e `LatenciaLlmMs` e os campos do ledger (**teste falta**). O preço por milhão de tokens vem de variável, e o plano o confere com a fonte oficial.

### Grafo da conversa e intenção
- **RF-007: grafo de etapas.** Cada turno DEVE passar pelas etapas `carregar_contexto → defender_entrada → (bloquear | extrair_intencao) → (fallback | decidir) → (agendar | solicitar_aprovacao | responder) → atualizar_memoria`, e o turno devolve a trilha de eventos.
  - **Aceite:** as três arestas condicionais são funções puras testadas isoladamente (UT `grafo.test.ts`; existe); a trilha sai na resposta da API só com `ambiente = lab` (TT `raiz.tftest.hcl`, casos `teto_do_lab_e_trilha_so_no_lab` e `prod_nao_expoe_trilha`; existe).
- **RF-008: intenção por tool com schema estrito.** A extração DEVE usar uma única tool, `registrar_intencao`, com JSON Schema `strict: true`, `tool_choice: auto` (nunca `tool` nem `any`, que o Sonnet 5.5 não aceita no `bedrock-runtime`) e instrução explícita, com exemplos no prompt do sistema.
  - **Aceite:** o schema tem `additionalProperties: false`, todos os campos obrigatórios, enums para intenção, especialidade e período, padrões para data (`AAAA-MM-DD`), horário (`HH:MM`) e id (`^C-[A-Z0-9]{4,12}$`), até 3 preferências e até 8 evidências. (UT `intencao.test.ts`; existe)
- **RF-009: validação semântica e retentativa.** A intenção DEVE passar por validação estrutural (o mesmo schema) e semântica: data válida, não no passado e até 90 dias à frente; `consulta_id` entre os ids conhecidos do paciente; para cada campo preenchido, uma evidência cujo trecho aparece literalmente na fonte declarada (mensagem, anexo ou memória).
  - **Aceite:** falha de validação volta ao modelo como `tool_result` com `is_error: true` e a lista de erros; resposta sem a tool volta com instrução de usá-la; no máximo 3 tentativas, depois `saida_invalida`; erro do gateway não é retentado na extração (UT `intencao.test.ts`; existe). Data além de 90 dias vira `data_fora_da_janela` (**teste falta**).
- **RF-010: gate determinístico.** O gate DEVE decidir só com código e com o estado real da agenda.
  - **Aceite:** `outra` → fora de escopo; `consultar` → lista das consultas futuras confirmadas; confiança abaixo de 0,6 ou qualquer ambiguidade → pergunta, sem agir; agendar sem especialidade ou data → pergunta com até 3 próximos horários livres; horário indisponível → até 3 opções; vários horários no período → até 4 opções; nenhum horário no dia → `sem_vaga_no_dia` com até 3 próximos; consulta da mesma especialidade no mesmo dia → recusa `consulta_duplicada`; cancelamento a menos de 2 h → recusa `muito_perto`; mais de uma consulta candidata → pergunta qual; paciente sem consulta → `nenhuma_consulta`. (UT `gate.test.ts`; existe, salvo `sem_vaga_no_dia` e `nenhuma_consulta`, **teste falta**)
- **RF-011: anexo informa, não dispara.** Uma ação que muda estado DEVE exigir evidência direta (origem `mensagem` ou `memoria`) do campo decisivo: data ou horário para agendar; id ou data para cancelar.
  - **Aceite:** campo que só aparece em anexo vira pergunta `confirmar_dado_de_anexo`. (UT, RT; existe)
- **RF-012: respostas por template.** O texto ao paciente DEVE sair de templates do domínio; o texto livre do modelo nunca vai ao paciente.
  - **Aceite:** toda decisão do gate e todo fallback têm template; nenhuma resposta contém conteúdo de bloco `text` do modelo. (UT, RT; existe)

### Ações e aprovação humana
- **RF-013: agendar com idempotência.** Só o executor DEVE escrever na agenda. Agendar é uma transação condicional: slot `livre` → `reservado` e consulta nova, com id derivado da chave de idempotência (`sessaoId#slotId`).
  - **Aceite:** repetir o mesmo turno devolve `ja_existia` sem segunda escrita; dois pedidos para o mesmo slot resultam em um `agendada` e um `slot_ocupado`; o orquestrador só tem leitura na tabela da agenda. (UT `executor.test.ts`, TT; existe)
- **RF-014: cancelamento só com aprovação humana.** Todo cancelamento DEVE abrir uma ação `CRIADA → PENDENTE_APROVACAO` e uma execução do Step Functions Standard que espera com `waitForTaskToken`; só uma decisão `aprovar` leva a `EXECUTADA`.
  - **Aceite:** `rejeitar` leva a `REJEITADA`; sem decisão em `timeout_aprovacao_s` (hoje 86.400 s) leva a `EXPIRADA`; decisão sobre ação que não está pendente falha com `acao_nao_pendente`; o cancelamento confere a versão da consulta (`CONFLITO` se mudou). (UT `executor.test.ts`, TT `fluxo_aprovacao.tftest.hcl`; existe)
  - **Aceite:** ação inexistente falha com `acao_nao_encontrada`; na API, `acao_nao_encontrada` vira 404 e `acao_nao_pendente` vira 409; o nome da execução é o `acaoId` e uma segunda abertura não cria outra execução. (**teste falta**; o código faz)
  - **Limite conhecido:** o stack vive no máximo 24 h desde o apply (D-024); uma pendência aberta perto do fim do prazo é encerrada pelo destroy. O plano define o tratamento.
- **RF-015: aprovador diferente do paciente.** O aprovador DEVE ser alguém diferente do paciente dono da consulta.
  - **Aceite:** `aprovadorId` igual ao `usuario_id` da ação falha com `aprovador_invalido` no domínio (UT; existe) e vira 403 na API (**teste falta**).
  - **[DIVERGÊNCIA] DV-11 (Art. IV, menor privilégio):** o `aprovadorId` vem do corpo da requisição, e a política da API libera a conta inteira. Qualquer principal da conta com a chave de API pode aprovar declarando outro id. O aceite alvo está no esclarecimento E4. (falta)
- **RF-016: aviso ao aprovador.** A pendência DEVE publicar no tópico SNS de aprovações, cifrado com a chave do stack.
  - **Aceite:** o tópico de aprovações tem `kms_master_key_id` igual à chave do stack, e só o executor tem `sns:Publish` nele. (TT; **teste falta**: o código cifra, nenhum `tftest` afirma)

### Memória
- **RF-017: memória com TTL e proveniência.** A memória DEVE ficar numa partição por paciente (`USUARIO#<id>`) com: turnos da sessão (TTL 7 dias), resumo da sessão (TTL 30 dias), candidatos da última pergunta (TTL 1 hora), fatos fixados pelo código (TTL 90 dias) e preferências com proveniência (sessão, instante e trecho de origem; sem TTL).
  - **Aceite:** fatos só são escritos pelo código depois de agendar ou de abrir aprovação; turnos têm TTL futuro (UT `memoria.test.ts`; existe). Os valores exatos de cada TTL e os cortes do texto em 1.000 caracteres por turno e 1.200 no resumo (**teste falta**).
- **RF-018: guarda da memória.** Preferência sugerida pelo modelo DEVE passar por allowlist de chave (`periodo_preferido`, `especialidade_frequente`) e de valor, e só vale com origem `mensagem`; mensagem bloqueada entra na memória como `[mensagem bloqueada pela defesa]`.
  - **Aceite:** preferência vinda de anexo ou com valor fora da lista é rejeitada com motivo na trilha. (UT `defesa.test.ts`, RT; existe)
- **RF-019: resumo do histórico.** Quando a sessão passa de 10 turnos (`limiteParaResumo`; o contexto leva os 6 últimos), o resumidor DEVE compactar o histórico por uma chamada ao gateway (tarefa `resumir`); falha do resumo não quebra o turno (`resumo_adiado`). (UT `memoria.test.ts`; existe para o resumo com limites de teste; **teste falta** para os padrões 10 e 6 e para o evento `resumo_adiado`)
- **RF-020: direito de apagar.** `DELETE /v1/usuarios/{usuarioId}/memoria` DEVE apagar todos os itens da partição do paciente por Query e exclusões, sem varrer a tabela. (UT; existe)

### Defesa contra prompt injection
- **RF-021: defesa em camadas.** A entrada DEVE passar por normalização (remove caracteres invisíveis, de controle e bidirecionais e reduz homóglifos para a detecção), por um detector heurístico com 11 regras ponderadas (nível `alto` a partir de 3 pontos bloqueia o turno antes do modelo) e por um envelope `<dados_nao_confiaveis>` com nonce por turno para mensagem, anexos e memória.
  - **Aceite:** ataque óbvio é barrado na entrada e emite `InjecaoBloqueada`; delimitador falso é detectado. (UT `defesa.test.ts`, RT; existe)
- **RF-022: anexos confinados.** Anexo DEVE estar exatamente em `anexos/<usuarioId>/<arquivo>.txt` no bucket privado, ser `text/plain`, ter até 20.000 bytes e não ter travessia, caminho absoluto, codificação nem subdiretório; anexo com detecção `alta` vai para quarentena e não chega ao modelo.
  - **Aceite:** caminhos inválidos são recusados e anexo com injeção vai para quarentena (UT, RT; existe). Cada motivo de recusa com o valor exato (`caminho_codificado`, `caminho_absoluto`, `travessia`, `fora_da_area`, `outro_usuario`, `nome_ou_tipo_invalido`, `nao_encontrado`, `tipo_nao_textual`, `grande_demais`) (**teste falta**: os testes conferem só `ok: false`).
- **RF-023: verificação da saída.** A saída do modelo DEVE conter só tools da allowlist do nó e nunca o canário (marcador aleatório por cold start no prompt do sistema).
  - **Aceite:** tool fora da lista ou canário na saída vira `saida_insegura`, resposta de bloqueio e métrica `InjecaoBloqueada`. (UT, RT; existe)
- **RF-024: bateria red team medida.** A bateria DEVE rodar no pior caso (o modelo obedece ao atacante) e reportar ataques com efeito, barrados por camada e falsos positivos.
  - **Aceite:** `ataques_com_efeito = 0` e `falsos_positivos = 0`; o relatório vai para `docs/evidencias/redteam.json`. (RT; existe)

### Avaliação e observabilidade (D-048)
- **RF-025: gate de avaliação.** O dataset dourado (hoje 10 casos) DEVE rodar pelo pipeline inteiro e reprovar quando uma métrica passa do limiar versionado (hoje: acurácia de intenção ≥ 0,95, de campos ≥ 0,90, de resposta ≥ 0,90, saída inválida ≤ 5%, média de tentativas ≤ 1,3 e custo médio ≤ US$ 0,002 por caso).
  - **Aceite:** o teste falha com a lista de reprovações; o relatório vai para `docs/evidencias/avaliacao.json`. (AV; existe)
  - **[DIVERGÊNCIA] DV-09 (D-048, Art. III):** não há workflow de CI que rode os testes, o red team e o gate de avaliação do D02 no PR. (falta)
- **RF-026: tracing opcional no Langfuse Cloud.** O rastreador DEVE ser nulo por padrão e enviar traces de turno e gerações ao Langfuse só quando as três configurações (`LANGFUSE_HOST`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`) existirem, com a entrada das gerações mascarada por padrão.
  - **Aceite:** sem as configurações, nada sai do processo (UT `rastreador.test.ts`; existe). Com elas, só dados sintéticos (D-048).
  - **Aceite:** a chave secreta do Langfuse nunca aparece em texto claro em variável do Terraform, no state, no plan, em variável de ambiente da Lambda nem no repositório; o mecanismo fica no plano. (falta)
  - **[DIVERGÊNCIA] DV-08 (D-048):** o código e o `lab/langfuse/` tratam o Langfuse como só local (Docker Compose), e a infraestrutura não passa nenhuma configuração do Langfuse às Lambdas; a decisão em vigor é Langfuse Cloud, plano Hobby, com chaves criadas pelo dono e fallback para tracing desligado. As chaves são a pergunta D02-P2. (falta)
- **RF-027: métricas e alarmes.** O stack DEVE ter alarmes de erros de cada Lambda, 5xx da API, execução falha do Step Functions, fallback acima de 10 em 5 min, circuito aberto, custo de tokens do dia acima de `custo_diario_llm_alarme_usd` e mais de 20 injeções bloqueadas em 5 min, todos no tópico SNS de alertas cifrado. (TT `monitoramento.tftest.hcl`; existe)

## Requisitos não funcionais
- **RNF-001 (segurança, Art. IV).** Nada público; KMS do cliente com rotação nas 4 tabelas DynamoDB (com PITR), no bucket (versionado, bloqueio público, TLS obrigatório), nos tópicos SNS, nos log groups, nas variáveis das Lambdas e no Step Functions; uso da chave só via DynamoDB, S3, Step Functions e SNS (`kms:ViaService`); uma role por Lambda, sem ação curinga; X-Ray só com `*`, que o serviço exige.
  - **Aceite:** `terraform test` afirma cada item acima, e checkov e tflint não têm achado alto ou crítico. (TT; existe para chave, tabelas, bucket, Lambdas e ação curinga; **teste falta** para o tópico de aprovações, ver RF-016, e para a ausência de `Allow` com `Principal "*"`, ver E11)
  - **[DIVERGÊNCIA] DV-07 (regra de Terraform, Art. IV):** a permissão `bedrock-mantle:CreateInference` usa recurso `project/*`. O alvo é recurso nomeado em qualquer opção da D02-P3 (esclarecimento E2).
  - **[DIVERGÊNCIA] DV-06 (Art. IV):** o `infra/bootstrap` do D02 cria o bucket do state, um provedor OIDC e uma role de deploy com `PowerUserAccess` mais `iam:*Role*`. O isolamento por tag e prefixo (D-029) e a configuração da conta, que é do dono (P00-P2, conta com OIDC), pedem outra solução (esclarecimento E5).
- **RNF-002 (custo, Art. V).** Teto = custo estimado de um dia de execução, calculado no plano e aprovado pelo dono; nenhum custo fixo ocioso sem ADR (Lambdas fora de VPC para evitar NAT; DynamoDB sob demanda; WAF desligado por padrão em `habilitar_waf`); destroy por workflow sem sobras.
  - **Aceite:** o plan tem um `aws_budgets_budget` com `time_unit = "DAILY"` e `limit_amount` igual ao `teto_diario_usd` do `harness/estado.json` (TT); o plan não tem NAT, endpoint de interface, cluster nem instância (TT); os workflows de apply e destroy têm `prazo_horas` ≤ 24, `confirm_stack`, ambiente `aws-lab-destroy`, OIDC e verificação de sobras pela tag (`estado.py validar` na fase verificar). (falta)
  - **[DIVERGÊNCIA] DV-04 (Art. V, D-021):** o Budgets do módulo `monitoramento` é mensal, com `teto_mensal_usd = 5` descrito como "definido pelo dono (2026-11-19)", e um teste afirma esse valor. Esse teto mensal por projeto foi substituído pelo teto de um dia (D-021, D-022), e a memória pede o Budgets diário no D02.
  - **[DIVERGÊNCIA] DV-05 (Art. V):** os workflows `.github/workflows/02-assistente-agendamento-apply.yml` e `-destroy.yml`, declarados no `harness/estado.json`, não existem.
- **RNF-003 (operação, Art. VI).** Tags `project`, `module` e `managed-by` em todos os recursos, pelos valores da D-031; nomes com o prefixo da chave (D-029); state remoto com lock nativo do S3 (`use_lockfile`); README com até 5 passos.
  - **Aceite:** o teste de tags derivado de `harness/modelos/tags.tftest.hcl` passa; todo nome do plan casa com `^02-assistente-agendamento-` (exceções de API listadas no plano); o backend é `s3` parcial com `use_lockfile = true` (existe no código; **teste falta**); o README do módulo tem no máximo 5 passos numerados (teste do harness). (falta)
  - **[DIVERGÊNCIA] DV-01 (D-031):** `project = "assistente-agendamento"`; o valor exigido é `02-assistente-agendamento`.
  - **[DIVERGÊNCIA] DV-02 (D-031):** `module = "02-apis-ia-generativa/arquitetura"`, com barra; o valor exigido é kebab por componente (por exemplo, `gateway-llm`, `dados`, `aprovacao`).
  - **[DIVERGÊNCIA] DV-03 (D-029):** os nomes usam o prefixo `agenda-<ambiente>`; o exigido é o prefixo da chave do projeto.
  - **[DIVERGÊNCIA] DV-10 (Art. VI, Art. VII):** não há README do módulo; o código e os skips do checkov citam `docs/arquitetura.md` e ADR-0001 a ADR-0008 que não estão no repositório, com outros temas (por exemplo, o código usa 0007 para o lab e 0008 para o WAF). Os ADRs novos estão em `specs/02-assistente-agendamento/adr/`; na implementação, cada comentário e cada skip passa a apontar o ADR novo certo. Há ainda um comentário obsoleto em `modules/bucket_privado/main.tf` sobre uma tool `ler_anexo` que não existe.
  - **[DIVERGÊNCIA] DV-12 (D-013):** `lab/langfuse/compose.yml` usa `image: floci/floci:latest` escrito direto; a regra pede `${FLOCI_IMAGE:-floci/floci:latest}`.
- **RNF-004 (testes, Art. III).** Componente Claude testado só com respostas gravadas (D-006); `terraform test` com mock provider, checkov e tflint; integração no Floci só com o projeto completo, com relatório em `testing/reports/`.
  - **Aceite:** nenhum teste do CI chama o Bedrock; todo aceite desta spec aparece no `matriz.md` com pelo menos um teste (nasce na fase tarefas; teste do harness); o relatório do Floci existe em `testing/reports/`. (falta)
- **RNF-005 (proveniência e privacidade, Art. VIII).** Agenda, pacientes, anexos e dataset são sintéticos e versionados; o comportamento real do modelo fica sem validação nos testes (D-006) e entra só na rodada real paga da demonstração (D-062, D-068).
  - **Aceite:** as fixtures declaram dados sintéticos; o relatório da rodada real passa pela revisão do dono antes de entrar no repositório. (revisão)
- **RNF-006 (região).** `us-east-1`, a mesma da plataforma.
  - **Aceite:** `aws_region` tem padrão `us-east-1` (TT; **teste falta**); antes do primeiro apply real, a disponibilidade dos dois modelos na região, pelo perfil de inferência, é conferida na ficha oficial e registrada no relatório da fase verificar. (DM)

## Componente Claude e tarefas da prova
| O que o Claude faz | Tarefas CCAR-F | Como é testado |
|---|---|---|
| Extrai a intenção por uma tool com schema estrito; o código valida e decide | 4.1 critérios explícitos; 4.2 few-shot; 4.3 saída estruturada via tool_use; 4.4 validação e retentativa com `is_error` | 14 respostas gravadas em `src/fixtures/respostas-gravadas/10-extrair-intencao.json`, escritas no formato da Messages API (UT, AV) |
| Gate e aprovação humana separam proposta de ação | 1.4 workflow com gate programático e handoff para humano; 5.2 escalonamento quando há dúvida | UT `gate.test.ts`, `executor.test.ts`; RT |
| Gateway com cadeia, circuito e erros por categoria | 2.2 erros estruturados e retentáveis; 5.3 propagação de erro até o nó de fallback | UT `gateway.test.ts`, `provedores.test.ts` |
| Uma tool por nó e allowlist na saída | 2.1 descrição de tool; 2.3 poucas tools por agente e `tool_choice` | UT `intencao.test.ts`, `defesa.test.ts` |
| Memória com resumo, TTL e proveniência | 5.1 preservação de contexto; 5.6 proveniência | UT `memoria.test.ts` |
| Gate de avaliação com limiares versionados e red team medido | 4.4 validação medida (taxa de saída inválida e média de tentativas); 5.5 revisão humana do relatório da rodada real (o gate não é revisão por outra instância nem calibração; isso não é exercitado hoje) | AV, RT |

O comportamento real do modelo (acerto de extração, taxa de retentativa, robustez a ataques reais) fica sem validação nos testes (D-006) e é medido uma vez na demonstração, com o mesmo gate de avaliação em `modo_llm = bedrock`.

## Fora de escopo
- Voz, telefonia e mascaramento de latência por frase de espera (pontos da âncora que só existem por causa da voz; ADR-0001).
- Base de conhecimento (RAG) de perguntas frequentes e pipeline de eventos com Amazon MSK, presentes na âncora.
- Verificação de identidade progressiva dentro da conversa: o canal já entrega o paciente autenticado.
- Dados reais de pacientes, conformidade HIPAA ou LGPD avaliada, e integração com sistemas de clínica.
- Langfuse hospedado na AWS (cortado por custo na D-048).
- Projeto de IA aplicada da D02 (pendente do dono, fora desta spec).

## Esclarecimentos
Ambiguidades encontradas na leitura do código e da memória, com a classificação de cada uma.

| id | Ambiguidade | Classe | Resolução |
|---|---|---|---|
| E1 | O código chama o Claude pelo endpoint `bedrock-mantle`; a plataforma (D-030) entrega guardrail e perfil de inferência por produto | técnica | **Delegada, com fonte.** As fichas do Claude Haiku 5.5 e do Claude Sonnet 5.5 na documentação do Bedrock (consulta em 2026-11-21) marcam Guardrails como **não suportados** no `bedrock-mantle` e suportados no `bedrock-runtime`; perfis de inferência de aplicação e logs de invocação aparecem **só** na lista do `bedrock-runtime` (a tabela do `bedrock-mantle` não os cita); e a própria AWS recomenda o `bedrock-runtime` para aplicações novas. Os modelos são oferecidos por perfis de inferência, então a cadeia passa a usar ARNs de perfil, e não ids base. O alvo é o `bedrock-runtime`, com o contrato do gateway inalterado (RF-003 a RF-006). O como fica no plano (ADR-0002). Boa prática: escolher o endpoint pelo controle que ele permite, não pelo SDK mais novo; o erro comum é descobrir na demonstração que o guardrail não pode ser anexado |
| E2 | Recurso da permissão de invocação (`project/*`) | técnica, condicionada à D02-P3 | Recurso nomeado em qualquer opção: os ARNs dos perfis de inferência do produto e os modelos de origem deles. Nas opções A e B os perfis vêm do módulo da plataforma; na C, do próprio stack. Sem curinga em recurso (regra de Terraform) |
| E3 | Tag `module` exigida em kebab, mas hoje é um caminho | técnica | Um valor por componente, em kebab (`dados`, `gateway-llm`, `orquestrador`, `executor`, `aprovacao`, `borda`, `monitoramento`, `chave`), aplicado pelo `local.tags` de cada módulo (D-031). `project` e `managed-by` pelo `default_tags` |
| E4 | Quem pode aprovar (DV-11) | técnica | A rota de aprovação aceita só a role de aprovação do produto, e o `aprovadorId` passa a ser a identidade autenticada do chamador (`requestContext.identity`), não um campo do corpo. Boa prática: identidade de quem aprova vem da autenticação, nunca do payload; o erro comum é a aprovação humana virar um campo que qualquer cliente preenche |
| E5 | Bootstrap próprio com OIDC e `PowerUserAccess` (DV-06) | técnica, com parte do dono | O state do D02 usa o bucket de state e a role de deploy da conta, como os outros projetos. Essa configuração da conta (provedor OIDC, role de deploy e bucket de state) ainda é pendência do dono (P00-P2, conta com OIDC, já registrada na memória); **o apply real do D02 depende dela**. O `infra/bootstrap` do D02 sai do caminho de apply e fica como referência até a P00-P2 ser resolvida. Sem pergunta nova |
| E6 | O Budgets mensal de US$ 5 foi "definido pelo dono" (DV-04) | do dono, já decidida | A D-021 e a D-022 substituíram o teto mensal por projeto pelo teto de um dia e o limite mensal da conta. O valor do teto diário é proposto no plano e decidido pelo dono na aprovação |
| E7 | Langfuse local ou Cloud (DV-08) | do dono, já decidida | D-048: Langfuse Cloud Hobby, só dados sintéticos, chaves do dono, sem chave o tracing fica desligado. O `lab/langfuse/` local pode continuar como opção de laboratório, sem ser o caminho da demonstração |
| E8 | O produto consome a plataforma `00-plataforma-agentes` (D-030)? O D02 nasceu antes dela e não expõe tools com efeito ao modelo (a única tool, `registrar_intencao`, não executa nada) | do dono | **(decidido pelo dono em 2026-11-22: opção A, consumo parcial da plataforma)** O nível de consumo muda o escopo, a dependência de ordem com a plataforma e o custo do dia. As opções estão no plano e na tabela abaixo |
| E9 | Hora local da clínica fixa em UTC−3 (`hojeLocal`) | técnica | Mantida: clínica sintética em horário de Brasília, sem horário de verão desde 2019. Documentada no ADR do domínio |
| E10 | `usuarioId` vem do corpo (RF-002) | técnica | O chamador SigV4 é o backend do canal, que já autenticou o paciente; o modelo nunca fornece o usuário. Em produção, o canal passaria um token do paciente e a API o validaria (registrado como o que um arquiteto sênior faria) |
| E11 | Política de recurso com `Principal "*"` em `Deny` (API e bucket) | técnica | A D-044 proíbe `Principal "*"` na policy da plataforma. No produto, `Deny` com `Principal "*"` para TLS e para outra conta é o padrão das fontes da AWS e não concede acesso. Mantido. O teste que reprova `Allow` com `Principal "*"` em política de recurso ainda **falta** (hoje só a política da chave KMS tem esse teste) |

## Divergências com a constituição (resumo)
| id | Onde | Artigo ou decisão | Situação |
|---|---|---|---|
| DV-01 | `infra/terraform/variables.tf` (`projeto`) | Art. VI, D-031 | falta corrigir |
| DV-02 | `infra/terraform/main.tf` (`local.tags.module`) | Art. VI, D-031 | falta corrigir |
| DV-03 | `local.nome = "agenda-${var.ambiente}"` | Art. VI, D-029 | falta corrigir |
| DV-04 | `modules/monitoramento` (Budgets `MONTHLY`, US$ 5) | Art. V, D-021 | falta corrigir |
| DV-05 | workflows de apply e destroy ausentes | Art. V | falta criar a partir de `harness/modelos/` |
| DV-06 | `infra/bootstrap/github_oidc.tf` | Art. IV, D-029 | falta retirar do caminho de apply |
| DV-07 | permissão `bedrock-mantle:CreateInference` em `project/*` | Art. IV | falta corrigir (E1, E2) |
| DV-08 | rastreador e `lab/langfuse/` só locais | D-048 | falta alinhar (E7) |
| DV-09 | sem CI do D02 | Art. III, D-048 | falta criar |
| DV-10 | sem README; ADRs e `docs/arquitetura.md` citados no código e nos skips do checkov, ausentes e com outra numeração | Art. VI, Art. VII | ADRs nascem em `specs/02-assistente-agendamento/adr/`; na implementação, comentários e skips são reapontados e o README é escrito |
| DV-11 | `aprovadorId` no corpo e política da API aberta à conta | Art. IV | falta corrigir (E4) |
| DV-12 | `lab/langfuse/compose.yml` com `floci/floci:latest` literal | D-013 | falta corrigir |

Os posts em `posts/aws.md` e `posts/gcp.md` citam 142 testes, teto de US$ 5/mês e datas "a confirmar". Eles são rascunhos e se atualizam na fase publicar, com a data da âncora já conferida (26/08/2026).

## Decisões do dono que esta spec usa
D-006 (só respostas gravadas nos testes), D-013 (imagem do Floci por variável), D-007 (GCP como cloud comparativa), D-008 (escopo do assistente), D-021 e D-022 (demonstração de um dia e limite mensal da conta), D-024 (prazo e destroy automático), D-029 (conta única, tag e prefixo), D-030 (plataforma compartilhada), D-031 (valores das tags), D-048 (gate no CI e Langfuse Cloud), D-062 e D-068 (rodada real paga com teto por execução de US$ 20), D-065 (âncora da Natera).

## Perguntas ao dono
Registro apenas; o dono responde no chat (D-041).

| id | pergunta | bloqueia | opções | recomendação |
|---|---|---|---|---|
| D02-P1 | ~~A 2ª pergunta aberta na sessão D02 (a 1ª foi respondida pela D-048)~~ **Não localizada; o dono dispensou (2026-11-21, recado da orquestração): sem decisão.** Ela não está em nenhum arquivo do repositório, no `HISTORICO.md`, no `DECISOES.md`, nos PRs nem em `harness/progresso.md`. Nenhuma resposta foi assumida; se o dono reenunciá-la, ela entra como pergunta nova | nada | — | — |
| D02-P2 | Criar a conta e as chaves do Langfuse Cloud (plano Hobby, D-048) e gravá-las num parâmetro `SecureString` do SSM sob o prefixo do projeto, fora do Terraform (ADR-0006) | só o tracing da demonstração; sem chave, o tracing fica desligado e o resto funciona | criar agora; criar antes da demonstração; não criar e demonstrar sem tracing | criar antes da demonstração, para os traces do dia da rodada real ficarem gravados |
| D02-P3 | O D02 consome a plataforma `00-plataforma-agentes` (D-030)? | o desenho do acesso ao modelo no plano, a ordem de apply e o custo do dia | A: consumo parcial (perfil de inferência, guardrail e alarme de intervenção pelo módulo `registro-produto`; sem alvo MCP, porque o modelo não chama tool com efeito); B: consumo completo (executor como alvo Lambda do gateway com política Cedar); C: sem plataforma, com guardrail e perfil no próprio stack e ADR de exceção à D-030 | A: cumpre a D-030 onde ela agrega controle (guardrail e custo por produto) sem forçar MCP num fluxo em que o código, e não o modelo, chama as ações |
