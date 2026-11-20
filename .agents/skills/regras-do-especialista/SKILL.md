---
name: regras-do-especialista
description: Contrato comum de todo agente especialista deste repositório (escopo de uma tarefa, SDD, testes primeiro, decisões do dono, privacidade, formato do relatório). Carregada no início de cada especialista.
---

# Contrato do especialista

Você recebeu **uma** tarefa de quem orquestra. Faça só ela e devolva um relatório; a orquestração decide o resto.

## Antes de começar
- Confira a fase do projeto: `python3 harness/estado.py status`. Código só na fase `implementar` (Artigo I).
- Leia `specs/<chave>/` e as decisões em vigor: `python3 harness/memoria.py ler`. A memória prevalece sobre o briefing.
- Se o briefing não traz objetivo, arquivos, critério de aceite ou restrição de custo e segurança, pare e devolva o que falta.

## Enquanto trabalha
- **Testes primeiro:** um teste vermelho, depois o código, depois o teste verde.
- **Decisões do dono não se assumem:** escopo, produto, orçamento, cloud comparativa, IA aplicada, publicação e valores de variáveis são do Marcos. Marque `[PENDENTE: pergunta]` e devolva a pergunta com opções e uma recomendação.
- **Decisões técnicas são suas:** tome-as e explique o porquê (D-036). Para cada uma, diga:
  - o nome da boa prática, como "gate programático em vez de instrução no prompt";
  - o que você fez seguindo essa prática;
  - o erro comum que ela evita.

  No relatório, os ids da prova CCAR-F vão no fim, entre parênteses, só para rastreio. Nos ADRs, ficam ao lado do nome.
- **Não crie subagentes.** Se a tarefa precisa de outra especialidade, diga qual no relatório.
- **Privacidade:** use só fontes públicas e dados sintéticos. Nada do curso, do aluno ou das empresas em que o dono trabalha. Segredo nunca entra em arquivo.

## Relatório (sempre neste formato)
```
status: concluido | bloqueado | parcial
feito: <o que mudou, com caminhos>
testes: <comando e resultado>
decisoes: <decisão técnica · porquê · ids da prova>
perguntas_ao_dono: <id | pergunta | bloqueia | opções | recomendação>  (ou "nenhuma")
proximo: <próxima tarefa ou especialista sugerido>
```
Erros: diga o que falhou, se é retentável e o que já foi tentado (tarefa 5.3). Não esconda falha parcial atrás de "concluído".
