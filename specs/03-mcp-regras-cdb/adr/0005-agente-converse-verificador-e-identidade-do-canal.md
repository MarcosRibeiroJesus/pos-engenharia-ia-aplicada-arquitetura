# ADR-0005: Agente de atendimento via Bedrock Converse, verificador determinístico de citações e identidade do cliente pelo canal

- **Status:** aceito (plano aprovado pelo dono em 2026-11-22, D-073)
- **Data:** 2026-11-22 · **Autor:** arquiteto-aws (orquestração Antigravity)
- **Requisitos:** RF-017, RF-018, RF-019, RF-020, RF-021, RF-024; D-006, D-071

## Contexto
O agente de atendimento da D03 recebe perguntas de um atendente interno sobre regras do CDB com liquidez diária e aplicações do cliente em atendimento. Três falhas clássicas de LLMs precisam ser impedidas por construção:
1. **Alucinação aritmética ou normativa:** o modelo inventar um valor líquido, uma alíquota de IR/IOF ou uma regra sem chamar tool ou divergindo do número retornado pela tool (`RF-018`).
2. **Troca de cliente por prompt injection (IDOR / Confused Deputy):** o texto da pergunta pedir para consultar as aplicações de outro `cliente_id` diferente do atendimento autenticado (`RF-021`, `D03-P2 = A`).
3. **Loop infinito ou falha silenciosa:** o modelo encadear chamadas de tool sem fim ou continuar após truncamento (`max_tokens`) ou erro não retentável (`RF-017`, `RF-019`, `RF-020`).

## Decisão
1. **Modelo e chamada (`RF-017`, `RF-024`):**
   - O agente roda numa função **AWS Lambda** (`03-mcp-regras-cdb-agente`, Node.js 22, `arm64`, fora de VPC), invocada por chamada assinada (`AWS_IAM`), que recebe `{ pergunta, contexto_autenticado: { atendente_id, cliente_id? }, data_referencia? }`.
   - Chama o **Claude Haiku 5.5** via `bedrock-runtime` (`ConverseCommand`), passando sempre:
     - `modelId` = `perfil_inferencia_arn` lido do parâmetro SSM `/00-plataforma-agentes/contrato/v1/produtos/03-mcp-regras-cdb`;
     - `guardrailConfig` = `{ guardrailIdentifier: guardrail_id, guardrailVersion: guardrail_versao, trace: "enabled" }` (com o tópico negado `"recomendação de investimento personalizada"` configurado por `D03-P6 = A`, D-071, e sem gravar o trace bruto nos logs para não vazar texto sem máscara, `RF-011` da plataforma);
     - `inferenceConfig` = `{ maxTokens: 1024, temperature: 0 }`.
2. **Injeção de `cliente_id` pelo contexto autenticado (`RF-021`, `D03-P2 = A`):**
   - Na definição da tool `consultar_aplicacoes_cliente` exposta ao modelo no `toolConfig` do `Converse`, o parâmetro `cliente_id` **não é escolhido livremente pelo modelo**: quando o modelo solicita `consultar_aplicacoes_cliente`, o adaptador do agente sobrescreve/injeta obrigatoriamente `cliente_id = contexto_autenticado.cliente_id` antes de enviar o `tools/call` ao gateway MCP (e se o atendimento não tiver `cliente_id` autenticado no canal, recusa localmente e escala com `handoff_humano`). Assim, mesmo que um prompt malicioso peça `"consulte o CLI-000104"`, a chamada real ao gateway sempre usa o `cliente_id` autenticado do canal (`CLI-000101`).
3. **Controle estrito do loop por `stopReason` com limite de 6 chamadas de tool (`RF-017`, `E14`):**
   - Contador `chamadas_tool_no_turno` limitado a **6**; se o modelo pedir uma 7ª chamada, o agente interrompe imediatamente e devolve `handoff_humano` com `motivo: "limite_de_chamadas"`.
   - Tratamento exaustivo de `stopReason` da API `Converse`:
     - `"tool_use"`: executa a(s) tool(s) via gateway MCP (assinando com SigV4 da role do agente e enviando `MCP-Protocol-Version: 2026-07-28`);
     - `"end_turn"`: submete o texto final ao **verificador determinístico** (`RF-018`);
     - `"guardrail_intervened"` ou `"content_filtered"`: encerra sem retentar e retorna a categoria `guardrail_entrada` ou `guardrail_saida`;
     - `"max_tokens"`: encerra e retorna `handoff_humano` com `motivo: "resposta_truncada"`;
     - `"stop_sequence"` ou qualquer valor futuro/desconhecido: falha fechada para `handoff_humano` com `motivo: "parada_inesperada"`.
4. **Verificador determinístico de números e citações `id@versao` com no máximo 1 correção (`RF-018`):**
   - Antes de devolver uma resposta com `end_turn`, o módulo `verificador-resposta` extrai todos os números monetários (`R$ X`, decimais), percentuais (`X%`) e contagens de dias do texto final, bem como todas as citações no padrão `[a-z0-9-]+@[0-9]+\.[0-9]+`.
   - **Regra:** se a resposta contiver qualquer número, (a) deve haver pelo menos um par `id@versao` que pertença ao conjunto `regras_aplicadas` / regras retornadas pelas tools no mesmo turno, e (b) todo número da resposta deve existir no conjunto de números retornados pelas tools no mesmo turno (incluindo os argumentos normalizados devolvidos por `simular_resgate` e `verificar_aporte`, `RF-007`).
   - Se a verificação falhar, o agente faz **no máximo 1 chamada extra** ao `Converse` anexando a lista exata de números/citações ausentes ou não autorizados; se falhar de novo, retorna `handoff_humano` com `motivo: "verificacao_citacao_numeros_falhou"`, sem jamais entregar número não verificado ao atendente.
5. **Classificação de erros em 3 camadas e falha fechada (`RF-019`, `RF-020`):**
   - Camada 1: regras específicas do `mapa_erros` do contrato `comum` da plataforma (`politica_negada`, `requer_aprovacao_humana`, `guardrail_entrada`, `guardrail_saida`, `autenticacao`, `limite_taxa`, `alvo_indisponivel`, `falha_transitoria`), sem a linha genérica `erro_desconhecido`;
   - Camada 2: categorias de tool da D03 (`entrada_invalida` → 1 tentativa de correção pelo modelo; `fora_da_cobertura` → escala; `dados_indisponiveis` → retentativa exponencial 1, 2 e 4 s até 3 vezes; `interno` → escala);
   - Camada 3: qualquer `isError: true` ou falha não casada cai em `erro_desconhecido` (não retentável) e escala para `handoff_humano`.

## Alternativas rejeitadas
- **Confiar apenas em instruções no system prompt ("nunca faça contas e sempre cite a regra"):** LLMs podem ignorar instruções sob pressão de prompt; o verificador determinístico (`RF-018`) transforma a regra em gate programático (tarefa 1.4 e 4.4 da prova).
- **Passar `cliente_id` no system prompt e pedir ao modelo para copiá-lo na tool:** vulnerável a prompt injection que convença o modelo a preencher outro `cliente_id`.
- **Usar Claude Sonnet 5.5 como modelo único do perfil:** a tarefa do agente é orquestrar 4 tools determinísticas bem descritas e formatar a explicação citando `id@versao`; o **Claude Haiku 5.5** reduz o custo de tokens em 20x e a latência, enquanto toda a precisão matemática e normativa já está nas tools e no verificador determinístico.

## Trade-offs
- **Ganho:** zero risco de número inventado chegar ao usuário, imunidade técnica contra troca de `cliente_id` por prompt injection e custo de inferência inferior a US$ 0,15 no dia de demonstração.
- **Perda:** uma resposta do modelo que parafraseie um número arredondando-o para valor diferente do retornado pela tool aciona a retentativa de correção do verificador (1 chamada adicional) ou escala para humano.

## Custo
Incluso na linha de inferência do Claude Haiku 5.5 e do Bedrock Guardrails (`plan.md`, seção "Custo do lab").

## Risco
- Falso positivo no extrator de números do verificador (por exemplo, números que fazem parte do código `id@versao` ou de datas `AAAA-MM-DD`). Mitigado removendo primeiro os identificadores `id@versao`, `CLI-xxxxxx`, `APL-xxxx-xxx` e datas ISO `AAAA-MM-DD` antes de comparar os valores monetários, percentuais e de dias contra os números das tools (coberto por testes unitários `UT`).

## Tarefas da prova exercitadas
- **1.1 e 1.4:** loop de agente controlado por `stopReason` com teto de iterações, gate programático de verificação e handoff humano.
- **4.4:** validação determinística da saída com retentativa guiada pelo erro.
- **5.2 e 5.3:** escalonamento estruturado (`handoff_humano`) e classificação/propagação de erros em camadas.

## Curso Skilljar relacionado
*Building with the Claude API*, *Claude with Amazon Bedrock* e *Introduction to Model Context Protocol*.

## O que um arquiteto sênior faria em produção
Adicionaria cache de prompt (`cachePoint` no system prompt e nas definições das 4 tools) quando o volume diário superasse milhares de chamadas por hora, e registraria métricas EMF específicas para a taxa de acionamento da retentativa do verificador (`RF-018`) para calibrar o prompt do sistema.
