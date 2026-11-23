"""Gerador de dados sintéticos do lote (T040, PY-07; Art. VIII, RNF-007, RF-012, RNF-104).

Gera usuários, itens, estoque e interações de uma loja fictícia, com semente fixa:
a mesma semente e o mesmo volume dão os mesmos bytes. Todo registro leva
`sintetico: true`; título e categoria de cada item vêm juntos da lista versionada
de produtos fictícios (`tests/fixtures/nomes-ficticios.json`, a mesma do VT-14 e do
catálogo de fallback, T077), e as categorias obedecem ao padrão
`^[A-Za-z0-9_]{1,40}$` do RNF-104.

Só biblioteca padrão, sem rede e sem nome de recurso fixo (PY-01): o destino é um
diretório local passado por argumento; quem sobe os arquivos para o S3 é o build.

Saída (JSON Lines, UTF-8, chaves ordenadas, `\\n`):
    <destino>/usuarios/part-00000.jsonl
    <destino>/itens/part-00000.jsonl
    <destino>/estoque/year=YYYY/month=MM/day=DD/part-00000.jsonl
    <destino>/interacoes/year=YYYY/month=MM/day=DD/part-00000.jsonl  (um por dia)

Uso:
    python3 gerar_dados_sinteticos.py --destino /tmp/lago --data 2026-01-15 \\
        --usuarios 20 --itens 50 --interacoes 2000 --dias 30 --semente 42
"""
import argparse
import json
import random
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

PADRAO_CATEGORIA = re.compile(r"^[A-Za-z0-9_]{1,40}$")

# Eventos e pesos de sorteio (os pesos de score do RF-013 ficam no job de features).
EVENTOS = (("view", 60), ("click", 25), ("add_to_cart", 10), ("purchase", 5))

NOMES_PADRAO = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "nomes-ficticios.json"


def _positivo(valor):
    n = int(valor)
    if n < 1:
        raise argparse.ArgumentTypeError("precisa ser um inteiro maior ou igual a 1")
    return n


def _data(valor):
    try:
        return date.fromisoformat(valor)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("use AAAA-MM-DD") from exc


def _argumentos(argv):
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--destino", required=True, help="diretório local de saída")
    p.add_argument("--data", required=True, type=_data,
                   help="data da partição (AAAA-MM-DD); último dia das interações")
    p.add_argument("--semente", type=int, default=42)
    p.add_argument("--usuarios", type=_positivo, default=20)
    p.add_argument("--itens", type=_positivo, default=50)
    p.add_argument("--interacoes", type=_positivo, default=2000,
                   help="total de interações, distribuídas pelos dias")
    p.add_argument("--dias", type=_positivo, default=30,
                   help="dias de histórico terminando em --data")
    p.add_argument("--nomes", type=Path, default=NOMES_PADRAO,
                   help="lista de produtos fictícios (JSON com 'categorias' e 'itens')")
    return p.parse_args(argv)


def carregar_catalogo(caminho):
    """Lê a lista de produtos fictícios e devolve [(titulo, categoria)] na ordem do arquivo.

    Recusa lista vazia, título vazio ou repetido, categoria fora do vocabulário declarado
    em 'categorias' e categoria fora do padrão do RNF-104.
    """
    dados = json.loads(Path(caminho).read_text(encoding="utf-8"))
    vocabulario = set(dados.get("categorias") or ())
    itens = dados.get("itens") or []
    if not itens:
        raise ValueError(f"lista de produtos fictícios vazia: {caminho}")
    catalogo, vistos = [], set()
    for item in itens:
        titulo, categoria = item.get("titulo"), item.get("categoria")
        if not isinstance(titulo, str) or not titulo or titulo in vistos:
            raise ValueError(f"título vazio ou repetido em {caminho}: {titulo!r}")
        if not isinstance(categoria, str) or not PADRAO_CATEGORIA.match(categoria):
            raise ValueError(f"categoria fora do padrão do RNF-104: {categoria!r}")
        if categoria not in vocabulario:
            raise ValueError(f"categoria fora do vocabulário da lista: {categoria!r}")
        vistos.add(titulo)
        catalogo.append((titulo, categoria))
    return catalogo


def _particao(d):
    return Path(f"year={d.year:04d}", f"month={d.month:02d}", f"day={d.day:02d}")


def _sortear_evento(rng):
    total = sum(peso for _, peso in EVENTOS)
    alvo = rng.randrange(total)
    for nome, peso in EVENTOS:
        if alvo < peso:
            return nome
        alvo -= peso
    raise AssertionError("inalcançável")


def gerar(semente, data_ref, usuarios, itens, interacoes, dias, catalogo):
    """Função pura: devolve {caminho relativo: [registros]} na ordem de escrita.

    `catalogo` é a lista [(titulo, categoria)] de `carregar_catalogo`.
    """
    if not catalogo:
        raise ValueError("catálogo de produtos fictícios vazio")
    for _, c in catalogo:
        if not PADRAO_CATEGORIA.match(c):
            raise ValueError(f"categoria fora do padrão do RNF-104: {c}")
    rng = random.Random(semente)
    primeiro_dia = data_ref - timedelta(days=dias - 1)

    lista_usuarios = [
        {"userId": f"u-{n:05d}", "segmento": rng.choice(("novo", "recorrente", "frequente")),
         "sintetico": True}
        for n in range(1, usuarios + 1)
    ]

    lista_estoque, lista_itens = [], []
    for n in range(1, itens + 1):
        item_id = f"SKU-{n:05d}"
        quantidade = 0 if rng.random() < 0.15 else rng.randrange(1, 200)
        em_estoque = quantidade > 0
        lista_estoque.append({"itemId": item_id, "quantidade": quantidade,
                              "inStock": em_estoque, "sintetico": True})
        titulo, categoria = catalogo[(n - 1) % len(catalogo)]
        lista_itens.append({
            "itemId": item_id,
            "title": titulo,
            "category": categoria,
            "priceCents": rng.randrange(500, 50000),
            "inStock": em_estoque,
            "sintetico": True,
        })

    por_dia = {primeiro_dia + timedelta(days=d): [] for d in range(dias)}
    dias_ordenados = sorted(por_dia)
    for k in range(interacoes):
        dia = dias_ordenados[k % dias]
        inicio = int(datetime(dia.year, dia.month, dia.day, tzinfo=timezone.utc).timestamp())
        por_dia[dia].append({
            "userId": lista_usuarios[rng.randrange(usuarios)]["userId"],
            "itemId": lista_itens[rng.randrange(itens)]["itemId"],
            "eventType": _sortear_evento(rng),
            "timestamp": inicio + rng.randrange(86400),
            "sintetico": True,
        })

    saida = {
        Path("usuarios", "part-00000.jsonl"): lista_usuarios,
        Path("itens", "part-00000.jsonl"): lista_itens,
        Path("estoque") / _particao(data_ref) / "part-00000.jsonl": lista_estoque,
    }
    for dia in dias_ordenados:
        registros = sorted(por_dia[dia], key=lambda r: (r["timestamp"], r["userId"], r["itemId"]))
        if registros:
            saida[Path("interacoes") / _particao(dia) / "part-00000.jsonl"] = registros
    return saida


def escrever(destino, saida):
    base = Path(destino)
    for relativo, registros in saida.items():
        arquivo = base / relativo
        arquivo.parent.mkdir(parents=True, exist_ok=True)
        corpo = "".join(
            json.dumps(r, sort_keys=True, ensure_ascii=False, separators=(",", ":")) + "\n"
            for r in registros
        )
        with open(arquivo, "w", encoding="utf-8", newline="\n") as f:
            f.write(corpo)


def main(argv=None):
    args = _argumentos(sys.argv[1:] if argv is None else argv)
    catalogo = carregar_catalogo(args.nomes)
    saida = gerar(args.semente, args.data, args.usuarios, args.itens,
                  args.interacoes, args.dias, catalogo)
    escrever(args.destino, saida)
    print(f"gerados {len(saida)} arquivos sintéticos em {args.destino} (semente {args.semente})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
