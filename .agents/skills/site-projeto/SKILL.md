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

## Passos
1. Adicione o item em `ITEMS` de `site/index.html`, com `type` igual a `ia-aplicada`, `arquitetura` ou `post`.
2. Crie a página do projeto com diagrama, ADRs, custo de um dia, último relatório de teste e link para o código.
3. Abra no navegador local e confira o layout e os links. Na falta de um navegador, use um teste com Playwright.
4. **Publicação no GitHub Pages é decisão do dono.**

## Skills de mercado complementares
`frontend-design@claude-plugins-official` (direção visual) e `playwright@claude-plugins-official` (conferir a página).
