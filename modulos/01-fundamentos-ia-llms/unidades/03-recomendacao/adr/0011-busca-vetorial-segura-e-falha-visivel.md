# ADR-0011: categoria permitida, vetor da sessão, LIMIT sem SORTBY e falha de dependência propagada

- Status: aceito (plano aprovado pelo dono em 2026-11-20, D-056)
- Data: 2026-11-20
- Projeto: `01-recomendacao` (D01, recomendação de e-commerce)
- Requisitos: RNF-104, RF-105, RF-106; incerteza E8 da spec
- Curso Skilljar relacionado: AI Fluency (proveniência); Building with the Claude API (erros estruturados)

## Contexto
O repositório do MemoryDB tem quatro problemas:
- **Injeção:** monta `(@cat:{<categoria>})` com o texto do usuário, sem escape.
- **Vetor nulo:** consulta sempre com um vetor de 128 zeros e chama o resultado de "tempo real".
- **`SORTBY`:** usa um comando que a [página do FT.SEARCH do MemoryDB](https://docs.aws.amazon.com/memorydb/latest/devguide/vector-search-commands-ft.search.html) não lista.
- **Falha engolida:** devolve lista vazia quando o Redis falha.

A mesma página diz que, sem `LIMIT`, o padrão é `LIMIT 0 10`. Então hoje o serviço pede até 50 vizinhos e recebe no máximo 10 (achado deste plano). A [visão geral](https://docs.aws.amazon.com/memorydb/latest/devguide/vector-search-overview.html) não traz regra de escape para tags e aceita `AS <campo>` para a distância.

## Decisão
1. **Categoria:**
   - `^[A-Za-z0-9_]{1,40}$` no controlador, com 400 fora disso, antes de qualquer chamada;
   - o repositório confere de novo e lança erro de validação;
   - o gerador sintético só produz categorias nesse padrão.
2. **Consulta:**
   - `FT.SEARCH item_idx "<filtro>=>[KNN k @v $vec AS vector_score]" PARAMS 2 vec <bytes> LIMIT 0 k RETURN 3 vector_score cat inStock DIALECT 2`;
   - sem `SORTBY`, porque o KNN já vem ordenado pela distância e o serviço reordena pelo score depois.
3. **Vetor da sessão:**
   - `sessionItemIds` aceita até 10 ids no padrão do `userId`;
   - um pipeline `HGET item:<id> v` lê os vetores;
   - o vetor da consulta é a média, normalizada em L2;
   - id ausente é ignorado; sem nenhum vetor, a busca vetorial não roda e não liga `degradedMode`;
   - leitura e busca dividem o orçamento de 15 ms.
4. **Falha propagada:**
   - os adaptadores do DynamoDB e do MemoryDB lançam `DependencyError {dependencia, categoria, retentavel}`;
   - o caso de uso captura por fonte, liga `degradedMode`, publica `DynamoDbFallbackCount` ou `MemoryDbFallbackCount` e mantém o 200 do RF-006;
   - "sem dados" continua lista vazia, sem degradação.

## Alternativas rejeitadas
| Alternativa | Por que não |
|---|---|
| Escapar os caracteres especiais do RediSearch | A AWS não documenta quais caracteres o MemoryDB trata como especiais; lista de permitidos é verificável |
| Categoria como parâmetro em `PARAMS` | A gramática do MemoryDB só documenta parâmetro para o vetor |
| Vetor do usuário calculado no lote | Não reflete a sessão, que é o motivo do caminho em tempo real |
| Manter lista vazia e alarmar por latência | Lista vazia não se distingue de "sem dados", e o alarme fica cego |

## Trade-offs
- Uma leitura a mais no MemoryDB por requisição com sessão, em pipeline, dentro dos 15 ms.
- A lista de caracteres limita os nomes de categoria. O catálogo sintético já obedece.

## Custo
Nenhum custo novo.

## Risco
- O orçamento de 15 ms pode ficar curto com duas operações. O DM-05 mede, e o disjuntor protege o p95.
- O emulador usa Valkey 8 sem módulo de busca documentado ([Floci MemoryDB](https://floci.io/floci/services/memorydb/)). A forma da consulta é provada por VT, e o comportamento real, por DM.

## Boa prática e erro comum (D-036)
**Validar a entrada antes de montar a consulta, propagar o erro com categoria e usar contexto real.** O arquiteto recusa a entrada fora do padrão antes que ela chegue a uma linguagem de consulta, deixa a camada que sabe degradar receber a falha com o motivo e só chama de "tempo real" o que usa o contexto da sessão. O erro comum é interpolar texto do usuário na consulta, devolver lista vazia na falha e rotular de "tempo real" uma busca com vetor nulo (2.2, 5.3, 5.6).

## O que um arquiteto sênior faria em produção
- **Embeddings de verdade:** gerados por um modelo de embeddings, com o vetor da sessão calculado em streaming e guardado com TTL.
- **Autenticação:** IAM e ACL por função no MemoryDB.
- **Qualidade da busca:** testes de contrato da consulta contra o motor real a cada versão do MemoryDB.
