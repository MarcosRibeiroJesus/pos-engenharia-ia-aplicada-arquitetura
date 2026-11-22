---
name: site-projeto
description: Publicar um projeto no site do GitHub Pages (site/). Use para adicionar a página de uma arquitetura ou de um projeto de IA aplicada, atualizar os arrays MODULES e ITEMS e conferir a página no navegador.
---

# Página de projeto no site

## Regras do site
- Tema escuro fixo, leitura no estilo Medium e cabeçalho no estilo Substack.
- HTML e CSS estáticos, sem fontes nem scripts externos.
- **Duas trilhas no menu:** IA Aplicada e Arquiteturas AWS, mais Posts e Temas.
- **O site não fala do curso,** nem de como o conteúdo é produzido. Pendente aparece como pendente.

## Plataforma de agentes (D-037)
A `00-plataforma-agentes` tem **página e post próprios**, como os projetos das disciplinas:
- a página fica na trilha Arquiteturas AWS (`type: "arquitetura"`), com o mesmo conteúdo das outras arquiteturas;
- o post fica em `plataforma/agentes/posts/aws.md` e entra em Posts;
- a página mostra quem consome a plataforma (a D03 primeiro) com link para a página desse produto, e a do produto aponta de volta;
- não há post de cloud comparativa, porque a plataforma não tem cloud comparativa definida.

## Passos
1. Adicione o item em `ITEMS` de `site/index.html`, com `type` igual a `ia-aplicada`, `arquitetura` ou `post`.
2. Crie a página do projeto com diagrama, ADRs, custo de um dia, último relatório de teste e link para o código.
3. Abra no navegador local e confira o layout e os links. Na falta de um navegador, use um teste com Playwright.
4. **Publicação no GitHub Pages é decisão do dono.**

## Skills de mercado complementares
`frontend-design@claude-plugins-official` (direção visual) e `playwright@claude-plugins-official` (conferir a página).
