# AGENTS.md · Site (`site/`, GitHub Pages)

Manual deste componente. Vale para qualquer agente. As regras do repositório estão no `AGENTS.md` da raiz e se aplicam aqui também.

## O que é
Vitrine estática publicada pelo workflow `pages.yml`. Mostra só os projetos, as arquiteturas e os posts. Não explica como o conteúdo é produzido nem traz detalhes do curso ou do progresso do aluno.

## Estrutura
- `index.html`: home. O conteúdo vem dos arrays `MODULES` e `ITEMS`, com `type` igual a `ia-aplicada`, `arquitetura` ou `post`.
- `posts/`: páginas dos posts publicados.
- `uso.html`: painel de uso, com os widgets `<!-- uso:projeto=CHAVE --><!-- /uso -->`.
- `assets/site.css`: estilo.

## Regras
- **HTML e CSS estáticos.** Sem fonte, script ou imagem externa. Se precisar de um recurso novo, ele vai para `assets/`.
- **Tema escuro fixo**, leitura em estilo Medium, cabeçalho de publicação em estilo Substack.
- **Nada inventado.** O que estiver pendente aparece como pendente.
- **Só fontes públicas** e dados sintéticos. Nada de empresa do autor ou de material do curso.
- **Links de sessão do Claude nunca entram no site** (regra do `AGENTS.md` da raiz).
- Página nova de projeto segue a skill `site-projeto`. Quem executa é o especialista `desenvolvedor-site`.

## Antes de dar por pronto
- Abrir a página localmente e conferir os links internos.
- Conferir que não há URL externa de recurso (`http`, `https` em `src` ou `href` de CSS/JS).
- Verificar que o workflow `pages.yml` passa na PR.
