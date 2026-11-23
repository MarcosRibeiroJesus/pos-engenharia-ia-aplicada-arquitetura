# ADR 0004 · rtk e headroom para economia de tokens

- Data: 2026-11-21
- Status: aceito (D-067; adoção pedida pelo dono, desenho delegado)

## Contexto
O dono pediu para instalar e configurar o rtk e o headroom no harness e em todas as sessões. Em 21/11, três sessões em paralelo esgotaram o limite de 5 horas em 25 minutos (D-066).

- **rtk** (Rust Token Killer, github.com/rtk-ai/rtk, v1.2.1): hook `PreToolUse` do Bash que reescreve `git status` para `rtk git status` e devolve a saída compacta. Só atua no Bash; Read, Grep e Glob passam por fora.
- **headroom** (headroom-ai no PyPI, Apache-2.0, v0.44.0): proxy entre o agente e o provedor do modelo, que comprime o contexto antes do envio.

Dois achados mudaram o desenho:
1. O hook do rtk devolve `permissionDecision: allow`, e o rtk também reescreve comandos como `git push`. Ligado direto, ele aprovaria sozinho comandos que hoje pedem permissão.
2. Nas sessões de nuvem do Claude Code, o tráfego do modelo não sai por um processo local: o proxy da sessão responde 405 para api.anthropic.com. O headroom só fica no caminho onde o `claude` é um processo comum.

## Decisão
- **rtk em todas as sessões do Claude Code**, pelo `.claude/settings.json` do projeto, por meio do wrapper `.claude/hooks/rtk_rewrite.py`. Ele só repassa a reescrita de comandos simples de leitura e de teste (sem encadear, redirecionar ou substituir) e só aceita o formato `rtk <mesmo comando>`. O resto segue o fluxo normal de permissão e os gates `gate_execucao` e `gate_entrega`. Sem o binário, o wrapper não faz nada.
- **rtk no Antigravity**, pelo plugin `.agents/plugins/rtk` (o Antigravity confere a permissão depois da reescrita).
- **Instalação:** `scripts/setup-ambiente.sh` compila o rtk do repositório oficial numa tag fixa (`cargo install --git ... --tag`), porque o `cargo install rtk` do crates.io instala outro projeto com o mesmo nome. O `harness/init.sh` mostra se ele está presente.
- **headroom só local:** `scripts/headroom-local.sh` instala a versão fixa num venv, desliga a telemetria (o beacon anônimo vem ligado por padrão) e abre o Claude Code com `headroom wrap claude --mode cache`. O modo cache preserva o cache de prefixo da Anthropic. O `headroom learn` fica proibido aqui, porque escreve no CLAUDE.md e no AGENTS.md.

## Alternativas rejeitadas
- **`rtk init -g` padrão:** aprovação automática de comandos com efeito, inclusive push.
- **headroom como proxy nas sessões de nuvem:** não há como pôr o processo no caminho do modelo. Tentar seria configuração que não funciona.
- **Servidor MCP do headroom nas sessões de nuvem:** sem o proxy, só acrescenta definições de tools ao contexto de toda sessão, o oposto do objetivo.
- **headroom no CI agora:** os revisores usam o token da assinatura (D-028), e o encaminhamento dele pelo proxy não foi testado. Fica para um ADR próprio, depois de testar.

## Trade-offs, custo e risco
- Custo zero de infraestrutura. A primeira compilação do rtk leva uns 5 minutos por ambiente; depois o cache guarda o binário.
- Saída compacta pode esconder um detalhe de que o agente precisa. O rtk tem `rtk bypass <cmd>` para pedir a saída crua.
- Supply chain: duas ferramentas de terceiros com versão fixa. A atualização é de propósito, depois de ler o CHANGELOG.
- A economia real precisa ser medida (`rtk gain` e o registro de uso do harness), não presumida pelos números de divulgação.

## Tarefas da prova exercitadas
1.5 (hooks como gate programático, aplicados antes da ferramenta), 3.1 e 3.2 (configuração do projeto valendo para todas as sessões), 5.1 (preservação de contexto).

## O que um arquiteto sênior faria em produção
Mediria antes e depois em sessões iguais, com o registro de uso, antes de ampliar a lista de comandos. Poria o proxy de compressão num gateway central, como sidecar de um gateway de LLM, em vez de cada máquina, com a telemetria desligada por política da organização.
