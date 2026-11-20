# ADR 0011 · Entrada do motor de política: anulável no `gateway`, obrigatória no `observabilidade` e no `contrato`

- **Status:** aceito. É decisão técnica delegada dentro do plano aprovado (D-033, D-038) e corrige o achado A03 da análise 1.
- **Data:** 2026-11-20
- **Requisitos:** RF-002 (`ENFORCE` por padrão), RF-007 (motor no contrato), RNF-007; ADR-0005 e ADR-0009

## Contexto
O plano descreve a entrada do motor de dois jeitos:
- **"Stack da plataforma":** o id e o ARN do motor entram no `gateway`, no `observabilidade` e no `contrato` como "entradas de composição obrigatórias".
- **"Estratégia de testes" (emenda 1) e ADR-0009:** o root do Floci compõe o gateway sem o motor.

Se a entrada for obrigatória no `gateway`, o root do Floci precisa passar um ARN. O gateway do emulador apontaria então para um motor que não existe:
- se o Floci validar o ARN, o apply falha;
- se não validar, o teste afirma uma associação falsa.

A T013 dizia só "variável de composição", sem escolher, e essa escolha muda os testes da T013 e o root da T080.

## Decisão
- **No `gateway`, a entrada `motor_politica_arn` é anulável (padrão `null`).** O bloco `policy_engine_configuration` é `dynamic`: existe quando o ARN vem preenchido, com `mode = var.modo_politica`, e some quando vem nulo.
- **No `observabilidade` e no `contrato`, o id e o ARN são obrigatórios, sem padrão.** No root real, vêm do módulo `politica`. No root do Floci, vêm de valores sintéticos fixos, como a emenda 1 já decidiu.
- **Quem garante o valor no root real é o TT-P01** (`tests/composicao.tftest.hcl`, T015 e T020). Ele afirma `length(policy_engine_configuration) == 1`, com `mode = "ENFORCE"`, e que o ARN vem de `module.politica`.
  - Um root real que passe nulo reprova.
  - Para provar isso, uma fixture de root com nulo precisa reprovar o TT-P01. Esse é o teste vermelho da T015.
- **O root do Floci passa nulo ao `gateway`.** O relatório da T080 registra a ausência do motor como lacuna, com o link do ADR-0009.

## Alternativas rejeitadas
- **Obrigatória também no `gateway`, com ARN sintético no Floci:**
  - associa o gateway emulado a um motor inexistente;
  - o resultado depende de o emulador validar ou não o ARN, e não do código;
  - é o mesmo erro do "modo emulador" rejeitado no ADR-0009, só que ao contrário.
- **Anulável em todos os módulos:** o contrato e os alarmes poderiam nascer sem o motor no root real. O schema do contrato exige os dois campos (emenda 1), então o erro só apareceria no consumidor.
- **Variável booleana `com_motor`:** são duas entradas para um fato só, e as duas podem divergir.

## Trade-offs
- **Ganho:** contrato explícito por entrada. Fica claro quem garante o valor (o TT-P01 no root real), e o root do Floci não inventa uma associação.
- **Custo:** a proteção do root real passa a depender de um teste de composição, e não do tipo da variável. Mitigação: o teste é obrigatório no CI do projeto (T002) e tem teste vermelho próprio.

## Custo
US$ 0.

## Risco
- **Alguém compõe outro root real sem o TT-P01:** o gate de recursos brutos (TH-04) limita os roots com gateway a `plataforma/agentes/infra/terraform/`, e o TT-P01 roda nesse root.
- **O texto do plano** ("Stack da plataforma", 1º item) ainda diz "obrigatórias" também para o `gateway`. A frase será acertada na próxima emenda do plano. Até lá, valem este ADR, o ADR-0009 e a "Estratégia de testes", que concordam.

## Tarefas da prova
- 2.1: interface de módulo com contrato explícito por entrada, como a descrição de uma tool diz o que é obrigatório.
- 3.6: teste determinístico no CI garante a composição, sem serviço real.
- 5.6: a lacuna do emulador fica declarada, sem um valor inventado.

## Curso Skilljar relacionado
Claude Code in Action: testes e verificação no fluxo de CI.

## Em produção, um arquiteto sênior faria
- Publicaria os módulos num registro privado, com contrato de entrada versionado e testes de contrato do consumidor.
- Usaria uma conta de sandbox efêmera, em vez de emulador, para provar a associação real com o motor.
