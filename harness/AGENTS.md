# AGENTS.md · Harness (`harness/`)

Manual deste componente. Vale para qualquer agente. As regras do repositório estão no `AGENTS.md` da raiz e se aplicam aqui também.

## O que é
Os scripts que sustentam o SDD, a memória compartilhada, o estado dos projetos, a troca de agente, o prazo da infraestrutura e o registro de uso. É o núcleo que um dia deve sair da pós (critério 6 em `VERSAO.md`).

## Como testar
- Suíte: `python3 -m unittest discover -s harness/testes -p "test_*.py"`.
- Um arquivo por assunto em `harness/testes/test_<assunto>.py` (D-043). Nunca escreva testes em `harness/test_harness.py`, que é só o ponto de entrada.
- Estado compartilhado é testado em repositório git temporário.
- Conhecido: os testes de `test_economia_tokens` (wrapper do rtk) falham em máquina Windows onde o wrapper devolve saída vazia. Não altere o teste para passar; registre no PR.

## Regras
- **Só biblioteca padrão do Python 3.** Dependência nova exige ADR.
- **Arquivo gerado nunca se edita à mão.** Skills e especialistas em `.claude/agents/` e `.github/agents/` saem de `harness/especialistas.json` via `python3 harness/sincronizar_agentes.py`. O CI confere.
- **Toda mudança sobe a versão** em `harness/VERSAO.md`, com os critérios de estabilidade afetados.
- **Prazo de infraestrutura:** padrão de 6 h (decisão do dono), teto de 24 h (D-024) em `infra.py`.
- **Só a orquestração grava a memória compartilhada** (D-046). Scripts daqui leem, não escrevem decisões.
- **Nada de segredo** nos registros de uso, estado ou handoff.

## Onde olhar
- `estado.py`: fases, gate SDD (`checar-arquivos`), delegação.
- `memoria.py`: leitura e auditoria das decisões do dono (D-025).
- `infra.py`: prazo de vida da infraestrutura (`harness/handoff/` é gitignorado).
- `modelos/`: moldes de workflow. Não são workflows reais.
- `../.claude/hooks/limite_contexto.py`: aviso e estado salvo aos 230 mil tokens.

## Ao mudar algo aqui
Siga a skill `evolucao-do-harness`. CI verde no `harness.yml` antes do merge.
