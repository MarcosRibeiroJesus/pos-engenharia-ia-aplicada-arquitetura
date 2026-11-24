"""Validador de JSON Schema (subconjunto do draft 2020-12) só com a biblioteca padrão (T018).

Por que não o pacote `jsonschema`: os testes da plataforma rodam no CI com o Python do runner,
sem `pip install`, e dependência nova pede ADR. O `v1.schema.json` usa só as palavras abaixo, e
o validador recusa qualquer outra (falha fechada): uma palavra que ele não conhece seria ignorada
em silêncio e a regra pareceria valer sem valer.
"""
from __future__ import annotations

import re

# Palavras sem efeito na validação.
ANOTACOES = {"$schema", "$id", "$comment", "title", "description", "examples"}
SUPORTADAS = ANOTACOES | {
    "$defs", "$ref", "type", "const", "enum", "pattern", "minLength", "maxLength",
    "properties", "required", "additionalProperties", "propertyNames", "minProperties",
    "items", "minItems", "maxItems", "uniqueItems", "oneOf", "not",
}

TIPOS = {
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "string": lambda v: isinstance(v, str),
    "boolean": lambda v: isinstance(v, bool),
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "null": lambda v: v is None,
}


class EsquemaInvalido(Exception):
    """O schema usa algo que este validador não sabe conferir."""


def _padrao_ecma(padrao: str) -> str:
    """Traduz o `$` do dialeto do JSON Schema (ECMA-262) para o `re` do Python.

    No ECMA-262, sem a flag multiline (o JSON Schema não tem flags), `$` casa só no fim do valor.
    No Python, `$` também casa antes de um `\\n` final, e "1.0.0\\n" passaria em `^1\\.0\\.0$`. A
    âncora que casa só no fim absoluto, no Python, é `\\Z`. Por isso cada `$` que é âncora vira
    `\\Z`, onde quer que esteja (fim do padrão ou dentro de uma alternativa, como `^(a$|b)`).

    Não é âncora, e fica como está: `\\$` (escapado) e `$` dentro de classe de caracteres (`[$]`).
    O percurso guarda dois estados: o caractere anterior foi `\\` (o próximo é copiado sem
    interpretação) e estamos dentro de `[...]` (onde `$` é literal e só `]` não escapado fecha;
    um `]` logo depois de `[` ou `[^` é literal, como no Python).
    """
    saida: list[str] = []
    i, em_classe = 0, False
    while i < len(padrao):
        c = padrao[i]
        if c == "\\":
            saida.append(padrao[i:i + 2])
            i += 2
            continue
        if em_classe:
            if c == "]":
                em_classe = False
        elif c == "[":
            em_classe = True
            saida.append(c)
            i += 1
            # `]` (ou `^]`) logo na abertura é literal
            if padrao[i:i + 1] == "^":
                saida.append("^")
                i += 1
            if padrao[i:i + 1] == "]":
                saida.append("]")
                i += 1
            continue
        elif c == "$":
            saida.append(r"\Z")
            i += 1
            continue
        saida.append(c)
        i += 1
    return "".join(saida)


def _igual_json(a, b) -> bool:
    """Igualdade de valores JSON, a do `const` e do `enum`.

    O `==` do Python não serve: `True == 1`, `False == 0` e `[True] == [1]`. No JSON, booleano é
    tipo próprio; número é um tipo só (1 e 1.0 são iguais); listas comparam item a item, em ordem;
    objetos comparam as mesmas chaves com valores iguais. A regra vale em qualquer nível.
    """
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    numero = (int, float)
    if isinstance(a, numero) or isinstance(b, numero):
        return isinstance(a, numero) and isinstance(b, numero) and a == b
    if isinstance(a, list) or isinstance(b, list):
        return (isinstance(a, list) and isinstance(b, list) and len(a) == len(b)
                and all(_igual_json(x, y) for x, y in zip(a, b)))
    if isinstance(a, dict) or isinstance(b, dict):
        return (isinstance(a, dict) and isinstance(b, dict) and a.keys() == b.keys()
                and all(_igual_json(a[k], b[k]) for k in a))
    return type(a) is type(b) and a == b  # string ou null


def _resolver(raiz: dict, ref: str) -> dict:
    if not ref.startswith("#/"):
        raise EsquemaInvalido(f"$ref só local (#/...): {ref}")
    alvo = raiz
    for parte in ref[2:].split("/"):
        alvo = alvo[parte]
    return alvo


def _validar(valor, esquema, raiz, caminho: str) -> list[str]:
    if esquema is True:
        return []
    if esquema is False:
        return [f"{caminho or '$'}: não permitido"]
    desconhecidas = set(esquema) - SUPORTADAS
    if desconhecidas:
        raise EsquemaInvalido(f"palavras não suportadas em {caminho or '$'}: {sorted(desconhecidas)}")
    onde = caminho or "$"
    erros: list[str] = []

    if "$ref" in esquema:
        erros += _validar(valor, _resolver(raiz, esquema["$ref"]), raiz, caminho)
    if "type" in esquema:
        tipos = esquema["type"] if isinstance(esquema["type"], list) else [esquema["type"]]
        if not any(TIPOS[t](valor) for t in tipos):
            return erros + [f"{onde}: tipo esperado {tipos}"]
    if "const" in esquema and not _igual_json(valor, esquema["const"]):
        erros.append(f"{onde}: valor esperado {esquema['const']!r}")
    if "enum" in esquema and not any(_igual_json(valor, e) for e in esquema["enum"]):
        erros.append(f"{onde}: fora do enum {esquema['enum']}")
    if "not" in esquema and not _validar(valor, esquema["not"], raiz, caminho):
        erros.append(f"{onde}: casa com o schema de 'not'")
    if "oneOf" in esquema:
        casam = [i for i, s in enumerate(esquema["oneOf"]) if not _validar(valor, s, raiz, caminho)]
        if len(casam) != 1:
            detalhes = "; ".join(e for s in esquema["oneOf"] for e in _validar(valor, s, raiz, caminho)[:3])
            erros.append(f"{onde}: casa com {len(casam)} opções do oneOf, e deve casar com uma ({detalhes})")

    if isinstance(valor, str):
        if "pattern" in esquema and not re.search(_padrao_ecma(esquema["pattern"]), valor):
            erros.append(f"{onde}: não casa com {esquema['pattern']}")
        if "minLength" in esquema and len(valor) < esquema["minLength"]:
            erros.append(f"{onde}: menor que {esquema['minLength']} caracteres")
        if "maxLength" in esquema and len(valor) > esquema["maxLength"]:
            erros.append(f"{onde}: maior que {esquema['maxLength']} caracteres")

    if isinstance(valor, dict):
        for campo in esquema.get("required", []):
            if campo not in valor:
                erros.append(f"{onde}: falta o campo obrigatório {campo!r}")
        if "minProperties" in esquema and len(valor) < esquema["minProperties"]:
            erros.append(f"{onde}: menos de {esquema['minProperties']} campos")
        props = esquema.get("properties", {})
        for campo, v in valor.items():
            sub = f"{caminho}.{campo}" if caminho else campo
            if "propertyNames" in esquema:
                erros += _validar(campo, esquema["propertyNames"], raiz, f"{sub} (nome)")
            if campo in props:
                erros += _validar(v, props[campo], raiz, sub)
            elif "additionalProperties" in esquema:
                erros += _validar(v, esquema["additionalProperties"], raiz, sub)

    if isinstance(valor, list):
        if "minItems" in esquema and len(valor) < esquema["minItems"]:
            erros.append(f"{onde}: menos de {esquema['minItems']} itens")
        if "maxItems" in esquema and len(valor) > esquema["maxItems"]:
            erros.append(f"{onde}: mais de {esquema['maxItems']} itens")
        if esquema.get("uniqueItems") and any(_igual_json(valor[i], valor[j])
                                              for i in range(len(valor))
                                              for j in range(i + 1, len(valor))):
            erros.append(f"{onde}: itens repetidos")
        if "items" in esquema:
            for i, v in enumerate(valor):
                erros += _validar(v, esquema["items"], raiz, f"{caminho}[{i}]")
    return erros


def validar(valor, esquema: dict, ref: str | None = None) -> list[str]:
    """Erros de `valor` contra o schema (ou contra `#/$defs/...` em `ref`); vazio quando passa."""
    alvo = _resolver(esquema, ref) if ref else esquema
    return _validar(valor, alvo, esquema, "")
