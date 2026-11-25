# Versão do harness

**Versão atual: 0.7.0** (pré-estável). O pacote npx só será criado depois da versão estável e testada (D-027), e publicar é decisão do dono.

## Critérios para a 1.0 (estável e testada)
| # | Critério | Como se prova | Situação |
|---|---|---|---|
| 1 | Fluxo SDD completo em uso real | 1 arquitetura e 1 IA aplicada indo de `especificar` a `publicar` | pendente |
| 2 | Gates estáveis | 3 PRs seguidos de projeto sem correção manual no harness | pendente |
| 3 | Troca de agente exercitada | uma tarefa iniciada no Claude Code e terminada no Antigravity ou no Copilot, registrada em `harness/progresso.md` | pendente |
| 4 | Ciclo de demonstração exercitado | apply → aviso → destroy automático → verificação sem sobras, no Floci e numa conta real | pendente |
| 5 | Caminho padrão exercitado | um projeto novo criado por `harness/novo_projeto.py` chegando a `implementar` | em andamento (`00-plataforma-agentes`) |
| 6 | Núcleo separado da pós | lista dos arquivos do núcleo sem nenhuma referência à pós; o resto é configuração do projeto | pendente |
| 7 | Testes | todo comando dos scripts do harness com teste; estado compartilhado testado em repositório temporário | em andamento (162 testes em `harness/testes`) |
| 8 | Documentação | README do harness com instalação em no máximo 5 passos | pendente |

## Histórico
- **0.7.0:**
  - destroy automático padrão de 6 h após a subida (decisão do dono); o teto de 24 h (D-024) continua valendo para `estender` e para o máximo do apply. `harness/infra.py` e o modelo `harness/modelos/apply.yml` mudam. O workflow real `.github/workflows/*-apply.yml` ainda tem 24 e precisa ser ajustado por revisão humana (as regras proíbem agentes de alterar `.github/workflows/`).
  - hook de 230 mil tokens (D-076) passa a salvar o estado da sessão em `harness/handoff/<sessao>.json` (gitignorado) e a pedir ao dono que decida fechar ou continuar. A memória compartilhada não é escrita pelo hook: só a orquestração grava nela.
  - critérios afetados: 4 (ciclo de demonstração: o prazo padrão muda) e 7 (testes do hook e do prazo).
- **0.6.2:**
  - registro de uso em todo commit (D-074): o `.githooks/pre-commit` inclui sozinho os arquivos novos ou modificados de `harness/uso/` (de qualquer sessão) em todo commit criado por `git commit` (inclusive no fim de merge, cherry-pick e revert com conflito, com `--continue`), só com git e bash, sem nunca bloquear; nos commits que o git cria sem passar por `git commit` (merge, rebase, cherry-pick e revert sem conflito; `git am`; `git pull`), em `git rebase --continue` e com `--no-verify`, o hook não roda e o registro entra no próximo commit; pula em silêncio no commit com caminhos explícitos (índice temporário) e não propaga registro apagado do disco. Testes em `harness/testes/test_uso_em_todo_commit.py`, em repositório temporário, inclusive merge automático, `merge --continue`, `cherry-pick --continue`, `rebase --continue`, commit só com o registro e o `estado.py` real liberando `harness/uso/`.
  - `.gitattributes` com `eol=lf` para `.githooks/*` e `*.sh`: com CRLF no Windows o pre-commit travaria todo commit. Teste em `harness/testes/test_atributos_de_fim_de_linha.py`. Critério 2 (gates estáveis) afetado: a regra que era só convenção no `CLAUDE.md` virou gate programático, e o gate SDD do mesmo hook segue coberto.
  - rtk em todas as sessões por um wrapper que não amplia permissões e headroom só local, com telemetria desligada (D-067, ADR 0004).
- **0.6.1:**
  - gate no CI para branch sem o harness atual da base (`branch_defasado.py`), depois do PR #8, que saiu de um main anterior ao harness e passou por fora dos gates locais. Critério 2 (gates estáveis) afetado: o gate que dependia só do hook local agora também vale no CI.
- **0.5.1:**
  - padrão de tags (D-031);
  - trava de branch mergeado (D-032);
  - correções da esteira nos workflows (ADR 0002 e 0003);
  - actions com um único SHA em workflows e modelos, com teste.
- **0.5.0:**
  - caminho padrão (`novo_projeto.py`);
  - plataforma de agentes compartilhada como projeto SDD;
  - decisões D-027 a D-030 aplicadas.
- **0.4.0:**
  - 18 especialistas por tarefa fim;
  - 14 skills próprias e as skills de mercado como plugins;
  - D-025 com auditoria no CI.
- **0.3.0:**
  - teto de um dia;
  - limite mensal da conta;
  - destroy obrigatório e automático em até 24 h (D-021, D-022, D-024).
- **0.2.0:**
  - troca de agentes (Claude Code, Antigravity, Copilot);
  - memória para qualquer agente;
  - gates no git e no CI.
- **0.1.0:**
  - constituição e SDD obrigatório;
  - estado em arquivos;
  - ritual `retomar` e uso de tokens.
