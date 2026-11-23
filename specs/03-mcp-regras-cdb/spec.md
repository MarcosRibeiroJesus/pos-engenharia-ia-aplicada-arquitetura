# Spec: MCP de regras do CDB com liquidez diária

- **Projeto:** `03-mcp-regras-cdb` · **Disciplina:** D03 (Model Context Protocol) · **Tipo:** arquitetura
- **Status:** esclarecida (2026-11-22), com as decisões do dono D03-P1, D03-P2, D03-P4, D03-P5, D03-P6, D03-P9 e D03-P10 respondidas e aplicadas (D-071) e a lane 2025-11-25 registrada (D-072). Todas as perguntas (D03-P1 a D03-P11) respondidas pelo dono (D-071, D-072 e D-073); teto diário aprovado em US$ 0,50 com cota de 300.000 tokens (D03-P7 = A).
- **Spec retroativa sem código:** o `harness/estado.json` marca `retroativo: true` com a nota "Pouca implementação antes do SDD", mas **não existe código da D03 no repositório**. Não há `modulos/03-mcp/` no `main` nem neste branch, e os workflows declarados em `apply_workflow` e `destroy_workflow` não existem. O único artefato da D03 no git é `modulos/03-mcp/OPCOES.md`, no branch `modulo/03-mcp/opcoes` (PR #6 de opções, rascunho), que é proposta de opções, não implementação. Por isso esta spec **não descreve comportamento atual**: os requisitos nascem do contrato da plataforma `00-plataforma-agentes`, das decisões do dono e da âncora. Não há seção "teste falta", porque não há código a testar.
- **Artigos da constituição que se aplicam:** I, II, III, IV, V, VI, VII, VIII
- **Escolha do dono:** D-008 (MCP de regras do produto sintético CDB com liquidez diária), com a opção R4 registrada nas decisões de 2026-11-19 em `docs/curso/REVISAO-OPCOES-D01-D04.md` (registro de regras com proveniência, MCP somente leitura e agente interno que cita a fonte). D-011 (MCP 2026-07-28 sem estado, com lane de compatibilidade). D-034 (D03 é o primeiro consumidor da plataforma). Âncora: D-065.

## Problema e objetivo
Num banco, quem atende o cliente precisa responder perguntas como "se eu resgatar hoje, quanto recebo?" ou "por que paguei IOF?". As regras que respondem isso (percentual do CDI, IR regressivo, IOF nos primeiros 30 dias, limites, carência) mudam com a lei e com o produto. Quando ficam espalhadas em planilhas, prompts ou na memória de quem atende, ninguém sabe dizer **qual regra, qual versão, vigente desde quando e de que fonte**. Um modelo de linguagem que calcula imposto de cabeça piora o problema: erra contas e inventa regra com confiança.

**Objetivo:** um servidor MCP sem estado (versão 2026-07-28; os detalhes do protocolo estão na seção "Proveniência", como indício a conferir no plano, E1) que expõe as regras de um CDB **sintético** com liquidez diária como dados versionados com fonte pública e data, e tools determinísticas que fazem as contas. Um agente de atendimento com o Claude no Amazon Bedrock consome essas tools **só pelo gateway MCP da plataforma** `00-plataforma-agentes`, com política Cedar, guardrail e perfil de inferência do produto. O modelo **não calcula regra**: ele chama a tool, explica o resultado e cita o id, a versão e a fonte da regra aplicada. A infraestrutura sobe para a demonstração de um dia e é destruída no mesmo dia (D-021).

**Deu certo quando** (verificado na fase verificar):
1. **Respostas com proveniência.** No roteiro de demonstração, toda resposta do agente que traz um número (rendimento, IOF, IR, valor líquido, limite) cita pelo menos um par `id@versao` de regra que a tool devolveu, e nenhum número da resposta deixa de aparecer no resultado de uma tool do mesmo turno. Medido com respostas gravadas no CI (RG) e uma vez com o modelo real na demonstração (DM).
2. **Contas certas.** A bateria de casos de cálculo (`simular_resgate` e `verificar_aporte`), com valores esperados calculados à mão e versionados, passa sem nenhuma diferença acima de R$ 0,00 depois do arredondamento declarado (E7).
3. **Plataforma provada pelo primeiro consumidor.** O roteiro de quatro passos do RF-010 da plataforma passa pelo contrato v1, sem ARN da plataforma escrito à mão no código ou no Terraform da D03 (critério de sucesso 1 da spec da plataforma).
4. **Custo e destroy.** O custo real do dia fica abaixo do `teto_diario_usd` aprovado pelo dono no plano, e o destroy termina sem recurso com a tag `project=03-mcp-regras-cdb`, exceto chave KMS com exclusão agendada (`PendingDeletion`, sem custo), se o plano criar uma.

## Termos
- **CDB:** Certificado de Depósito Bancário. Aqui, um produto **sintético**: não existe emissor, banco ou cliente real.
- **Liquidez diária:** o cliente pode resgatar em qualquer dia útil depois da carência, se houver.
- **Regra:** registro versionado com `id`, `versao`, `tema`, vigência (`vigente_desde`, `vigente_ate`), parâmetros, fonte e certeza (RF-013).
- **Regra pública:** vem de legislação ou regulação (Receita Federal, Planalto, Banco Central, CMN, B3, ANBIMA). **Regra do produto:** parâmetro do CDB sintético, decidido pelo dono (D03-P5); a fonte dela é "produto sintético", com a data da decisão.
- **Tool determinística:** tool MCP cujo resultado depende só dos argumentos e das regras vigentes, sem chamar modelo.
- **Lane de compatibilidade:** o caminho que atende clientes MCP de versões anteriores à 2026-07-28 (D-011).
- **Gateway, alvo, classe da tool, contrato v1:** como definidos na spec da plataforma (`specs/00-plataforma-agentes/spec.md`, seção "Termos").
- **Demonstração:** apply, roteiro, gravação e destroy no mesmo dia (D-021).

## Histórias de usuário
- **H1.** Como atendente (sintético) do banco, quero perguntar ao agente quanto um cliente recebe num resgate, para responder sem fazer a conta na mão.
  - **Dado** uma aplicação sintética de R$ 10.000,00 feita há 15 dias corridos, **quando** pergunto "quanto ele recebe se resgatar hoje?", **então** o agente chama `simular_resgate`, responde com rendimento bruto, IOF, IR e valor líquido iguais aos da tool, e cita as regras de IOF e de IR com `id@versao`, fonte e data.
- **H2.** Como atendente, quero saber por que um aporte foi recusado, para explicar o motivo ao cliente.
  - **Dado** o aporte mínimo do produto, **quando** pergunto se um aporte abaixo dele é aceito, **então** a tool devolve `elegivel: false` com o motivo e a regra de limite (`id@versao`), e o agente explica sem tratar isso como falha técnica.
- **H3.** Como responsável pelo produto, quero que toda regra tenha fonte e data e que a incerteza apareça, para nunca servir uma regra não conferida como se fosse certa.
  - **Dado** uma regra com `certeza: a_confirmar`, **quando** ela é usada num cálculo, **então** o resultado da tool marca a incerteza, e o agente diz ao atendente que aquela regra ainda não foi conferida na fonte.
- **H4.** Como dono do repositório, quero que o agente só chegue às tools pelo gateway da plataforma, com política e guardrail, para que uma injeção de prompt não vire ação indevida.
  - **Dado** um texto do usuário com instrução para ignorar as regras e chamar uma tool que o agente não pode usar, **quando** o turno roda, **então** a entrada é bloqueada pelo guardrail do modelo ou a chamada é negada pela política, e a resposta tem a categoria do mapa de erros do contrato (RF-011 da plataforma).
- **H5.** Como desenvolvedor com um cliente MCP de versão anterior, quero conectar ao servidor, para não ser obrigado a atualizar o cliente no mesmo dia da mudança de protocolo.
  - **Dado** um cliente da versão 2025-11-25 (a lane, E16), **quando** ele lista e chama as tools, **então** recebe as mesmas tools e os mesmos resultados de um cliente 2026-07-28, e o servidor não guarda estado de sessão para nenhum dos dois.
- **H6.** Como agente, quando a pergunta sai das regras (por exemplo, "em qual CDB devo investir?") ou a regra está ausente ou ambígua, quero escalar para humano em vez de inventar.
  - **Dado** uma pergunta sem regra que a responda, **quando** o turno roda, **então** o agente devolve `handoff_humano` com o motivo e as regras consultadas, sem número inventado.

## Requisitos funcionais
Verificação: **UT** = teste unitário do servidor e do agente; **CT** = teste de contrato com um cliente MCP real em processo (HTTP sem estado; sem distribuição local por stdio, D03-P4 = A, D-071); **RG** = agente com respostas gravadas (D-006); **TT** = `terraform test` com mock provider; **FL** = integração no Floci; **DM** = evidência da demonstração real.

### Servidor e protocolo (D-011)
- **RF-001: servidor sem estado na versão 2026-07-28.** O servidor DEVE atender a versão 2026-07-28 sem handshake de inicialização e sem sessão: cada requisição traz o que o servidor precisa para processá-la, e nenhuma resposta depende de uma requisição anterior. A remoção do handshake e da sessão nessa versão é indício de busca, não conferido na especificação oficial (seção "Proveniência", E1); o plano confere antes de escrever o teste.
  - **Aceite:** um cliente 2026-07-28 chama `tools/list` e `tools/call` como primeiras requisições, sem `initialize`, e recebe resultado válido. (CT)
  - **Aceite:** duas requisições seguidas do mesmo cliente, atendidas por duas instâncias novas do servidor (processos diferentes no CT; execuções diferentes no FL), dão o mesmo resultado. (CT, FL)
  - **Aceite:** o plan não tem tabela, cache ou fila de sessão, e o servidor não emite cabeçalho de sessão em nenhuma versão. (TT, CT)
  - **Aceite:** os cabeçalhos HTTP exigidos pela 2026-07-28 (versão do protocolo, método e nome da operação) e a regra de coerência entre cabeçalho e corpo são testados um a um, a partir da lista conferida na especificação oficial no plano (E1). (CT)
- **RF-002: lane de compatibilidade.** O servidor DEVE atender também a versão 2025-11-25 (decisão técnica delegada, E16), sem guardar estado de sessão nem emitir cabeçalho de sessão.
  - **Aceite:** a negociação de versão é testada nos dois caminhos (2026-07-28 e 2025-11-25), com as mesmas tools e os mesmos resultados nos dois; uma versão fora desses dois é recusada (RF-003). (CT)
  - **Aceite:** as duas versões do servidor são exatamente as da lista `versoes_mcp` do contrato `comum` (`["2025-11-25", "2026-07-28"]`, ADR-0010 da plataforma), sem mudança no contrato. O gateway aceita as quatro versões do serviço, mas a lista publicada no contrato é essa. (TT na plataforma; CT na D03)
  - **Aceite:** a D03 não usa elicitation nem sampling, nem direto nem pelo gateway (ADR-0010 da plataforma). (UT: o servidor não anuncia nem chama essas capacidades)
- **RF-003: versão não suportada é recusada com erro de protocolo.** Uma requisição com versão fora da lista do servidor DEVE receber erro de protocolo, sem executar tool.
  - **Aceite:** versão desconhecida e cabeçalho incoerente com o corpo recebem erro JSON-RPC com o código que a especificação define (conferido no plano, E1), e a tool não é executada. (CT)

### Tools e resources (2.1, 2.3, 2.4)
- **RF-004: conjunto pequeno e fechado de tools.** O agente DEVE poder chamar exatamente 4 tools, todas somente leitura: `buscar_regras`, `simular_resgate`, `verificar_aporte` e `consultar_aplicacoes_cliente` (incluída por D03-P2 = A, D-071). O catálogo do servidor tem ainda 1 tool de administração sem agente chamador (`listar_versoes_regra`, RF-023; a ingestão assistida ficou fora desta entrega por D03-P1 = B, D-071); ela não conta no limite porque o agente não a vê. Cada tool tem nome verbo + objeto e descrição que diz o que faz, quando usar, quando **não** usar e as unidades da entrada e da saída.
  - **Aceite:** o `tools/list` direto no servidor devolve o catálogo inteiro do produto; o `tools/list` pelo gateway, com a role do agente, devolve só as tools com `permit` para ela, no máximo 4 (filtro da política, RF-002 da plataforma). Cada descrição tem as quatro partes. (UT, CT; DM para o filtro do gateway)
  - **Aceite:** nenhum par de tools tem descrições que se sobreponham no "quando usar" (revisão independente das descrições no PR; red team das descrições da skill `avaliacao-llm`: uma descrição não induz o modelo a chamar outra tool). (RG)
- **RF-005: entrada com schema estrito.** Cada tool DEVE ter JSON Schema com `additionalProperties: false`, campos obrigatórios, enums, limites e a unidade no nome do campo (`valor_brl`, `data_aplicacao`, `prazo_dias`).
  - **Aceite:** datas no formato `AAAA-MM-DD`; valores em reais como string decimal com até 2 casas (`^\d{1,9}(\.\d{1,2})?$`), para não perder centavos em ponto flutuante; argumento extra, faltante ou fora do limite devolve `entrada_invalida` (RF-011). (UT, CT)
- **RF-006: `buscar_regras`.** DEVE devolver as regras vigentes numa data de referência, filtradas por tema (enum: `rentabilidade`, `imposto_renda`, `iof`, `resgate`, `aporte`, `prazo`, `carencia`, `garantia`, `calendario`).
  - **Aceite:** para cada regra: `id`, `versao`, `tema`, `vigente_desde`, `vigente_ate`, `resumo`, parâmetros, `fonte` (título, órgão, URL), `data_fonte`, `data_consulta` e `certeza`. Data de referência fora de qualquer vigência devolve lista vazia com `motivo: sem_regra_vigente`, que não é erro. (UT, CT)
- **RF-007: `simular_resgate`.** DEVE calcular, para uma aplicação (valor e data) e uma data de resgate, o rendimento bruto, o IOF, o IR e o valor líquido, sem chamar modelo.
  - **Aceite:** o resultado traz os argumentos normalizados (`valor_aplicado_brl`, `data_aplicacao`, `data_resgate`), os quatro valores em reais, os dias corridos e úteis usados, a taxa do CDI usada com fonte e data, a lista `regras_aplicadas` (`id@versao`) e a lista `premissas` (por exemplo, "CDI constante no período"). (UT)
  - **Aceite:** a ordem de cálculo é rendimento bruto, depois IOF sobre o rendimento, depois IR sobre a base que a regra de IR declara; a ordem e a base vêm da regra versionada, não do código (E6). (UT)
  - **Aceite:** resgate antes do fim da carência, em dia não útil, depois do vencimento ou antes da data de aplicação devolve resultado de negócio (`permitido: false` com motivo e regra), não erro (RF-012). Data fora da cobertura do calendário versionado devolve `fora_da_cobertura` (RF-011). (UT)
  - **Aceite:** a bateria de casos de cálculo (critério de sucesso 2) cobre pelo menos: cada faixa do IR, cada fronteira de faixa (180/181, 360/361, 720/721 dias), IOF no 1º, no 29º e no 30º dia, resgate no dia da aplicação, valor mínimo e máximo do produto, e um período com feriado nacional. (UT)
- **RF-008: `verificar_aporte`.** DEVE dizer se um aporte (valor e data) é aceito pelas regras do produto.
  - **Aceite:** devolve `elegivel` (booleano), o motivo quando `false` (`abaixo_do_minimo`, `acima_do_maximo`, `fora_do_horario`, `dia_nao_util`) e as regras usadas (`id@versao`). (UT)
  - **Aceite:** a tool não grava nada: não existe aporte real, só a verificação. (UT, TT: a role do servidor não tem permissão de escrita)
- **RF-009: `consultar_aplicacoes_cliente` (incluída por D03-P2 = A, D-071).** A tool DEVE devolver as aplicações sintéticas de um cliente sintético (`aplicacao_id`, `cliente_id`, `produto_id`, `valor_aplicado_brl`, `data_aplicacao`, `percentual_cdi`, `data_vencimento`, `status`), registrada com a classe `dado_privado`.
  - **Aceite:** o `cliente_id` sintético segue `^CLI-[0-9]{6}$`; um id inexistente devolve lista vazia com `motivo: cliente_sem_aplicacoes`, igual para id inexistente e para cliente sem aplicação, para não revelar quais ids existem. (UT)
  - **Aceite:** as aplicações sintéticas vêm de um arquivo de dados JSON versionado no repositório e validado por JSON Schema (como em RF-013), com `sintetico: true` declarado, sem nenhum CPF, nome real, endereço ou conta bancária; o conjunto sintético cobre pelo menos: (1) aplicação com menos de 30 dias corridos (incidência de IOF + IR 22,5%), (2) cliente com múltiplas aplicações nas faixas de IR de 20%, 17,5% e 15% (≥ 721 dias corridos), (3) cliente válido sem aplicações ativas (`CLI-000103`), e (4) cliente distinto (`CLI-000104`) para o teste de isolamento contra troca de `cliente_id` por prompt injection (RF-021). (UT, revisão)
- **RF-010: catálogo de regras como resource.** O servidor DEVE expor o catálogo de regras como resources somente leitura: um índice e um resource por regra e versão.
  - **Aceite:** `resources/list` devolve o índice; `resources/read` de uma regra devolve o mesmo conteúdo que `buscar_regras` devolve para ela. (CT)
  - **Limite conhecido:** o agente chega às tools pelo gateway; se o gateway não repassar `resources/*` de alvo servidor MCP, os resources ficam para clientes diretos e inspeção, e o agente usa `buscar_regras` (E9, risco R3). (DM confere)
- **RF-011: erros estruturados.** Todo erro de tool DEVE sair como resultado de tool com `isError: true` e um objeto com `categoria`, `retentavel`, `mensagem` (o que o modelo deve fazer) e, quando couber, `campo`. O mesmo objeto vai em JSON no conteúdo de texto, para o caso de um intermediário não repassar o conteúdo estruturado (E4).

  | categoria | quando | retentável | o que o agente faz |
  |---|---|---|---|
  | `entrada_invalida` | argumento fora do schema ou do limite | não | corrige o argumento uma vez com a mensagem; se repetir, escala |
  | `fora_da_cobertura` | data fora do calendário ou de qualquer tabela versionada | não | informa a limitação e escala |
  | `dados_indisponiveis` | falha ao ler o registro de regras ou de dados | sim | até 3 tentativas com espera de 1, 2 e 4 s; depois escala com o erro propagado |
  | `interno` | exceção não prevista no servidor | não | escala com o id de correlação |

  - **Aceite:** com uma entrada para cada linha da tabela, a tool devolve a categoria e o retentável esperados; nenhuma exceção chega ao transporte como erro HTTP 500 ou erro JSON-RPC de protocolo. (UT, CT)
  - **Aceite:** a mensagem não traz stack trace, caminho de arquivo, nome de tabela nem ARN. (UT)
- **RF-012: resultado de negócio negativo não é erro.** Aporte recusado, resgate não permitido e busca sem regra vigente DEVEM sair como resultado com sucesso (`isError` ausente ou `false`) e motivo.
  - **Aceite:** cada um dos casos de negócio negativos do RF-006 ao RF-009 tem teste que confere `isError` falso e o motivo. (UT)

### Regras como dados versionados (Art. VIII, 5.6)
- **RF-013: regras em dados versionados.** Toda regra DEVE estar num arquivo de dados versionado no repositório, validado por um JSON Schema, e não no código nem no prompt. O repositório é a fonte de verdade, revisada em PR. Onde o servidor lê as regras em execução (a R4 indica DynamoDB com o original em S3 versionado) fica para o plano, com ADR se divergir da R4; o que estiver em execução é cópia gerada do repositório.
  - **Aceite:** o schema exige `id`, `versao`, `tema`, `vigente_desde`, `vigente_ate` (ou nulo), parâmetros, `fonte.titulo`, `fonte.orgao`, `fonte.url`, `data_fonte`, `data_consulta` e `certeza` (`confirmada` ou `a_confirmar`). Uma regra sem esses campos reprova o teste. (UT)
  - **Aceite:** duas versões do mesmo `id` não têm vigências sobrepostas. (UT)
  - **Aceite:** o código do servidor não tem literal de alíquota, faixa de dias ou limite de valor (busca no código pelos valores das tabelas fora dos dados e dos testes dá zero). (UT)
- **RF-014: regras cobertas.** O registro DEVE ter, no mínimo, as regras abaixo. As fontes candidatas estão na seção "Proveniência" e são **conferidas e datadas no plano**; até lá, cada regra pública entra com `certeza: a_confirmar`.
  - **Públicas:** IR regressivo sobre o rendimento de renda fixa por prazo; IOF regressivo sobre o rendimento nos resgates antes de 30 dias; base de cálculo do IR em relação ao IOF; regra de acúmulo do percentual do CDI por dia útil; calendário de dias úteis (feriados nacionais); garantia do FGC (informativa, sem efeito no cálculo).
  - **Do produto (aprovadas por D03-P5 = A, D-071):** 100% do CDI; aporte mínimo de R$ 100,00 e máximo de R$ 1.000.000,00 por aporte (limite operacional do produto sintético, independente do FGC informativo de até R$ 250 mil por CPF por conglomerado); vencimento em 1.080 dias corridos; sem carência; crédito do resgate no mesmo dia útil; horário de corte às 16h (`America/Sao_Paulo`); e regra de arredondamento meio para cima (`HALF_UP`, E7).
  - **Aceite:** cada tema do enum do RF-006 tem pelo menos uma regra vigente na data de referência da demonstração. (UT)
- **RF-015: incerteza visível.** Uma regra com `certeza: a_confirmar` DEVE aparecer como tal em todo resultado que a use.
  - **Aceite:** o resultado de `simular_resgate` e de `verificar_aporte` tem `incertezas` com cada regra `a_confirmar` usada; com todas `confirmada`, a lista é vazia. (UT)
  - **Aceite:** na fase verificar, nenhuma regra **pública** usada no roteiro de demonstração está `a_confirmar`. (UT com a data da demonstração; revisão)
- **RF-016: ingestão assistida de regras [Fora desta entrega: D03-P1 = B, D-071].** A etapa (a) da R4 (extração assistida de manual sintético por Claude) fica fora desta entrega por decisão do dono; as regras entram como dados versionados no repositório (RF-013) e passam pela revisão humana do PR. O identificador RF-016 é mantido estável para preservar a numeração de RF-017 a RF-025.

### Agente de atendimento (componente Claude, Art. VII)
- **RF-017: agente com loop por `stop_reason`.** O agente DEVE chamar o Claude pelo perfil de inferência do produto e com o guardrail do produto, e controlar o loop pelo `stopReason` do Converse, com no máximo 6 chamadas de tool por turno e `max_tokens` de cada chamada fixado no plano:
  - `tool_use` chama a tool pelo gateway;
  - `end_turn` passa a resposta ao verificador (RF-018);
  - `guardrail_intervened` e `content_filtered` param e classificam como `guardrail_entrada` ou `guardrail_saida`;
  - `max_tokens` para e vira `handoff_humano` com motivo `resposta_truncada` (resposta cortada não vai ao atendente);
  - qualquer outro valor (por exemplo, `stop_sequence`, saída ou tool malformada, janela de contexto excedida) ou valor desconhecido vira `handoff_humano` com motivo `parada_inesperada` (falha fechada).

  A lista completa de valores do `stopReason` é conferida na referência da API Converse no plano; um valor novo cai na regra de falha fechada sem mudança de código.
  - **Aceite:** uma resposta gravada para cada valor do `stopReason` da referência e uma com valor inventado levam ao ramo esperado; a 7ª chamada de tool no mesmo turno vira `handoff_humano` com motivo `limite_de_chamadas`. (RG)
  - **Aceite:** o agente chega às tools só pelo gateway: a role do agente não tem permissão de invocar o servidor direto. (TT)
- **RF-018: resposta com citação, sem conta do modelo.** Toda resposta com número DEVE citar o `id@versao` das regras e usar só números que vieram de tool no turno.
  - **Aceite:** um verificador determinístico confere, na resposta final, que cada número monetário, percentual ou de dias aparece no resultado de uma tool do turno (incluindo os argumentos normalizados que a tool devolve, RF-007) e que há pelo menos uma citação `id@versao`; se falhar, o agente pede ao modelo uma correção (no máximo 1) e depois escala. (RG)
- **RF-019: escalonamento para humano.** O agente DEVE devolver `handoff_humano` com motivo, regras consultadas e erros quando: não há regra vigente para a pergunta; a pergunta pede recomendação de investimento personalizada; uma tool devolve erro não retentável; um erro retentável persiste depois das tentativas; a política nega uma tool (`politica_negada` ou `requer_aprovacao_humana`).
  - **Endurecimento deliberado:** o mapa da plataforma manda só "informar o usuário" em `politica_negada`. A D03 escala, porque o catálogo do agente é fixo e nenhuma pergunta legítima leva a uma tool negada; uma negação indica injeção ou pergunta fora do produto, e um humano precisa ver o caso. O comportamento continua compatível com o contrato (não retenta).
  - **Aceite:** um caso gravado por motivo leva a `handoff_humano` com o motivo certo e sem número inventado. (RG)
- **RF-020: classificação de erros em camadas, na ordem.** O agente DEVE classificar nesta ordem: (1) as regras específicas do mapa de erros do contrato `comum` (RF-011 da plataforma), sem a linha genérica `erro_desconhecido`; (2) as categorias da D03 (RF-011 desta spec), lidas do objeto de erro; (3) por último, `erro_desconhecido` para todo `isError: true` que não casou antes, tratado como negação (falha fechada).
  - **Aceite:** uma resposta gravada por linha das duas tabelas dá a categoria e o retentável esperados; um erro da D03 nunca cai em `erro_desconhecido`; um texto de erro inédito cai em `erro_desconhecido`; retentativa só nas categorias retentáveis. (RG)
- **RF-021: canal do agente e identidade do cliente (incluído por D03-P2 = A, D-071).** O `cliente_id` usado na consulta de aplicações DEVE vir exclusivamente do chamador autenticado (o contexto do atendente que abriu o atendimento), nunca do texto livre do usuário nem de argumento escolhido livremente pelo modelo.
  - **Aceite:** um texto que pede dados de "outro cliente" (por exemplo, atendimento aberto para `CLI-000101` com texto pedindo `CLI-000104`) não muda o `cliente_id` efetivo da chamada. (RG, UT)

### Consumo da plataforma (D-030, D-034)
- **RF-022: registro pelo módulo da plataforma.** A D03 DEVE registrar alvo, classes das tools, políticas, guardrail, perfil de inferência e roles só pelo módulo `registro-produto` da plataforma, no state da D03, e ler o contrato `comum` pelo SSM.
  - **Aceite:** o alvo é do tipo servidor MCP, com nome iniciado por `03-mcp-regras-cdb-`; toda tool tem pelo menos uma classe, usando `leitura_publica` para as tools de regras públicas e cálculos (`buscar_regras`, `simular_resgate`, `verificar_aporte`) e `dado_privado` para `consultar_aplicacoes_cliente` (emenda de versão menor do contrato aprovada em D03-P10 = A, D-071, E8); o Terraform da D03 não tem recurso `aws_bedrockagentcore_gateway_target`, `aws_bedrockagentcore_policy`, `aws_bedrockagentcore_gateway` nem `aws_bedrockagentcore_policy_engine` fora do módulo (gate do harness, ADR-0006 da plataforma). (TT)
  - **Aceite:** busca por `arn:aws:bedrock-agentcore` e `arn:aws:bedrock` no código e no Terraform da D03 dá zero fora de testes com dados gravados (critério de sucesso 1 da plataforma). (UT do harness)
  - **Aceite:** nenhum principal da D03 tem `permit` que cubra, somadas, as classes `dado_privado`, `conteudo_nao_confiavel` e `canal_saida` (tríade letal, RF-009 da plataforma). (TT)
- **RF-023: roteiro de demonstração.** O roteiro DEVE ter os quatro passos do RF-010 da plataforma (uma chamada permitida, uma negada por falta de política, uma negada pelo guardrail da camada de tools e uma entrada bloqueada pelo guardrail do modelo) e os passos de produto H1, H2, H3 e H6.
  - **Aceite:** o catálogo da D03 registra uma tool de administração somente leitura (por exemplo, `listar_versoes_regra`, com o histórico de versões de uma regra) **sem nenhum agente chamador**. O módulo `registro-produto` só gera `permit` da role de aprovação para tools `sensivel` (plano da plataforma), e esta tool é classificada como `leitura_publica` (D03-P10 = A, D-071, E8), não `sensivel`; então ninguém tem `permit` para ela, e a negação vem do "nega por padrão" do Cedar. (TT: nenhuma política gerada tem `permit` com essa ação)
  - **Aceite:** o passo de negação é uma chamada **forçada** a essa tool: uma resposta gravada do modelo pede `tool_use` dela, e o agente a envia ao gateway, que nega (`politica_negada`, levando ao `handoff_humano` do RF-019). Na demonstração, o mesmo passo usa essa resposta gravada no lugar da chamada ao modelo, porque o agente não vê a tool no `tools/list` e não a pediria sozinho. (RG)
  - **Aceite:** cada passo passa com respostas gravadas (RG) e aparece nas métricas da demonstração: `AllowDecisions` ≥ 1, `DenyDecisions` ≥ 1 (conferido para o passo forçado) e intervenção do guardrail ≥ 1. (DM)
- **RF-024: tópicos negados do guardrail (aprovado por D03-P6 = A, D-071).** O guardrail do produto DEVE configurar exatamente um tópico negado: `"recomendação de investimento personalizada"` (a base da plataforma não tem nenhum, E3 da plataforma).
  - **Aceite:** o plan do guardrail tem exatamente o tópico `"recomendação de investimento personalizada"`, com mensagem de bloqueio em português que não ecoa o conteúdo. (TT)

### Observabilidade (Art. VI)
- **RF-025: logs, métricas e alarmes do servidor.** O servidor DEVE gravar um log estruturado por requisição (versão do protocolo, método, nome da tool, categoria do resultado, duração e id de correlação, sem os argumentos de `dado_privado`) e publicar métricas por tool e por categoria de erro.
  - **Aceite:** alarmes com período de 5 minutos, 1 período de avaliação, estatística `Sum`, dado ausente como "não violado": erro `interno` ≥ 1; `dados_indisponiveis` ≥ 3; erro de protocolo (RF-003) ≥ 5; erro da execução do servidor ≥ 1. Todos publicam no tópico de alarmes do contrato `comum`. (TT)
  - **Aceite:** retenção de 7 dias nos grupos de log criados pela D03, removidos no destroy. (TT)

## Requisitos não funcionais
- **RNF-001 (segurança, Art. IV).**
  - **Nada público:** o servidor só aceita chamadas assinadas do gateway da plataforma (a política de recurso libera só o gateway, com `aws:SourceArn`); nenhum endpoint anônimo. A D03 adota as duas partes da D-044 (que vale para a plataforma): nenhuma política com `Principal "*"`, nem com condição, e nenhum valor de condição de conta com curinga (`*` ou `?`).
  - **Criptografia:** em repouso com KMS nos dados de regras, nos dados sintéticos de cliente (se houver) e nos logs; em trânsito só TLS. A D03 não cria tópico: os alarmes publicam no tópico do contrato `comum`, cifrado pela plataforma. Chave própria ou da conta fica no plano, com custo e ADR.
  - **Menor privilégio:** a role do servidor só lê os dados da D03 e escreve os próprios logs e métricas; nenhuma ação `*` em recurso `*`; nenhuma permissão de escrita nos dados (RF-008).
  - **Isolamento (D-029):** recursos com prefixo `03-mcp-regras-cdb-` e roles com condição na tag `project`.
  - **Aceite:** checkov e tflint sem achado alto ou crítico; asserts de plan para cada item; gitleaks sem achado. (TT, esteira)
- **RNF-002 (custo, Art. V).**
  - Teto = custo estimado de um dia de execução, aprovado pelo dono em **US$ 0,50/dia** com cota dura de 300.000 tokens no agente (D03-P7 = A, D-073); o US$ 10/mês da D-011 foi substituído pela D-021.
  - Só serviços cobrados por uso; nenhum custo fixo ocioso sem ADR (sem NAT Gateway, endpoint de interface, cluster ou instância ligada); o servidor escala a zero entre requisições. Que a âncora associa isso ao MCP sem estado é indício de busca, a conferir no plano (E2).
  - O dia da D03 soma o que o módulo `registro-produto` cria no state dela (guardrail, perfil, 6º alarme), a inferência do agente e o servidor; a plataforma tem o teto dela (US$ 1,20, D-038).
  - **Aceite:** o plan tem `aws_budgets_budget` com `time_unit = "DAILY"` e `limit_amount` igual ao `teto_diario_usd` do `harness/estado.json`; o plan não tem NAT, endpoint de interface, cluster nem instância; os workflows de apply e destroy têm `prazo_horas` ≤ 24, `confirm_stack`, ambiente `aws-lab-destroy`, OIDC e verificação de sobras pela tag (`estado.py validar` na fase verificar); o prazo da D03 nunca passa do prazo da plataforma, e o destroy da D03 roda antes do da plataforma (RF-008 da plataforma). (TT, CI do harness)
- **RNF-003 (operação, Art. VI).**
  - Tags `project=03-mcp-regras-cdb`, `module` em kebab por componente e `managed-by=terraform` (D-031), testadas a partir de `harness/modelos/tags.tftest.hcl`; state remoto com lock; README com no máximo 5 passos.
  - **Aceite:** o teste de tags passa; todo nome do plan casa com `^03-mcp-regras-cdb-`, salvo as exceções de API listadas no plano (ADR-0012 da plataforma); o README do módulo tem no máximo 5 passos numerados. (TT, teste do harness)
- **RNF-004 (testes, Art. III).** Teste vermelho antes do código em cada tarefa; componente Claude só com respostas gravadas (D-006); `terraform test` com mock provider, checkov e tflint; integração no Floci só com o projeto completo, com relatório em `testing/reports/`; lacunas do emulador só com evidência (a invocação MCP pelo gateway, o motor de política e o guardrail não são emulados, ADR-0009 da plataforma).
  - **Aceite:** nenhum teste do CI chama o Bedrock; todo aceite desta spec aparece no `matriz.md` com pelo menos um teste (nasce na fase tarefas); o relatório do Floci separa falha real de lacuna. (teste do harness)
- **RNF-005 (proveniência e privacidade, Art. VIII).** Produto, clientes e manual são sintéticos. Regras públicas vêm só de fontes oficiais públicas (Receita Federal, Planalto, Banco Central, CMN, B3, ANBIMA), com URL e data; nada de empresa em que o dono trabalha; nada de material do curso.
  - **Aceite:** toda regra pública tem `fonte.url` num domínio oficial da lista do plano; o relatório da demonstração passa pela revisão do dono antes de entrar no repositório. (UT, revisão)
- **RNF-006 (região).** `us-east-1`, a mesma da plataforma.
  - **Aceite:** a região do provider tem padrão `us-east-1` (TT); a disponibilidade do modelo pelo perfil de inferência é conferida na fonte oficial antes do primeiro apply real (DM).
- **RNF-007 (desempenho).** As tools determinísticas DEVEM responder em até 500 ms no p95, medido no servidor (sem o gateway e sem a partida a frio), na bateria do critério de sucesso 2.
  - **Aceite:** medido no FL; o valor da demonstração vai para o relatório (DM). É alvo técnico de lab, não SLA.

## Componente Claude e tarefas da prova
Cenário da prova mais próximo: **agente de suporte ao cliente** (atendente interno consultando regras de produto). Curso Skilljar relacionado: **Introduction to Model Context Protocol** (e Claude with Amazon Bedrock, pelo acesso ao modelo).

| O que acontece | Tarefas CCAR-F | Como é testado |
|---|---|---|
| Descrições das tools com o que fazem, quando usar, quando não usar e unidades | 2.1 interface e descrição de tools | UT das descrições; red team das descrições (RG) |
| No máximo 4 tools somente leitura; catálogo como resource | 2.3 poucas tools por agente; 2.4 resources e configuração do servidor | UT, CT |
| `isError` com categoria e retentável; negativo de negócio separado de erro | 2.2 erros estruturados | UT, CT |
| Classificação em duas camadas, falha fechada e escalonamento com o erro propagado | 5.3 propagação de erros; 5.2 escalonamento | RG |
| Correção da resposta quando o verificador de números e citações reprova | 4.4 validação e retentativa | RG |
| Regras com fonte, data e certeza; incerteza no resultado | 5.6 proveniência e incerteza | UT, RG |
| Loop pelo `stop_reason` com limite de chamadas | 1.1 loop do agente | RG |
| Política nega por padrão; tool fora do `permit` vira handoff | 1.4 gate programático e handoff | RG, DM |
| Ingestão por `tool_use` com aprovação humana (fora desta entrega: D03-P1 = B, D-071) | 4.3 saída estruturada; 4.4; 5.5 revisão humana | revisão humana no PR dos dados versionados (RF-013) |

**Respostas gravadas (D-006):** uma por `stop_reason`, uma por linha das duas tabelas de erro, uma por passo do roteiro e uma por motivo de escalonamento. As respostas no formato publicado da documentação ficam como estão; as que a documentação não mostra ficam com `proveniencia: sintetica` e são trocadas pela captura real na primeira demonstração, como na plataforma. O comportamento real do modelo (escolha da tool certa, citação, resistência a injeção) fica sem validação nos testes e é medido uma vez na demonstração.

## Âncora (D-065)
- **Página:** [MCP went stateless: Is your AWS MCP server deployment well-architected? (AWS Architecture Blog)](https://aws.amazon.com/blogs/architecture/mcp-went-stateless-is-your-aws-mcp-server-deployment-well-architected), 01/09/2026, aceita pelo dono em 2026-11-21.
- **Conferência anterior:** a D-065 registra que as três âncoras (D01, D02 e D03) foram abertas e conferidas em 2026-11-21, antes do aceite do dono.
- **Reconferência nesta fase: não feita.** Nesta sessão eu não consegui abrir a página: o download direto foi negado pelo ambiente, e não havia ferramenta de leitura de documentação disponível. Os resultados de busca de 2026-11-22 indicam que o post relaciona a revisão 2026-07-28 do MCP com a lente de IA agêntica do Well-Architected e diz que, sem sessão no servidor, não é preciso guardar sessão compartilhada nem afinidade de sessão, o que permite rodar o servidor em AWS Lambda. Isso é **indício, não conferência** (regra da âncora do `CLAUDE.md`).
- **O que fica para o plano:** reconferir a página no plano e no ADR-0001: abrir a página, conferir o diagrama e os componentes, e escrever o ADR-0001 com o link, a data, o que foi seguido, o que mudou (consumo pelo gateway da plataforma, dados sintéticos, lane) e por quê. Se a página não descrever arquitetura com diagrama e componentes, a âncora volta ao dono.

## Proveniência (consulta em 2026-11-22)
Nenhuma linha abaixo está **confirmada**: nesta sessão só tive acesso a resultados de busca, sem abrir as páginas. A certeza "indício" quer dizer "visto em resultado de busca"; o plano abre cada fonte e muda a certeza para "confirmado" ou retira a afirmação.

| afirmação | fonte candidata | data da fonte | certeza |
|---|---|---|---|
| A 2026-07-28 removeu o handshake `initialize` e o cabeçalho de sessão `Mcp-Session-Id` | [changelog da especificação 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/changelog.md); [blog oficial do MCP](https://blog.modelcontextprotocol.io/posts/2026-07-28/) | 2026-07-28 | indício (busca); não confirmado em modelcontextprotocol.io |
| No Streamable HTTP, `Mcp-Method` e `Mcp-Name` são obrigatórios, e `MCP-Protocol-Version` vai em todo POST, coerente com o `_meta` do corpo | mesmas fontes; textos secundários | 2026-07-28 | indício (busca); não confirmado |
| Cabeçalho incoerente com o corpo é recusado com erro próprio (código -32020 citado por uma fonte secundária) | fonte secundária | — | não confirmado |
| Resultados têm `resultType` (`complete` ou `input_required` para interação em várias idas e voltas) | trecho do changelog na busca | 2026-07-28 | indício (busca); não confirmado |
| Roots, Sampling e Logging foram descontinuados | trecho do changelog na busca | 2026-07-28 | indício (busca); não confirmado |
| `ttlMs` | só uma fonte secundária cita, sem definir | — | não confirmado; a spec não depende dele |
| O serviço do gateway aceita 2025-03-26, 2025-06-18, 2025-11-25 e 2026-07-28; pedido sem cabeçalho vale 2025-03-26; tradução sem elicitation e sampling. A lista `versoes_mcp` do contrato `comum` é `["2025-11-25", "2026-07-28"]` | ADR-0010 da plataforma (consulta de 2026-11-19) | 2026-07-28 | confirmado no ADR-0010; não reconferido aqui |
| IR sobre rendimento de renda fixa: 22,5% até 180 dias, 20% de 181 a 360, 17,5% de 361 a 720, 15% acima de 720 | Lei 11.033/2004, art. 1º, no [Planalto](https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033.htm); Receita Federal (IN RFB 1.585/2015) | 2004 | indício (busca); não confirmado |
| A MP 1.303/2025, que trocaria a tabela regressiva por alíquota única de 17,5%, perdeu a vigência em outubro de 2025 sem conversão em lei | [MP 1.303/2025 no Planalto](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/Mpv/mpv1303.htm) ("vigência encerrada" no resultado de busca) | 2025-06-11 | indício (busca); a data exata do fim diverge entre fontes secundárias (8 e 11/10/2025); conferir no plano se nenhuma norma posterior mudou a tabela até a data da demonstração |
| IOF regressivo sobre o rendimento no resgate antes de 30 dias, de 96% no 1º dia a 0% no 30º | Decreto 6.306/2007, anexo, no [Planalto](https://planalto.gov.br/ccivil_03/_Ato2007-2010/2007/Decreto/D6306compilado.htm) | 2007 (texto compilado) | indício (busca); a contagem do 1º dia e a tabela completa são conferidas no plano |
| O IOF é calculado antes do IR, e o IR incide sobre o rendimento menos o IOF | fontes secundárias na busca | — | inferido; conferir na norma da Receita no plano |
| Garantia do FGC: até R$ 250 mil por CPF ou CNPJ por conglomerado, com teto global de R$ 1 milhão a cada 4 anos | [Banco Central: FGC e FGCoop](https://bcb.gov.br/en/financialstability/FGC_and_FGCoop); regulamento do FGC (anexo II da Resolução CMN 4.222/2013) | — | indício (busca); uma fonte secundária fala em mudança do CMN em 2026 sobre captação com garantia do FGC, não conferida |
| O CDI pós-fixado acumula por dia útil, com base de 252 dias | metodologia da taxa DI da B3 | — | inferido; conferir no plano |
| Calendário de feriados nacionais para dias úteis | calendário da ANBIMA | — | inferido; conferir no plano |
| Taxa DI de referência para a simulação | B3 (taxa DI publicada) | a definir | o valor e a data são registrados no plano ou na implementação, com fonte; sem valor conferido, a simulação usa um valor sintético marcado `a_confirmar` (E10) |

## Fora de escopo
- Apply numa conta real fora do workflow protegido disparado pelo dono; nenhum apply ou destroy fora do Floci nesta fase.
- Dados reais de clientes, emissor real, produto real, integração com sistema bancário, aporte ou resgate de verdade (as tools só simulam e verificam).
- Recomendação de investimento personalizada e análise de perfil do investidor (o agente escala, RF-019).
- Pessoa jurídica, outros produtos de renda fixa, CDB prefixado ou atrelado ao IPCA, e tributação fora de IR e IOF.
- Autenticação por JWT, OAuth ou Cognito na entrada do servidor: a identidade é IAM pelo gateway da plataforma (E5 da plataforma, E11 aqui).
- Elicitation e sampling (ADR-0010 da plataforma).
- Pipeline de ingestão assistida por Claude de manual sintético para regras estruturadas (D03-P1 = B, D-071; as regras entram como dados versionados revisados no PR).
- Distribuição local do servidor MCP por stdio em pacote privado (D03-P4 = A, D-071; exposição somente via HTTP sem estado pelo gateway da plataforma).
- Implementação na Azure: a comparativa é design doc e diagrama com mapeamento serviço a serviço (D-007), na fase publicar. Implementar só se o dono decidir, por custo.
- Projeto de IA aplicada da D03 (pendente do dono, fora desta spec).
- Qualquer coisa que não esteja no repositório: esta spec não supõe código, aula ou documento fora dele.

## Esclarecimentos
| id | Ambiguidade | Classe | Resolução |
|---|---|---|---|
| E1 | Os detalhes da 2026-07-28 (cabeçalhos, códigos de erro, `resultType`, `ttlMs`) não foram conferidos na fonte oficial nesta sessão | técnica | Os requisitos dizem o comportamento (sem handshake, sem sessão, coerência cabeçalho e corpo, recusa de versão) e deixam a lista exata de cabeçalhos e códigos para o plano, que abre a especificação oficial e cita a seção. Boa prática: **afirmar só o que a fonte confirma e declarar a incerteza**; o erro comum é escrever teste contra um detalhe lembrado de um rascunho (o RC) que mudou na versão final (5.6) |
| E2 | Onde o servidor roda | técnica, decidida no plano | A spec exige só escala a zero, nenhuma sessão e nenhum custo fixo ocioso (RNF-002); a âncora indica Lambda, e o plano confere a âncora e escolhe. Boa prática: **a spec diz o quê, o plano diz o como**; o erro comum é a spec amarrar um serviço antes de conferir a âncora e o emulador (Art. I) |
| E3 | Recusa de aporte ou de resgate é erro? | técnica | Não. É resultado de negócio com motivo (RF-012); `isError` fica para falha de entrada, cobertura ou infraestrutura (RF-011). Boa prática: **separar resultado vazio ou negativo válido de falha de acesso**; o erro comum é o agente tentar de novo ou escalar um "não" legítimo como se fosse pane (2.2) |
| E4 | O gateway repassa o conteúdo estruturado do erro da tool? | técnica | Não confirmado. O objeto de erro vai no conteúdo estruturado e também em JSON no texto, e o agente lê o que chegar. Boa prática: **contrato de erro que sobrevive ao intermediário**; o erro comum é perder a categoria no caminho e cair sempre em `erro_desconhecido` (2.2, 5.3) |
| E5 | Quem calcula IR, IOF e rendimento | técnica | Só as tools determinísticas; o modelo explica e cita, e um verificador confere números e citações na resposta (RF-018). Boa prática: **gate programático em vez de instrução no prompt**; o erro comum é confiar que "não invente números" no prompt basta (1.4, 4.4) |
| E6 | Ordem e base dos cálculos no código ou nos dados | técnica | Nos dados versionados da regra (RF-007, RF-013), para que uma mudança de lei seja uma versão nova de regra com vigência, e não uma mudança de código. Boa prática: **regra de negócio como dado com vigência e fonte**; o erro comum é a regra antiga sumir no deploy e ninguém conseguir explicar um cálculo do mês passado (5.6) |
| E7 | Arredondamento | técnica | Cálculo em decimal exato, arredondamento só no fim de cada valor, para o centavo, pelo modo declarado na regra do produto (`arredondamento`, proposta: meio para cima). Não há fonte pública única para isso, então a regra cita "produto sintético" como fonte. Boa prática: **critério explícito e mensurável**; o erro comum é um teste que passa com 0,01 de diferença por ponto flutuante (4.1) |
| E8 | Classe de uma tool que só lê regras públicas do próprio repositório | técnica, com efeito no plano aprovado da plataforma | A plataforma exige pelo menos uma das classes `dado_privado`, `conteudo_nao_confiavel`, `canal_saida` e `sensivel`, e nenhuma descreve uma consulta a dados públicos e confiáveis. Classificar errado (por exemplo, como `conteudo_nao_confiavel`) distorce a regra da tríade. A recomendação técnica é um valor novo (`leitura_publica`) como versão menor do contrato. Como muda o plano aprovado da plataforma, a emenda segue a regra de plano alterado (D-033) e é pergunta ao dono (D03-P10). Vale para as tools de regra e para a tool de administração do RF-023. Boa prática: **mudar o contrato pela versão, não contornar**; o erro comum é rotular errado para passar na validação e esvaziar o controle |
| E9 | Resources pelo gateway | técnica | Não confirmado que o gateway repassa `resources/*` de alvo servidor MCP. O agente usa `buscar_regras`; os resources atendem clientes diretos e inspeção (RF-010). O plano confere na documentação do AgentCore. Boa prática: **não duplicar caminho para o modelo**; o erro comum é dar ao agente duas formas de ler a mesma coisa e ele alternar entre elas (2.3, 2.4) |
| E10 | Qual CDI usar na simulação | técnica | Um valor versionado com fonte e data (taxa DI da B3), usado como constante no período e declarado em `premissas` e, se não conferido, em `incertezas`. A simulação não é promessa de rentabilidade. Boa prática: **declarar premissa e incerteza junto do número**; o erro comum é apresentar projeção como valor garantido (5.6) |
| E11 | As aulas (pelo resumo da `REVISAO-OPCOES-D01-D04.md`) usam JWT com dois papéis, limite por token e IP e três erros (token inválido, acesso negado, limite excedido) | técnica | A identidade é IAM pelo gateway (D-034, E5 da plataforma); os papéis viram roles (agente e aprovação) com Cedar; os três erros da aula ficam como as categorias `autenticacao`, `politica_negada` e `limite_taxa` do mapa da plataforma, que o agente já trata (RF-020). Limite de taxa: o `Throttles` do gateway e um limite de concorrência do servidor, definido no plano. A fidelidade às legendas é conferida antes da fase analisar (D03-P9). Boa prática: **reaproveitar o controle central em vez de recriar no produto**; o erro comum é cada produto ter a própria autenticação e política |
| E12 | O componente Claude é obrigatório ou basta o servidor? | técnica, derivada de decisões | Obrigatório: o Art. VII exige componente Claude, e o critério de sucesso 1 da plataforma pede que a D03 rode o roteiro com guardrail do modelo, o que exige um agente que chama o Claude. Fica em aberto só a ingestão (D03-P1) |
| E13 | Fuso das datas | técnica | `America/Sao_Paulo` para "hoje" e para o horário de corte; datas de aplicação e resgate sem hora. Boa prática: critério explícito; o erro comum é o resgate "de hoje" cair no dia seguinte por UTC (4.1) |
| E14 | Limite de chamadas de tool por turno | técnica | 6 por turno (RF-017): o pior roteiro previsto usa 3 (buscar, consultar, simular) e mais uma correção; 6 dá folga sem deixar um loop correr. Boa prática: **limite de iterações no loop do agente**; o erro comum é um loop sem fim por tool que falha (1.1) |
| E16 | Qual versão anterior a lane atende (D-011 manda ter lane, sem dizer qual) | técnica, **delegada** (design de MCP). Para a memória: id a atribuir pela orquestração, fonte "delegada", texto "D03: lane de compatibilidade só em 2025-11-25; `versoes_mcp` do contrato intacto; 2025-06-18 só se um cliente real precisar, com o contrato subindo para 1.1.0 (ADR-0010)" | Só 2025-11-25, a versão imediatamente anterior, que já está em `versoes_mcp` do contrato (ADR-0010). Nada muda na plataforma. Se um cliente real precisar da 2025-06-18, ela entra como versão menor do contrato (`1.1.0`), como o ADR-0010 prevê. Boa prática: **menor superfície de compatibilidade que atende os clientes reais, com política de versão explícita**: o arquiteto suporta a versão anterior imediata e amplia só com demanda medida. O erro comum é aceitar todas as versões antigas "por garantia", o que aumenta a superfície de tradução e de teste sem cliente que precise (2.4, 5.6) |
| E15 | `estado.json` diz "pouca implementação" e `retroativo: true`, e a lista de decisões não tem D-024, D-029, D-031 e D-034 | técnica, fora do escopo de escrita desta tarefa | A spec registra o estado real (nada implementado). Sugestão à orquestração: corrigir a nota e completar a lista de decisões no `harness/estado.json` |

## Divergências com a constituição (resumo)
Como não há código, as divergências são de artefatos declarados que ainda não existem.

| id | Onde | Artigo ou decisão | Situação |
|---|---|---|---|
| DV-01 | `.github/workflows/03-mcp-regras-cdb-apply.yml` e `-destroy.yml`, declarados no `harness/estado.json`, não existem | Art. V, D-021, D-024 | falta criar a partir de `harness/modelos/` |
| DV-02 | `teto_diario_usd` é `null` | Art. V | calcular no plano; valor do dono (D03-P7) |
| DV-03 | nota "Pouca implementação antes do SDD" no `harness/estado.json`, sem código correspondente | Art. VIII (proveniência do registro) | orquestração corrige (E15) |

## Riscos
| id | Risco | Probabilidade e impacto | O que fazer |
|---|---|---|---|
| R1 | Um cliente real precisa de versão fora da lane (2025-06-18 ou anterior) | baixa; esse cliente recebe erro de versão | A lane é só 2025-11-25, que já está em `versoes_mcp` (E16); com demanda real, a 2025-06-18 entra como versão menor do contrato (`1.1.0`, ADR-0010) |
| R2 | O servidor atrás do gateway não recebe a versão que o cliente usou (tradução no gateway) | média; os testes da lane passam no CT e falham no DM | O plano confere na documentação do alvo servidor MCP; o DM roda os dois caminhos |
| R3 | O gateway não repassa resources ou o conteúdo estruturado do erro | média; RF-010 e RF-011 perdem parte do valor pelo gateway | E4 e E9: erro também no texto; agente usa a tool |
| R4 | Mudança na legislação de IR ou IOF entre a conferência e a demonstração | baixa; resposta com regra vencida | Vigência nas regras; o plano reconfere as fontes na semana da demonstração |
| R5 | A invocação MCP pelo gateway, a política e o guardrail não são emulados no Floci | alta (é fato, ADR-0009 da plataforma); o FL não prova o caminho completo | Prova por TT e RG no CI e por DM; o servidor em si é testado no CT e no FL direto |
| R6 | A classe nova de tool (E8) exige emenda no plano aprovado da plataforma | média; atrasa o plano da D03 e o da plataforma | Pergunta D03-P10 ao dono antes do plano da D03; a emenda segue a D-033 |
| R7 | A âncora não descrever arquitetura com diagrama e componentes | baixa; a regra da âncora não é atendida | Conferir no plano; se faltar, volta ao dono |

## Decisões do dono que esta spec usa
D-006 (só respostas gravadas nos testes), D-007 (Azure como cloud comparativa da D03), D-008 (MCP de regras do CDB com liquidez diária; opção R4 nas decisões de 2026-11-19), D-011 (MCP 2026-07-28 sem estado com lane; o teto de US$ 10/mês foi substituído pela D-021), D-021 e D-022 (demonstração de um dia e limite mensal da conta), D-024 (prazo e destroy automático), D-029 (conta única, tag e prefixo), D-030 (plataforma compartilhada), D-031 (valores das tags), D-034 (D03 como primeiro consumidor da plataforma), D-044 (sem `Principal "*"` e sem curinga em valor de condição de conta, adotada aqui), D-065 (âncora do MCP sem estado), D-069 (sem links de sessão no repositório), D-071 (respostas do dono às perguntas D03-P1, D03-P2, D03-P4, D03-P5, D03-P6, D03-P9 e D03-P10), D-072 (decisão técnica delegada E16: lane de compatibilidade só em 2025-11-25), D-073 (plano da D03 aprovado e teto diário de US$ 0,50 com cota de 300.000 tokens, D03-P7 e D03-P11).

## Perguntas ao dono
Registro apenas; o dono responde no chat (D-041). Respondidas em 2026-11-22 (D-071), exceto D03-P7 (`teto_diario_usd`), calculado no plano e aprovado junto com o `plan.md`.

| id | pergunta | bloqueia | opções | recomendação / resposta |
|---|---|---|---|---|
| D03-P1 | A etapa de ingestão assistida da R4 (o Claude transforma um manual sintético do produto em regras estruturadas, com aprovação humana antes de publicar) entra nesta entrega? | RF-016, o segundo componente Claude e o custo de inferência do dia | A: entra agora; B: fica fora, e as regras entram à mão como dados versionados revisados no PR; C: fica para uma segunda fase depois da demonstração | **Respondida (D-071, opção B):** fica fora desta entrega; as regras entram como dados versionados revisados no PR |
| D03-P2 | O servidor inclui dados sintéticos de aplicações de clientes (tool `consultar_aplicacoes_cliente`, classe `dado_privado`)? | RF-009, RF-021, a classificação da tríade letal e parte do roteiro | A: inclui, com dados sintéticos e o id do cliente vindo do atendente autenticado; B: não inclui | **Respondida (D-071, opção A):** inclui dados sintéticos de aplicações em JSON versionado validado por schema e a tool `consultar_aplicacoes_cliente` (`dado_privado`), com `cliente_id` injetado pelo contexto autenticado |
| D03-P4 | Haverá distribuição local por stdio (pacote privado, a etapa (e) da R4)? | o CT por stdio e um artefato de distribuição | A: não, só HTTP pelo gateway; B: sim, pacote privado para uso local | **Respondida (D-071, opção A):** não; exposição somente via HTTP sem estado pelo gateway da plataforma |
| D03-P5 | Parâmetros do CDB sintético | RF-014 (regras do produto) e a bateria de casos de cálculo | A: usar a proposta da spec (100% do CDI; aporte mínimo de R$ 100,00 e máximo de R$ 1.000.000,00 por aporte; FGC informativo até R$ 250 mil; vencimento em 1.080 dias corridos; sem carência; crédito no mesmo dia útil; corte às 16h; arredondamento meio para cima); B: o dono define os valores; C: proposta com ajustes | **Respondida (D-071, opção A):** parâmetros da proposta aprovados |
| D03-P6 | Tópicos negados do guardrail do produto (a base da plataforma não tem nenhum) | RF-024 e um passo do roteiro | A: um tópico, "recomendação de investimento personalizada"; B: nenhum tópico; C: A mais "promessa de rentabilidade garantida" | **Respondida (D-071, opção A):** um tópico negado (`"recomendação de investimento personalizada"`) |
| D03-P7 | Valor do teto diário (`teto_diario_usd`) | a fase tarefas (`estado.py validar` exige teto), o Budgets diário e o gate de FinOps | A: US$ 0,50/dia com cota de 300.000 tokens; B: US$ 0,60/dia; C: outro valor | **Respondida (D-073, opção A):** US$ 0,50/dia com cota dura de 300.000 tokens no agente |
| D03-P9 | Material de aula da D03 (legendas e PDF) para conferir a fidelidade do desenho | a conferência de fidelidade antes da fase analisar, não o plano | A: uma sessão na máquina do dono extrai e resume as legendas das unidades 04 a 08 antes da análise; B: seguir só pelo resumo já versionado em `docs/curso/REVISAO-OPCOES-D01-D04.md` | **Respondida (D-071, opção A):** extrair e resumir as legendas e PDFs das unidades 04 a 08 antes da fase `analisar` |
| D03-P10 | Emenda do contrato da plataforma: as tools que só leem dados públicos e confiáveis (as de regra e a de administração do RF-023) não cabem em nenhuma das 4 classes exigidas (E8). Como classificá-las? | RF-022 e RF-023 (registro das tools e passo de negação), o plano da D03 e uma emenda do plano aprovado da plataforma (D-033) | A: classe nova `leitura_publica` numa versão menor do contrato (`1.x`), aceita pela regra "pelo menos uma classe" e fora das pernas da tríade; B: permitir tool sem classe; C: outra solução | **Respondida (D-071, opção A):** criar a classe `leitura_publica` em versão menor do contrato da plataforma (`1.x`), fora das pernas da tríade letal |

Ids estáveis: D03-P3 (versão da lane) virou decisão técnica delegada (E16, D-072), e D03-P8 (IA aplicada da D03) saiu porque já está em "Fora de escopo" e nas pendências da memória. Esses ids não são reutilizados.
