# ADR-0001: Arquitetura âncora, o agendamento da Natera com Amazon Bedrock AgentCore

- **Status:** aceito quanto à âncora (escolha do dono, D-065); o desenho que segue dela vai na aprovação do plano
- **Data:** 2026-11-21 · **Autor:** arquiteto-aws (Claude Opus 5.5)
- **Âncora:** Cem Onan, Tamara Gagliardi e Veronica Rule, *Natera's intelligent appointment scheduling with Amazon Bedrock AgentCore*, AWS Machine Learning Blog, publicado em **26/08/2026**. https://aws.amazon.com/blogs/machine-learning/nateras-intelligent-appointment-scheduling-with-amazon-bedrock-agentcore/
- **Leitura:** página aberta e lida na íntegra em 2026-11-21 (o corpo do artigo veio pelo download direto da página; a ferramenta de leitura resumida devolvia só o menu). O dono também salvou a página completa fora do repositório, e o texto confere com a leitura. Os autores e a data estão no cabeçalho da página original ("by Cem Onan, Tamara Gagliardi, and Veronica Rule on 26 AUG 2026"); o texto limpo do corpo não traz o cabeçalho. O diagrama da figura 1 foi lido pela legenda e pelo texto alternativo: Twilio, AgentCore Runtime, API de voz em tempo real, AgentCore Memory, Knowledge Bases e um pipeline com Amazon MSK.

## Contexto
A regra do repositório pede uma arquitetura enterprise publicada pela AWS como âncora de cada projeto, com o que foi seguido, o que mudou e por quê. O dono escolheu o caso da Natera para o D02 (D-065) e registrou a diferença principal: a Natera é um agente de voz sem aprovação humana; o nosso é de texto, com cancelamento aprovado por humano (D-008).

## O que a âncora descreve (resumo com palavras próprias)
- **Problema:** pacientes de oncologia marcam coleta de sangue em casa por telefone. Antes, o paciente se autenticava, dava três datas preferidas e um time humano confirmava com os fornecedores.
- **Três princípios:**
  1. ponte com dois WebSockets, um para a telefonia (Twilio) e outro para a API de voz em tempo real, com o orquestrador no meio; cada lado pode ser trocado sem redesenhar o resto;
  2. mascaramento de latência orientado a eventos: durante uma chamada de tool lenta, uma frase curta é gerada pelo Claude Haiku no Bedrock, com gatilho calibrado pela latência mediana de cada tool menos 1 segundo (medida em duas semanas de tráfego nos logs do CloudWatch);
  3. confiança progressiva: sessão inicial identificada pelo hash SHA-256 do telefone como ator no AgentCore Memory; depois da verificação de identidade, nova sessão com o id do paciente e migração do histórico; a sessão anterior é marcada como mesclada.
- **Compute:** migração do Amazon ECS para o AgentCore Runtime (microVMs por invocação), com o estado de sessão externalizado e chaveado por ator.
- **Contexto:** AgentCore Memory com curto e longo prazo (persistência em DynamoDB), eventos de outros canais por Amazon MSK e Lambda, e RAG com Bedrock Knowledge Bases sobre S3, Titan Text Embeddings V2 e fatiamento hierárquico.
- **Segurança:** serviços elegíveis à HIPAA com BAA; Bedrock Guardrails para não ler de volta identificadores sensíveis (número de seguridade social, cartão de crédito, id de seguro); tools com dado pessoal só expostas depois da verificação e restritas à sessão do paciente; escalonamento para humano em sinais de risco (palavrão, angústia, emergência); veredictos determinísticos contra repetição e resposta fora de contexto.
- **Observabilidade:** traces do AgentCore por etapa (tool, inferência, memória). Lição citada: 70% da latência percebida vinha de uma API de fornecedor, e não do modelo.
- **Resultados informados pela empresa** (não são resultados deste projeto): 100% de acerto de tool em 500 simulações de ponta a ponta; latência percebida mediana de 6,8 s (6,2 s na parte do Bedrock); menos de US$ 0,01 por chamada concluída; mais de 90% de acerto de resposta em 200 perguntas; 4.744 chamadas em quatro semanas de produção.

## Decisão: o que seguimos e o que muda
| Aspecto da âncora | Neste projeto | Segue ou muda | Por quê |
|---|---|---|---|
| Orquestrador entre canal e modelo | Lambda `orquestrador` com o grafo LangGraph.js | segue o papel, muda o compute | Um turno de texto dura segundos e não mantém WebSocket. A Lambda escala a zero e é emulada no Floci. O AgentCore Runtime fica como caminho de produção (seção final) |
| Estado externalizado e chaveado por ator | partição `USUARIO#<id>` em DynamoDB, com TTL por tipo de item e direito de apagar | segue o princípio, muda o serviço | A memória precisa de TTL, proveniência e apagamento testáveis com respostas gravadas (ADR-0005) |
| Confiança progressiva | o canal entrega o paciente já autenticado; o gate só age sobre consultas do próprio paciente; `consulta_id` alheio e inexistente recebem a mesma resposta | segue o princípio de escopo, muda o mecanismo | Em texto, a autenticação fica no canal. O princípio da âncora ("o agente não tem meio técnico de buscar dado de outro paciente") vira regra de código (RF-002, RF-010) |
| Guardrails | Bedrock Guardrails do produto mais as camadas próprias medidas pela bateria red team | segue e estende | A âncora usa o guardrail na saída da voz; aqui ele entra no acesso ao modelo (ADR-0002, ADR-0003) e as camadas próprias continuam, porque a garantia não pode depender do filtro |
| Escalonamento para humano por sinais | handoff quando todos os modelos falham; pergunta em vez de ação quando a confiança é baixa | segue | O sinal aqui é a falha ou a incerteza, não a voz do paciente |
| Agendamento confirmado pelo agente | **cancelamento só com aprovação humana** em Step Functions com `waitForTaskToken` | **muda (extensão, D-008)** | Ação destrutiva exige decisão humana auditável. A âncora não tem aprovação humana (ADR-0004) |
| Um provedor de voz e um modelo para frase de espera | **gateway de LLM próprio** com cadeia Haiku → Sonnet, circuit breaker, cota e custo por chamada | **muda (extensão, D-008)** | Disponibilidade e custo viram política testável; a âncora não descreve política de falha do modelo |
| Acerto de tool medido nos traces | **intenção em JSON** por tool com schema estrito, validação semântica e gate determinístico | **muda (extensão, D-008)** | A âncora mede o acerto depois; aqui o erro de campo é barrado antes de virar ação |
| Defesa contra injeção | detector, envelope com nonce, anexos confinados, guarda da memória, canário e respostas por template | **estende (D-008)** | A âncora não trata injeção indireta; num assistente de texto com anexos ela é o risco principal |
| Avaliação por 500 simulações | gate de avaliação com dataset dourado no CI (respostas gravadas) e uma rodada real na demonstração; bateria red team | segue a prática, muda a escala (D-048) | Lab com custo de um dia; o gate protege o pipeline contra regressão |
| Observabilidade por etapa | trilha de eventos do grafo, métricas EMF, X-Ray e Langfuse Cloud opcional | segue | Instrumentar cada etapa é a lição central da âncora (ADR-0006) |
| Ponte de dois WebSockets, frase de espera, MSK, Knowledge Bases | — | fora de escopo | Existem por causa da voz, do omnicanal ou das perguntas frequentes; o D02 é texto e só agenda |

## Alternativas rejeitadas
- **Reproduzir a Natera inteira (voz, AgentCore Runtime e Memory, MSK, Knowledge Bases).** Rejeitada: MSK tem custo por hora de broker, o plano de dados do AgentCore Runtime não é emulado no Floci (cobertura da plataforma, ADR-0009 da `00-plataforma-agentes`) e a voz não é o tema da disciplina.
- **Usar outra âncora (por exemplo, a *Guidance for Multi-Provider Generative AI Gateway on AWS*).** Rejeitada como âncora principal: cobre só o gateway. Fica citada como alternativa no ADR-0002.

## Trade-offs
- Ganho: o projeto exercita exatamente o que a âncora não descreve (aprovação humana, política de falha do modelo, injeção indireta), com custo ocioso quase zero.
- Perda: não demonstra o AgentCore Runtime nem o Memory, que são o centro da âncora. A plataforma compartilhada mostra o AgentCore Gateway e o Policy (ADR-0003).

## Custo
Nenhum custo próprio desta decisão. O custo do dia está no plano.

## Risco
Leitores compararem números: os resultados da Natera (latência, custo por chamada, acerto) não se transferem, porque o canal, o fluxo e o modelo são outros. O post cita os números só como da empresa, com a data.

## Tarefas da prova exercitadas
1.4 (workflow com gate programático e handoff para humano), 2.2 (erros estruturados), 4.3 e 4.4 (saída estruturada e validação), 5.2 (escalonamento), 5.6 (proveniência: afirmações sobre a empresa com fonte e data).

## Curso Skilljar relacionado
*Claude with Amazon Bedrock* e *Building with the Claude API*.

## O que um arquiteto sênior faria em produção
Moveria o orquestrador e a memória para AgentCore Runtime e Memory, como a Natera, pelo isolamento por sessão e pelos traces por etapa; adotaria a confiança progressiva se o canal fosse voz; instrumentaria cada tool antes de otimizar o modelo; e revisaria a conformidade (HIPAA com BAA, ou LGPD no Brasil), que aqui não foi avaliada porque só há dados sintéticos.
