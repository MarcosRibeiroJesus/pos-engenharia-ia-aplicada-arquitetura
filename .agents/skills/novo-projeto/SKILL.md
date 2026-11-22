---
name: novo-projeto
description: Criar um projeto novo pelo caminho padrão do harness (D-030), para que ele passe pela mesma esteira, os mesmos gates e o mesmo ciclo de demonstração. Use quando o dono escolher uma arquitetura, um projeto de IA aplicada ou um produto novo.
---

# Projeto novo pelo caminho padrão

## Antes
- **A escolha do projeto é do dono.** Sem a escolha registrada na memória compartilhada, não crie nada.
- **Confira na memória** a cloud comparativa e qualquer restrição de escopo.

## Comando
```
python3 harness/novo_projeto.py NN-nome --titulo "..." --tipo arquitetura|ia-aplicada|plataforma \
  --pasta modulos/NN-slug/arquitetura/ --branch modulo/NN-slug/nome --disciplina NN [--cloud gcp] [--sem-infra]
```

Ele cria:
- a entrada em `harness/estado.json`, na fase `especificar`;
- `specs/<chave>/spec.md`;
- com infraestrutura real, os workflows de apply e destroy dos modelos. Esses já passam no `estado.py validar`.

## Depois
1. Branch do projeto e PR para `main`, com `## Perguntas ao dono`.
2. Fase especificar com o especialista `especificador`; seguem plano, tarefas, análise e implementação pelos especialistas.
3. **Isolamento (D-029):** recursos com prefixo `<chave>` e tag `project=<chave>`, e roles do projeto com condição na tag.
4. **Plataforma compartilhada:** se o projeto usa Claude ou MCP na AWS, consuma a plataforma (skill `plataforma-agentes`) em vez de criar gateway ou guardrail próprios.
