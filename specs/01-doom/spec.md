# Spec: Doom com detecção YOLO no navegador

- **Projeto:** `01-doom` · **Disciplina:** 01 (Fundamentos de IA e LLMs para Programadores), unidade 04 · **Tipo:** ia-aplicada
- **Status:** rascunho
- **Artigos da constituição que se aplicam:** I (SDD), II (decisões do dono), III (testes primeiro e respostas gravadas), IV (segurança: site privado, telemetria como entrada não confiável), V (custo: teto de um dia e destroy), VI (operável: tags, logs e alarmes), VIII (proveniência: licenças e fontes com data)
- **Decisões da memória que esta spec usa:** D-059 (opção 04-C sobre a versão fiel à aula, Doom com rótulos do motor), D-060 (Doom como único projeto da D01 por ora), D-074 (IA aplicada 100% alinhada às aulas), D-078 (2ª estratégia Jev + Astra com provider plugável), D-055 (disparos de especificar e planejar livres)

## Problema e objetivo

**O que existe hoje.** A unidade 04 da disciplina 01 ensina inferência de visão no cliente: um detector YOLO já treinado por terceiros, convertido para TensorFlow.js, roda num Web Worker, filtra detecções por um limiar fixo de confiança e devolve o centro da caixa, que move a mira de um jogo no navegador. O jogo da aula é Duck Hunt. A aula não ensina treino, aprendizado por reforço nem nuvem.

**O tema da unidade é outro.** A unidade trata de usar IA para executar os movimentos e as ações necessárias para vencer um jogo, sem intervenção humana. O jogo de tiro com patos é só o exemplo da aula. Este projeto aplica o mesmo tema ao Doom: a IA percebe os monstros na tela, decide e age sozinha, sem nenhum comando humano durante a partida. A aula não ensina a reproduzir o exemplo; o aluno deve aplicar a técnica a outro jogo.

**O que o projeto muda.** O jogo passa a ser Doom, com assets Freedoom, e os rótulos para medir o detector vêm do próprio motor do jogo (D-059). A decisão de arquitetura da unidade deixa de ser uma constante e passa a ser medida: o limiar de confiança é calibrado sobre a telemetria de partidas, e uma proposta do Claude só entra em uso depois de aprovação humana (opção 04-C, construída sobre a versão fiel à aula, 04-A). Além disso, a arquitetura híbrida Jev + Astra entra como segunda estratégia de comparação, sob o mesmo contrato (D-078). A estratégia principal continua sendo a da aula.

**Para quem.** O dono do curso (para avaliar a decisão de calibrar o limiar) e quem visita o site para jogar e ver como a IA decide.

**Como sabemos que deu certo.**
- A estratégia principal roda no navegador sem nenhuma inferência no servidor, com o modelo e o jogo servidos como ativos estáticos.
- O calibrador mostra, sobre partidas separadas, se o limiar proposto perde menos disparos e erra menos em falso do que a linha de base (o melhor limiar da varredura).
- As duas estratégias (principal e Jev + Astra) rodam no mesmo conjunto de partidas gravadas e geram o mesmo tipo de relatório.

## Histórias de usuário

- **H1.** Como visitante, quero ver a IA zerar uma fase de Doom sozinha, sem nenhum comando humano, para ver o tema da unidade aplicado a outro jogo.
  - Dado a página aberta com o agente carregado, quando eu inicio a fase, então o agente percorre a fase, mira, atira e chega à saída só com as ações dele, e o log registra cada ação.
- **H1b.** Como dono do projeto, quero que a conclusão da fase seja medida, para saber se o agente zera de forma repetível.
  - Dado a mesma semente de fase em N execuções, quando o agente roda, então a taxa de conclusão e o tempo até a saída são reportados. N e a meta de taxa são fixados no plano.
- **H2.** Como dono do projeto, quero que uma proposta de limiar de confiança seja mostrada com evidências e aprovada por mim antes de valer, para que nenhuma mudança entre em produção sem decisão humana.
  - Dado uma proposta do Claude que cita quadros inexistentes, quando o gate roda, então a proposta é rejeitada e nada é gravado.
  - Dado uma proposta válida, quando eu não aprovo, então o limiar vigente não muda.
- **H3.** Como dono do projeto, quero comparar a estratégia Jev + Astra com a principal nas mesmas partidas, para decidir com dados se a arquitetura híbrida vale o custo.
  - Dado o mesmo conjunto de partidas gravadas, quando as duas estratégias rodam, então o relatório mostra, para cada uma, disparos perdidos, disparos em falso e latência por quadro.
- **H4.** Como operador, quero subir a parte AWS para uma demonstração e destruí-la no mesmo dia, para que o custo fique dentro do teto.
  - Dado o apply executado, quando o prazo de vida vence sem destroy manual, então o workflow de destroy roda e não sobra recurso com a tag `project` do projeto.

## Requisitos funcionais

**Jogo e detector (fiel à aula, estratégia principal)**
- **RF-001:** o jogo DEVE rodar no navegador usando somente assets Freedoom. Nenhum arquivo do jogo original pode estar no repositório, no build ou no site. O código do port de Doom (D01-P2) fica no repositório, com a licença GPL-2.0 e o aviso de modificação. Aceite: a verificação de ativos do build lista só arquivos Freedoom e código com licença registrada no ADR.
- **RF-002:** a thread principal DEVE apenas capturar o canvas e enviá-lo ao Web Worker. Aceite: um teste de instrumentação mostra que a chamada de inferência acontece só dentro do worker.
- **RF-003:** o worker DEVE carregar o detector YOLO em TensorFlow.js com o arquivo de rótulos, baixado de fonte pública no build com licença conferida e registrada em ADR (D01-P3 = A; nenhum arquivo do curso entra no repositório), redimensionar a imagem para a entrada do modelo, normalizar, inferir, filtrar por confiança e classe, converter as coordenadas para a tela e devolver o centro da caixa. Aceite: com uma imagem sintética de posição conhecida, o centro devolvido está a no máximo 2 px da posição esperada.
- **RF-004:** o limiar de confiança inicial DEVE ser lido da configuração vigente, com valor de partida 0,40, e nunca ficar fixo no código. Aceite: trocar o valor na configuração muda o filtro sem alterar código. Os valores da aula (limiar de 40%, entrada 640×640, ~8 MB, classe "kite") não são fatos a reproduzir: o dono respondeu que só importa a ideia (D01-P4). Eles viram parâmetros de configuração, com o valor do modelo escolhido no plano.
- **RF-017:** o agente DEVE concluir uma fase (escopo escolhido pelo dono em 2026-11-26; a fase exata, como E1M1, é fixada no plano) sem nenhuma intervenção humana durante a partida. Aceite: a conclusão é detectada pelo próprio jogo (saída da fase), e o log de entradas da partida só tem entradas do agente.
- **RF-018:** o agente DEVE executar mirar, atirar, andar e navegar (chaves, portas e itens) para chegar à saída. Aceite: cada ação tem registro com o quadro e a decisão que a causou, para que a partida possa ser auditada.
- **RF-019:** o agente decide com duas fontes declaradas (D01-P7 = pixels e estado do motor): a imagem da tela pelo detector, e o estado do motor (posição, vida, mapa) exposto pelo port. Aceite: o log de cada partida diz, por ação, qual fonte a fundamentou. Nenhuma ação usa estado que não esteja nessa lista.
- **RF-005:** ao fim de cada partida, o navegador DEVE enviar a telemetria em lote com, por quadro: todas as detecções (inclusive as abaixo do limiar), com classe, confiança e caixa; o disparo; o resultado; e os rótulos do motor do jogo. Aceite: a telemetria de uma partida gravada reproduz, quadro a quadro, o número de detecções registrado.

**Calibrador do limiar (opção 04-C)**
- **RF-006:** um código DEVE varrer limiares sobre a telemetria e calcular, por fase do jogo, os disparos perdidos e os disparos em falso, medidos contra os rótulos do motor. Aceite: com telemetria sintética de gabarito conhecido, a varredura devolve o limiar ótimo esperado.
- **RF-007:** o Claude DEVE propor um limiar por `tool_use` com schema fixo (`limiar`, `fases`, `evidencias`, `sem_evidencia`), a partir da tabela da varredura e de uma amostra de quadros. Aceite: a resposta sem `tool_use` válido aciona nova tentativa, até o limite da RF-008.
- **RF-008:** um gate programático DEVE rejeitar a proposta que (a) saia dos limites fixos do limiar, (b) cite quadro ou partida que não existem na telemetria ou (c) não traga evidência. "Sem evidência" é resposta válida e não altera nada. Aceite: os três casos de rejeição têm teste com respostas gravadas e a retentativa para na tentativa de número fixo.
- **RF-009:** a proposta aprovada por um humano DEVE ser o único caminho para gravar o limiar vigente. A aprovação entra pelo task token do fluxo de aprovação, pela CLI ou pelo console da AWS, sem endpoint público. Aceite: nenhuma função além da aprovação escreve o limiar vigente (teste de permissão no IAM e teste do fluxo com resposta humana simulada).
- **RF-010:** o limiar aprovado DEVE ser publicado em um arquivo de configuração no bucket privado do site e lido pelo worker na partida seguinte. Aceite: depois da publicação, a partida nova lê o valor aprovado; a partida em andamento não muda de limiar.
- **RF-011:** o ganho da proposta do Claude só conta se ela superar a linha de base (o melhor limiar da varredura) em partidas separadas das usadas na varredura. Aceite: o relatório mostra os dois conjuntos de partidas e a métrica, e a proposta sem ganho deixa o componente só como explicação.
- **RF-012:** uma amostra das propostas DEVE ser revisada por um humano, e a concordância entre humano e proposta DEVE ser registrada. Aceite: o relatório traz a concordância e o tamanho da amostra.

**Relatório pós-partida (herdado da 04-A)**
- **RF-013:** ao fim da partida, o Claude DEVE gerar um relatório com fases em que o detector errou, causas prováveis e evidências com o id do quadro, por `tool_use` com schema. Um validador DEVE rejeitar evidência que não exista no lote, com retentativa até o limite. O campo "incerto" é obrigatório quando a telemetria não cobre a afirmação. Aceite: testes com respostas gravadas cobrem evidência válida, evidência inexistente e afirmação sem cobertura.

**Estratégia comparativa Jev + Astra (D-078), adiada pelo dono (D01-P1 = C)**
- **RF-014:** a estratégia Jev + Astra DEVE implementar o mesmo contrato da estratégia principal: recebe o estado do jogo e devolve a ação de mira e disparo. Ela é composta por um Sistema 1 reativo, de baixa latência, e um Sistema 2 assíncrono, que planeja em segundo plano sobre um estado estruturado. Aceite: as duas estratégias passam pelos mesmos testes de contrato.
- **RF-015:** os provedores de Jev e Astra DEVEM ser plugáveis. Com chaves no `.env` local, usam os modelos Jev e Astra. Sem chaves, usam o fallback Claude (Haiku ou Opus). No CI, usam replay gravado. Aceite: o CI roda sem nenhuma chave e sem chamada de rede a provedor externo.
- **RF-016:** a comparação DEVE rodar as duas estratégias sobre o mesmo conjunto de partidas gravadas e reportar disparos perdidos, disparos em falso e latência por quadro (p50 e p95). Aceite: o relatório traz os dois conjuntos de números lado a lado, com as partidas usadas.

## Requisitos não funcionais

- **RNF-001** (segurança, Art. IV): o bucket do site tem os quatro bloqueios de acesso público ligados e é servido só pelo CloudFront com origin access control. A API de telemetria aceita apenas o schema fechado, com limite de tamanho e limitação de taxa no API Gateway. A credencial de convidado do identity pool só envia telemetria. Dados criptografados em repouso (KMS) e em trânsito (TLS). Nenhum segredo no repositório. Cada tabela de telemetria é lida só pela função de calibração.
- **RNF-002** (custo, Art. V): teto diário = custo estimado de um dia de execução, calculado no plano; sem custo fixo ocioso (sem NAT Gateway, sem cluster ligado, sem endpoint permanente sem ADR). Destroy por workflow sem sobras. Apply com prazo de vida registrado (padrão de 6 horas, teto de 24 horas). O valor do teto é `teto_diario_usd` em `harness/estado.json` e fica em aberto até o plano.
- **RNF-003** (operação, Art. VI): tags `project` (`01-doom`), `module` e `managed-by` (`terraform`) em todos os recursos. Logs, métricas e alarmes nos componentes críticos (telemetria, calibração, aprovação pendente), com aviso ao dono pelo SNS quando uma aprovação estiver pendente.
- **RNF-004** (testes, Art. III): o jogo e o worker são testados fora do Floci, com Playwright. A infraestrutura, com `terraform test`, checkov e tflint. O componente Claude, com respostas gravadas. A integração AWS, no Floci, com o projeto completo. Cada requisito tem linha na matriz regra → teste.
- **RNF-005** (licenças, Art. VIII): antes de publicar, cada dependência (port de Doom, modelo YOLO, Freedoom, TF.js e a biblioteca de jogo) tem a licença conferida na fonte oficial, com data, e registrada em ADR. Nenhum ativo do jogo original é publicado no site.
- **RNF-006** (desempenho): a latência por quadro (p50 e p95) de cada estratégia é medida e reportada em toda execução da comparação. O limite-alvo não é fixado nesta spec e entra no plano.
- **RNF-007** (proveniência, Art. VIII): toda afirmação sobre a aula vem de resumo próprio com a marcação de confirmação. Nenhum trecho de legenda ou material do curso entra no repositório.
- **RNF-008** (reprodutibilidade, Art. VI, pedido do dono em 2026-11-26): qualquer pessoa clona o repositório, roda o jogo no navegador e todos os testes locais sem credenciais (respostas gravadas e replay). Para o que depende da AWS ou do Bedrock, ela insere as próprias credenciais num `.env` local, documentadas no README em no máximo 5 passos. Nenhum valor real de credencial entra no repositório.
- **RNF-009** (consumo da plataforma, D-074 e D01-P5 = B): a parte AWS consome completamente a `00-plataforma-agentes` (Gateway MCP, Cedar em `ENFORCE`, Guardrail, Perfil de Inferência, contrato SSM v1, alarmes no tópico SNS da plataforma e AgentCore Evaluations). Dependência: a plataforma ainda está em implementação (`specs/00-plataforma-agentes/`), e o plano precisa dela pronta ou de uma ordem de entrega.

## Componente Claude e tarefas da prova

Há dois componentes com Claude, ambos chamados via Bedrock (ou API da Anthropic no desenvolvimento local):

1. **Relatório pós-partida** (RF-013). Exercita 4.3 (saída via `tool_use`), 4.4 (validação e retentativa) e 5.6 (proveniência e incerteza). Cenário de referência: extração de dados estruturados. Curso relacionado: *Building with the Claude API* e *Claude with Amazon Bedrock*.
2. **Proposta de limiar com gate humano** (RF-007 a RF-012). Exercita 1.4 (gate programático e handoff para humano), 4.3, 4.4, 5.5 (calibração: a proposta é conferida contra a decisão humana numa amostra) e 5.6. Cenário de referência: extração de dados estruturados, com revisão humana.

**Como são testados.** Com respostas gravadas do modelo: uma resposta válida, uma com evidência inexistente, uma fora dos limites, uma sem `tool_use`, uma sem evidência. O CI nunca chama o modelo real. A retentativa é testada com um número fixo de tentativas. As propostas reais só rodam na demonstração, com teto de chamadas.

**Estratégia Jev + Astra.** O Claude entra como fallback (RF-015). Os modelos Jev e Astra não estão especificados aqui: o contrato do provedor depende da resposta de D01-P1.

## Fora de escopo

- Treino do YOLO do zero, e qualquer aprendizado por reforço ou neuroevolução (a aula não ensina; D-059).
- ViZDoom e treino de PPO (descartados por D-059, porque a aula não os ensina).
- Duck Hunt e o fork da aula (o jogo é Doom).
- Inferência no servidor: a versão 04-B fica como comparação no post, não como implementação.
- LLM multimodal que joga (experimento opcional, sem peso na unidade).
- Publicar qualquer ativo do Doom original.
- Bedrock direto sem a plataforma: descartado pelo dono (D01-P5 = B, RNF-009).
- Jev + Astra nesta rodada (adiada, D01-P1 = C). RF-014 a RF-016 ficam como referência para a próxima rodada.

## Decisões do dono que esta spec usa

- **D-059:** opção 04-C, sobre a versão fiel à aula (04-A); Doom com Freedoom; rótulos gerados pelo motor; o ajuste do YOLO com esses rótulos fica fora da aula.
- **D-060:** Doom é o único projeto da D01 por ora.
- **D-074:** IA aplicada 100% alinhada às aulas. A estratégia principal segue a aula; a 04-C e a Jev + Astra são acréscimos declarados.
- **D-078:** 2ª estratégia Jev + Astra com provider plugável, com chaves locais, fallback Claude e replay gravado no CI.
- **D-055:** a especificação e o planejamento saem sem pergunta a cada disparo; o plano volta ao dono para aprovação.

## Perguntas ao dono

Respostas já dadas no chat em 2026-11-26 (registro; a memória compartilhada ainda não foi gravada):
- **D01-P1 (Jev + Astra): C, adiar.** Só a estratégia principal nesta rodada.
- **D01-P2 (port de Doom): o código fica no repositório e o jogo roda no navegador,** para qualquer pessoa baixar (pedido do dono, 2026-11-26). Substitui a opção B.
- **D01-P3 (modelo YOLO): A,** modelo oficial de fonte pública no build.
- **D01-P5 (plataforma AWS): B,** consumo completo da `00-plataforma-agentes`.

**Pendentes:**
- **D01-P4 (fatos da aula):** resolvida em 2026-11-26. Os valores da aula não são reproduzidos; só a ideia de jogar sozinho.
- **D01-P7 (entradas do agente): pixels e estado do motor** (2026-11-26), RF-019.
- **D01-P6 (onde o jogo é servido): site AWS privado** (2026-11-26), com o build do repositório, reproduzível com a conta de quem clona.
- **Escopo (2026-11-26):** zerar uma fase (RF-017); ações de navegação completa (RF-018). O dono escolheu o conjunto completo, acima da recomendação de mirar e atirar. A dificuldade de navegação fica registrada como risco para o plano.
- **D01-P6 (onde o jogo é servido):** com o repositório público e o jogo no navegador, o site na AWS (S3 e CloudFront) continua? Bloqueia RNF-002, RNF-003 e o plano da parte AWS.

| id | pergunta | bloqueia | opções | recomendação |
|---|---|---|---|---|
| D01-P1 | O que são Jev e Astra, e como cada um recebe o estado e devolve a ação? Quais modelos ou APIs entram no `.env`? | RF-014 e RF-015 (contrato do provedor), o plano da 2ª estratégia e o teto de custo dela | A) APIs externas Jev e Astra, com chaves no `.env`, fallback Claude e replay no CI. B) Sistema 1 e Sistema 2 implementados só com Claude (Haiku e Opus), sem Jev e Astra. C) Só a estratégia principal nesta unidade, Jev + Astra fica para depois | A se as chaves e os contratos já existem; B se a intenção é só o padrão arquitetural. Sem a definição, não dá para escrever o adaptador |
| D01-P2 | Qual port de Doom usar, e aceitar a licença do port modificado? | viabilidade de exportar a posição dos monstros (RF-005, RF-003), o plano e o RNF-005 | A) Port de código aberto em GPL-2.0, publicado modificado com o código (exige publicar o código do port). B) Motor de código aberto com licença mais permissiva, se houver um que exporte a posição dos monstros. C) Não publicar o port modificado: só o gabarito do motor, sem site público | A: é o que a licença do Doom permite com Freedoom, e publicar o código é o custo. Confirmar a viabilidade de exportar posição antes de escolher |
| D01-P3 | Qual modelo YOLO usar? O da aula (formato TF.js, ~8 MB) tem licença a conferir, e um arquivo do curso não pode entrar no repositório. | RF-003, RNF-005 e a publicação do site | A) Baixar o modelo oficial de fonte pública no build, com a licença conferida e registrada. B) Converter um modelo YOLO de licença permissiva, com ADR da troca. C) Usar o modelo da aula só localmente, sem publicar | A ou B; C só se a licença do modelo da aula impedir a publicação. Se for AGPL-3.0, pesa ao servir o modelo num site público |
| D01-P4 | A aula confirma os números do resumo: limiar de 40%, entrada 640×640, modelo de ~8 MB e classe "kite"? | RF-004 e a fidelidade à aula (D-074) | A) Sim, confirmo tudo. B) Não, há valores diferentes (informe no chat) | Confirmar no vídeo antes do plano. O resumo veio de legendas automáticas |
| D01-P5 | A parte AWS deste projeto de IA aplicada consome a `00-plataforma-agentes` (Gateway MCP, Cedar, Guardrail, perfil de inferência) ou chama o Bedrock direto? | RNF-002, RNF-003 e a arquitetura AWS do plano | A) Bedrock direto, com OIDC, tags e perfil de inferência próprio; sem a plataforma. B) Consumo completo da plataforma, como nas arquiteturas AWS (D-074) | A: D-074 separa as arquiteturas AWS (consumo completo) das IAs aplicadas (fiéis à aula). A escolha entre A e B é sua |
