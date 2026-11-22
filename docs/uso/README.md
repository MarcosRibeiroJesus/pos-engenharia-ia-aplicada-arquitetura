# Registro de uso de IA

`uso-tokens.csv` guarda, por sessão e modelo, as requisições e os tokens de entrada, cache escrito, cache lido e saída. O painel público é gerado a partir dele.

## Como registrar

```bash
# Sessão do Claude Code: lê o transcript e soma o uso por modelo (sem duplicar mensagens)
python3 scripts/uso/uso.py registrar --transcript ~/.claude/projects/<pasta>/<sessao>.jsonl \
  --projeto 01.03-recomendacao --disciplina 01 --unidade 03 --tarefa "Terraform e testes"

# Medição informada (ex.: conversa de orquestração)
python3 scripts/uso/uso.py manual --projeto plataforma --tarefa "Orquestração" \
  --modelo claude-opus-5-5 --requisicoes 26 --input 60 --cache-write 171223 --cache-read 6103133 --output 27928

# Regenera site/uso.html e os widgets das páginas de projeto
python3 scripts/uso/uso.py painel
```

A mesma combinação de sessão e modelo não é registrada duas vezes.

## Leitura dos números

Tokens equivalentes ponderam cada tipo pelo custo relativo a um token de entrada comum: cache lido 0,1, cache escrito 2 e saída 5. É uma medida de esforço, não um preço. Trechos sem medição aparecem como `nao-medido` e ficam fora dos totais.
