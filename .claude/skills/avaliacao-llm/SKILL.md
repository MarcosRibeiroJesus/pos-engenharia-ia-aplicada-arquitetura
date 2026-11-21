---
name: avaliacao-llm
description: Avaliações e red team de componentes com LLM (D02 assistente de agendamento, D03 MCP, componente Claude de cada projeto). Use para golden set, critérios mensuráveis, gate no CI com respostas gravadas, prompt injection e calibração com revisão humana.
---

# Avaliação de LLM

## Onde roda a avaliação da D02, o assistente de agendamento (D-048)
- **Gate no CI:** respostas gravadas e critérios explícitos. É o que bloqueia o merge.
- **Traces:** vão para o **Langfuse Cloud, plano Hobby** (gratuito, 50 mil unidades por mês, 30 dias de dados), e não para um Langfuse na AWS.
  - Só dados sintéticos, porque os traces saem da AWS.
  - Chaves `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` e `LANGFUSE_HOST` no ambiente ou nos secrets. Quem cria é o dono.
  - **Fallback seguro:** sem as chaves, o tracing fica desligado e o gate do CI continua valendo.
- Langfuse hospedado na AWS fica fora, por custo: cerca de US$ 12 por dia de demonstração, mais da metade do limite mensal.

## Golden set
- Arquivo versionado com casos: entrada, saída esperada (ou critérios) e categoria. As categorias são: feliz, limite, ambíguo, adversarial e fora de escopo.
- **Critérios mensuráveis** (4.1): campo correto, ação correta, recusa correta, latência e custo. Nada de "parece bom".
- **Dados só sintéticos.** Cada caso cita o requisito da spec que cobre.

## Execução
- **No CI:** respostas gravadas e asserts determinísticos. É o gate de regressão (D-006).
- **Fora do CI**, só com aprovação do dono, porque chama modelo e tem custo: rodada com o modelo real para renovar as gravações.
- **Rodada real paga para medir acerto e custo** (D-062): o dono autorizou uma por projeto, com teto por execução de **US$ 20** (D-068, valor definido pelo dono). Esse valor é o teto máximo: o plano propõe o custo estimado da rodada, que deve ficar abaixo dele, e o relatório informa o custo medido. Passou do teto, a rodada para. O teto vale por execução e não eleva o limite mensal da conta (US$ 20, D-022): rodada e demonstrações do mês somam nesse limite.
- **Juiz por modelo:** só para critérios que não dá para medir com código, em instância separada do autor (4.6), com rubrica escrita e exemplos.

## Red team (mínimo)
- Prompt injection direta e indireta (no dado de entrada, no resultado de tool, na descrição de tool MCP).
- Pedido fora de escopo, vazamento do prompt de sistema e tentativa de ação sem aprovação humana (1.4).
- Exfiltração de dado por tool e loop de tool sem fim.

Resultado esperado de cada ataque: **nenhum efeito** e o evento registrado.

## Calibração e escalonamento (5.5, 5.2)
- Defina o limiar de confiança que manda para humano e meça falso positivo e falso negativo no golden set.
- Mudou prompt, modelo ou tool: rode o golden set de novo antes do merge.

## Skill de mercado complementar
`promptfoo@promptfoo`, plugin oficial: `promptfoo-evals`, `promptfoo-redteam-setup` e `promptfoo-redteam-run`. Use-a quando o projeto adotar o promptfoo. Ferramenta e hospedagem de observabilidade (ex.: Langfuse) são decisão do dono.
