# Memória compartilhada: estado atual

Lido no início da sessão e quando muda; prevalece sobre briefings e branches. Porquês em `HISTORICO.md` (ids D-xxx). Teto: 8 KB (`harness/memoria.py auditar`, D-079).

## Projetos

| Disciplina | Arquitetura AWS | IA aplicada | Cloud comparativa | Teto (custo de 1 dia) |
|---|---|---|---|---|
| D01 Fundamentos | Recomendação de e-commerce (PR #1), em desenvolvimento (D-064) | Doom, opção 04-C (D-059, fiel à aula: YOLO em TF.js num Web Worker + calibrador com gate humano) + 2ª estratégia comparativa Jev + Astra / Sistema 1+2 com provider plugável (D-078) | GCP | calcular no plano |
| D02 APIs de IA generativa | Assistente de agendamento completo: emendar plano para consumo completo da plataforma (D-074, opção B do ADR-0003) | pendente (100% alinhado às aulas, D-074) | GCP | US$ 0,85 por dia (D-070) |
| D03 MCP | MCP de regras do CDB com liquidez diária; consumo 100% da plataforma (D-074); plano e análise aprovados (D-073, PR #46), fase implementar | pendente (100% alinhado às aulas, D-074) | Azure | US$ 0,50 por dia (D-073) |
| D04 Agentes autônomos | adiada | adiada | — | — |

## Regras ativas

### Delta ativo (ainda não absorvido no `main`)
- **Compactação da memória** (D-079): `DECISOES.md` traz por extenso só `Projetos`, `Pendências` e este delta; decisões já no `main` ficam no índice abaixo (teto 8 KB em `memoria.py auditar`, branch `harness/compactar-memoria-compartilhada`).
- **01-doom: 2ª estratégia Jev + Astra (Sistema 1 + 2) com provider plugável** (D-078): mantém `01-doom` principal 100% fiel à aula (YOLO em TF.js num Web Worker + calibrador com gate humano, D-059/D-074) e adiciona **Jev + Astra** como 2ª estratégia comparativa no mesmo projeto (`.env` local, fallback `Claude Haiku/Opus` e replay gravado no CI; PR `docs/d078-doom-jev-astra`).
- **D01 (recomendação, PR #1 fora do `main` — D-031, D-051 a D-057, D-074):** trocar tag `project` de `recsys` para `01-recomendacao`; lote sintético (2 jobs Glue + XGBoost pequeno); MWAA em janela de 2–3 h (`prazo_horas` curto); guardrail sem tópicos extras; publicar página, post AWS e relatório; permissões Bedrock via `registro-produto`; alvo + política Cedar no gateway (D-074); teto `US$ 7,10`/dia com destroy em cascata.
- **D02 (assistente de agendamento — delta sobre `specs/02-assistente-agendamento/`):** emendar `plan.md` da opção A (D-070) para opção B — consumo 100% da plataforma no Gateway MCP + Cedar (D-074); Budgets diário (D-021); permissions boundary na role da conta após P00-P2 (T210 pendente, brecha aceita até lá, D02-P6) e troca de `PowerUserAccess` por política do Access Analyzer/CloudTrail no 1º deploy real no teto (T211 pendente, D02-P7).
- **00-plataforma-agentes (T032):** conferir que `bedrock:InvokeModel` cobre Converse (`bedrock:Converse` não existe no IAM); sem `Principal "*"` nem `*`/`?` em conta (D-044, ADR-0014).

### Já aplicadas no `main` (índice — detalhes em `AGENTS.md`, `CLAUDE.md`, `specs/` e `HISTORICO.md`)
- **Specs no `main`:** `00-plataforma-agentes` (`D-034`/`D-035`/`D-038`–`D-040`, US$ 1,20/dia, tag sem 48h, Transaction Search, alarmes) → `specs/00-plataforma-agentes/`; `02-assistente-agendamento` (`D-048`/`D-070`, US$ 0,85/dia, 400k tok, Langfuse Hobby sintético) → `specs/02-assistente-agendamento/`; `03-mcp-regras-cdb` (`D-011`/`D-071`–`D-074`, HTTP stateless `2026-07-28` + lane `2025-11-25`, regras JSON, `consultar_aplicacoes_cliente`, `leitura_publica` v1.x, US$ 0,50/dia, 300k tok, legendas U04–U08 na IA aplicada) → `specs/03-mcp-regras-cdb/`.
- **Privacidade e dono:** `D-001` (privacidade), `D-004`/`D-014` (dono vs. delegadas), `D-006` (Claude gravado), `D-009`/`D-074` (1 arq. AWS 100% plataforma + 1 IA aplicada 100% aula), `D-036`/`D-041`/`D-050` (boa prática, pergunta no chat, código com nome), `D-069` (sem link de sessão) → `AGENTS.md` §2 e `CLAUDE.md`.
- **SDD, agentes e CI:** `D-016`–`D-019`/`D-026` (SDD, `AGENTS.md`, cota, especialistas), `D-025` (`Aplicado em:` + `auditar`), `D-027` (`VERSAO.md`), `D-030` (`novo_projeto.py`), `D-033`/`D-055` (`aprovar-plano` e disparos até `planejar`), `D-043` (`test_<assunto>.py`), `D-045`/`D-046` (orquestrador e escrita segura), `D-047`/`D-075` (`executar-tarefas` + CodeRabbit), `D-049` (marketplaces), `D-060`/`D-064` (pausa), `D-077` (DAST ZAP após 3 respostas) → `AGENTS.md` §3–8, `CLAUDE.md` e `seguranca.yml`.
- **Git, tokens e FinOps:** `D-002`/`D-028`/`D-058`/`D-067` (Opus/Sonnet/Haiku, Pro, `rtk` + `headroom` local), `D-012`/`D-013` (vars/secrets e `FLOCI_IMAGE`), `D-015`/`D-076` (gate de memória, 4h e 230k), `D-032`/`D-061` (branch mergeado/defasado), `D-062`/`D-068` (GCP D04–D07, rodada paga US$ 20, merge do dono), `D-063`/`D-065`/`D-066` (Terraform nuvem, âncoras AWS, 1 sessão por vez D02→D03→D01), `D-021`–`D-024` (demo 1 dia, Budgets diário e US$ 20/mês, `prazo_horas` 6h/24h, `aws-lab-destroy`), `D-029`/`D-031`/`D-037` (ABAC, tags, página da plataforma) → `AGENTS.md` §4–9 e `CLAUDE.md`.

## Pendências (aguardando o Marcos; não trate como decidido)
- Conversa de orquestração: o Marcos respondeu "Outra conversa"; o id dela ainda não foi informado, então nenhuma gravação de orquestração sai até o id (sem id ainda).
- Níveis de risco da revisão (D-075): 4 níveis aprovados em princípio; falta definir como aplicar cada nível ao CodeRabbit. Pendente até o Marcos decidir.
- Medição automática do transcript para o reinício da orquestração em 230 mil tokens (D-076): pendente de construção.
- SonarQube (D-075): depois, com a conta e o token criados pelo Marcos.
- D02: a 2ª pergunta da sessão D02 não foi localizada; o dono a dispensou em 2026-11-21, sem decisão (ver D-070).
- Configuração da conta do Marcos para o destroy automático (D-024):
  - criar o ambiente `aws-lab-destroy` sem aprovação e restrito ao `main`;
  - incluir o subject `repo:<dono>/<repo>:environment:aws-lab-destroy` na confiança OIDC da role de deploy na AWS.
- Projetos de IA aplicada da D02 e da D03.
- Revisores de IA na esteira: o Marcos escolheu a assinatura (D-028). Falta ele criar o secret com o token da assinatura (`claude setup-token`). Conta AWS com OIDC: criar quando o primeiro produto estiver pronto (P00-P2).
- Configurações do GitHub ainda abertas: ruleset do `main`. Já feitas pelo Marcos: variável `FLOCI_IMAGE`, secret `INFRACOST_API_KEY`, Dependency graph e proteção do branch `memoria-compartilhada`. Use `vars.FLOCI_IMAGE` e não escreva `floci/floci:latest` nos workflows (D-012, D-013).
- Merges: até o #20, mais o #12 (painel) e o #19 (Dependabot), já mergeados. O #21 (actions dos modelos) também foi mergeado. Falta o PR da D-033 (delegação dentro do plano aprovado). O #1 (D01) voltou a andar (D-064); os PRs de opções #2 a #8 continuam rascunho. Abertos para revisão: #38 (gate de branch defasado, D-061) e #39 (pausa e Doom, D-059 e D-060).
