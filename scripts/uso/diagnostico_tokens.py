#!/usr/bin/env python3
"""Diagnóstico detalhado de consumo de tokens em transcripts JSONL do Claude Code.

Processa os arquivos em fluxo (linha a linha), nunca armazena nem imprime o texto
de prompts, respostas ou saídas de ferramenta — apenas métricas agregadas,
contagens, tamanhos em bytes, nomes de ferramenta/modelo/subagente e timestamps.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

PESOS = {"input": 1.0, "cache_write": 2.0, "cache_read": 0.1, "output": 5.0}


def equivalente(u: dict[str, int | float]) -> float:
    return (
        (u.get("input", 0) or 0) * PESOS["input"]
        + (u.get("cache_write", 0) or 0) * PESOS["cache_write"]
        + (u.get("cache_read", 0) or 0) * PESOS["cache_read"]
        + (u.get("output", 0) or 0) * PESOS["output"]
    )


def parse_ts(ts: str | None) -> float | None:
    if not ts or not isinstance(ts, str):
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def tamanho_bytes_conteudo(content) -> int:
    if content is None:
        return 0
    if isinstance(content, str):
        return len(content.encode("utf-8", errors="replace"))
    if isinstance(content, list):
        total = 0
        for item in content:
            if isinstance(item, str):
                total += len(item.encode("utf-8", errors="replace"))
            elif isinstance(item, dict):
                for k in ("text", "thinking", "content"):
                    v = item.get(k)
                    if v is not None:
                        total += tamanho_bytes_conteudo(v)
                if "input" in item and item["input"] is not None:
                    total += len(json.dumps(item["input"], ensure_ascii=False).encode("utf-8"))
        return total
    if isinstance(content, dict):
        return len(json.dumps(content, ensure_ascii=False).encode("utf-8"))
    return 0


def arquivos_da_sessao(principal: Path) -> tuple[Path, list[Path]]:
    sub_dir = principal.parent / principal.stem / "subagents"
    subs = sorted(sub_dir.glob("*.jsonl")) if sub_dir.is_dir() else []
    return principal, subs


def analisar_fio(caminho: Path, papel: str = "principal") -> dict:
    """Analisa um único arquivo JSONL (fio principal ou um subagente) em fluxo."""
    # Para deduplicar por message.id preservando ordem da primeira aparição e
    # acumulando o uso máximo/último e todos os blocos daquela mensagem.
    ordem_msgs: list[str] = []
    msgs: dict[str, dict] = {}
    tool_use_para_nome: dict[str, str] = {}
    agent_calls: list[dict] = []  # chamadas à ferramenta Agent/Task no fio principal

    # Eventos intermediários entre requisições (user / attachment / system)
    pendentes_entre_reqs: list[dict] = []
    compactacoes: list[dict] = []
    attachments_por_tipo: Counter[str] = Counter()
    attachments_bytes_por_tipo: Counter[str] = Counter()
    erros_json = 0
    linhas_total = 0
    branch = ""
    is_sidechain = False
    agent_id = None
    arquivos_lidos: Counter[str] = Counter()

    def registrar_pendente(origem: str, detalhe: str, nbytes: int, ts: float | None):
        if nbytes <= 0:
            return
        pendentes_entre_reqs.append({
            "origem": origem,
            "detalhe": detalhe,
            "bytes": nbytes,
            "ts": ts,
        })

    with caminho.open("r", encoding="utf-8", errors="replace") as f:
        for linha in f:
            linha = linha.strip()
            if not linha:
                continue
            linhas_total += 1
            try:
                ev = json.loads(linha)
            except ValueError:
                erros_json += 1
                continue
            if not isinstance(ev, dict):
                continue

            if not branch and ev.get("gitBranch"):
                branch = str(ev["gitBranch"])
            if ev.get("isSidechain"):
                is_sidechain = True
            if not agent_id and ev.get("agentId"):
                agent_id = str(ev["agentId"])

            t = ev.get("type")
            ts = parse_ts(ev.get("timestamp"))

            if t == "system":
                st = ev.get("subtype")
                if st in ("compact_boundary", "microcompact_boundary") or ev.get("compactMetadata"):
                    compactacoes.append({"ts": ts, "subtype": st or "compact", "apos_req": len(ordem_msgs)})
                continue

            if t == "attachment":
                att = ev.get("attachment") or {}
                att_type = str(att.get("type") or "desconhecido") if isinstance(att, dict) else "desconhecido"
                nbytes = tamanho_bytes_conteudo(att)
                attachments_por_tipo[att_type] += 1
                attachments_bytes_por_tipo[att_type] += nbytes
                registrar_pendente("hook/attachment", att_type, nbytes, ts)
                continue

            if t == "user":
                if ev.get("isCompactSummary"):
                    compactacoes.append({"ts": ts, "subtype": "compact_summary", "apos_req": len(ordem_msgs)})
                msg = ev.get("message") or {}
                content = msg.get("content")
                if isinstance(content, str):
                    nbytes = len(content.encode("utf-8", errors="replace"))
                    if "<system-reminder>" in content:
                        registrar_pendente("system-reminder", "user:system-reminder", nbytes, ts)
                    elif ev.get("isMeta"):
                        registrar_pendente("meta/skill", "user:isMeta", nbytes, ts)
                    else:
                        registrar_pendente("usuario", "prompt", nbytes, ts)
                elif isinstance(content, list):
                    for b in content:
                        if not isinstance(b, dict):
                            continue
                        bt = b.get("type")
                        if bt == "tool_result":
                            tuid = b.get("tool_use_id") or ""
                            nome_tool = tool_use_para_nome.get(tuid, "tool_desconhecida")
                            nbytes = tamanho_bytes_conteudo(b.get("content"))
                            registrar_pendente("tool_result", nome_tool, nbytes, ts)
                        elif bt == "text":
                            txt = b.get("text") or ""
                            nbytes = len(txt.encode("utf-8", errors="replace"))
                            if "<system-reminder>" in txt:
                                registrar_pendente("system-reminder", "bloco:system-reminder", nbytes, ts)
                            elif ev.get("isMeta"):
                                registrar_pendente("meta/skill", "bloco:isMeta", nbytes, ts)
                            else:
                                registrar_pendente("usuario", "texto", nbytes, ts)
                continue

            if t == "assistant":
                msg = ev.get("message") or {}
                modelo = msg.get("model")
                usage = msg.get("usage")
                content = msg.get("content") if isinstance(msg.get("content"), list) else []

                # Mapear tool_use mesmo se esta linha não tiver usage final
                for b in content:
                    if isinstance(b, dict) and b.get("type") == "tool_use":
                        tid = b.get("id")
                        nome = str(b.get("name") or "desconhecida")
                        if tid:
                            tool_use_para_nome[tid] = nome
                        inp = b.get("input") or {}
                        if isinstance(inp, dict):
                            if nome == "Read" and inp.get("file_path"):
                                arquivos_lidos[Path(str(inp["file_path"])).name] += 1
                            if nome in ("Agent", "Task"):
                                agent_calls.append({
                                    "tool_use_id": tid,
                                    "subagent_type": str(inp.get("subagent_type") or "geral"),
                                    "model_solicitado": str(inp.get("model") or "padrao"),
                                    "briefing_bytes": tamanho_bytes_conteudo(inp.get("prompt")),
                                    "ts": ts,
                                })

                if not isinstance(usage, dict) or not modelo or modelo == "<synthetic>":
                    continue

                mid = str(msg.get("id") or ev.get("uuid") or f"linha-{linhas_total}")
                if mid not in msgs:
                    ordem_msgs.append(mid)
                    msgs[mid] = {
                        "id": mid,
                        "modelo": str(modelo),
                        "ts": ts,
                        "input": 0,
                        "cache_write": 0,
                        "cache_write_5m": 0,
                        "cache_write_1h": 0,
                        "cache_read": 0,
                        "output": 0,
                        "tools": [],
                        "output_bytes": 0,
                        "entradas_antes": list(pendentes_entre_reqs),
                    }
                    pendentes_entre_reqs.clear()

                rec = msgs[mid]
                cc = usage.get("cache_creation") if isinstance(usage.get("cache_creation"), dict) else {}
                # Última versão / máximo monotônico (alinhado com registrar_uso.py e agregador.js)
                rec["input"] = max(rec["input"], int(usage.get("input_tokens") or 0))
                rec["cache_write"] = max(rec["cache_write"], int(usage.get("cache_creation_input_tokens") or 0))
                rec["cache_write_5m"] = max(rec["cache_write_5m"], int(cc.get("ephemeral_5m_input_tokens") or 0))
                rec["cache_write_1h"] = max(rec["cache_write_1h"], int(cc.get("ephemeral_1h_input_tokens") or 0))
                rec["cache_read"] = max(rec["cache_read"], int(usage.get("cache_read_input_tokens") or 0))
                rec["output"] = max(rec["output"], int(usage.get("output_tokens") or 0))
                for b in content:
                    if isinstance(b, dict):
                        if b.get("type") == "tool_use":
                            rec["tools"].append(str(b.get("name") or "desconhecida"))
                        rec["output_bytes"] += tamanho_bytes_conteudo(b)

    # Pós-processamento da sequência de requisições deste fio
    reqs = [msgs[mid] for mid in ordem_msgs]
    por_modelo: dict[str, dict[str, int]] = defaultdict(
        lambda: {"requisicoes": 0, "input": 0, "cache_write": 0, "cache_write_5m": 0, "cache_write_1h": 0, "cache_read": 0, "output": 0}
    )

    # Detectar quedas de contexto (compactação efetiva) para saber quantas requisições seguintes cada item é carregado
    contextos = [r["input"] + r["cache_write"] + r["cache_read"] for r in reqs]
    quedas_idx: list[int] = []
    for i in range(1, len(contextos)):
        if contextos[i - 1] > 20_000 and contextos[i] < contextos[i - 1] * 0.65:
            quedas_idx.append(i)

    def reqs_restantes_ate_queda(i: int) -> int:
        for q in quedas_idx:
            if q > i:
                return q - i
        return len(reqs) - i

    cache_frios: list[dict] = []
    atribuicao_delta: Counter[str] = Counter()
    atribuicao_carregamento: Counter[str] = Counter()  # token-requisições (delta * reqs_seguintes)
    maiores_eventos: list[dict] = []
    delta_total_positivo = 0

    for i, r in enumerate(reqs):
        m = por_modelo[r["modelo"]]
        m["requisicoes"] += 1
        for k in ("input", "cache_write", "cache_write_5m", "cache_write_1h", "cache_read", "output"):
            m[k] += r[k]

        ctx = contextos[i]
        # Cache frio no meio da sessão: não é a primeira requisição, cache_write > 15k e (cache_read < 0.2 * ctx)
        if i > 0 and r["cache_write"] > 15_000 and r["cache_read"] < ctx * 0.2:
            pausa_s = None
            if r["ts"] is not None and reqs[i - 1]["ts"] is not None:
                pausa_s = round(r["ts"] - reqs[i - 1]["ts"], 1)
            cache_frios.append({
                "req_idx": i,
                "modelo": r["modelo"],
                "cache_write": r["cache_write"],
                "cache_read": r["cache_read"],
                "pausa_s": pausa_s,
                "custo_extra_equiv": round(r["cache_write"] * (PESOS["cache_write"] - PESOS["cache_read"])),
            })

        # Atribuição proporcional do crescimento do contexto entre req[i-1] e req[i]
        if i > 0:
            delta_ctx = ctx - contextos[i - 1]
            if delta_ctx > 0:
                delta_total_positivo += delta_ctx
                # Somar bytes da resposta anterior do assistente + entradas pendentes antes de req[i]
                itens = []
                if reqs[i - 1]["output_bytes"] > 0:
                    itens.append(("assistant:output", reqs[i - 1]["output_bytes"]))
                for p in r["entradas_antes"]:
                    chave = f"{p['origem']}:{p['detalhe']}"
                    itens.append((chave, p["bytes"]))
                soma_bytes = sum(b for _, b in itens)
                restantes = reqs_restantes_ate_queda(i)
                if soma_bytes > 0:
                    # Agrupar por chave dentro da mesma requisição
                    por_chave: Counter[str] = Counter()
                    for ch, nb in itens:
                        por_chave[ch] += nb
                    for ch, nb in por_chave.items():
                        parte = delta_ctx * (nb / soma_bytes)
                        atribuicao_delta[ch] += parte
                        custo_carr = parte * restantes
                        atribuicao_carregamento[ch] += custo_carr
                        if parte >= 500:
                            maiores_eventos.append({
                                "fio": caminho.name,
                                "papel": papel,
                                "req_idx": i,
                                "origem": ch,
                                "bytes": nb,
                                "delta_tokens": round(parte),
                                "reqs_seguintes": restantes,
                                "token_reqs": round(custo_carr),
                                "custo_carr_equiv": round(custo_carr * PESOS["cache_read"]),
                            })
                else:
                    atribuicao_delta["nao-atribuido"] += delta_ctx
                    atribuicao_carregamento["nao-atribuido"] += delta_ctx * restantes

    return {
        "arquivo": caminho.name,
        "papel": papel,
        "branch": branch,
        "is_sidechain": is_sidechain,
        "agent_id": agent_id,
        "linhas_total": linhas_total,
        "erros_json": erros_json,
        "requisicoes": len(reqs),
        "por_modelo": dict(por_modelo),
        "ctx_min": min(contextos) if contextos else 0,
        "ctx_max": max(contextos) if contextos else 0,
        "ctx_final": contextos[-1] if contextos else 0,
        "ctx_medio": round(sum(contextos) / len(contextos)) if contextos else 0,
        "quedas_contexto": len(quedas_idx),
        "compactacoes_marcadas": len(compactacoes),
        "cache_frios": cache_frios,
        "agent_calls": agent_calls,
        "attachments_por_tipo": dict(attachments_por_tipo),
        "attachments_bytes_por_tipo": dict(attachments_bytes_por_tipo),
        "atribuicao_delta": dict(atribuicao_delta),
        "atribuicao_carregamento": dict(atribuicao_carregamento),
        "delta_total_positivo": delta_total_positivo,
        "maiores_eventos": maiores_eventos,
        "arquivos_lidos_repetidos": {k: v for k, v in arquivos_lidos.items() if v > 1},
    }


def analisar_sessao(principal: Path) -> dict:
    arq_p, subs = arquivos_da_sessao(principal)
    fio_p = analisar_fio(arq_p, papel="principal")
    fios_sub = [analisar_fio(s, papel="subagente") for s in subs]

    total_por_modelo: dict[str, dict[str, int]] = defaultdict(
        lambda: {"requisicoes": 0, "input": 0, "cache_write": 0, "cache_write_5m": 0, "cache_write_1h": 0, "cache_read": 0, "output": 0}
    )
    principal_tot = {"requisicoes": 0, "input": 0, "cache_write": 0, "cache_write_5m": 0, "cache_write_1h": 0, "cache_read": 0, "output": 0}
    subagentes_tot = {"requisicoes": 0, "input": 0, "cache_write": 0, "cache_write_5m": 0, "cache_write_1h": 0, "cache_read": 0, "output": 0}

    for m, d in fio_p["por_modelo"].items():
        for k, v in d.items():
            total_por_modelo[m][k] += v
            principal_tot[k] += v
    for sf in fios_sub:
        for m, d in sf["por_modelo"].items():
            for k, v in d.items():
                total_por_modelo[m][k] += v
                subagentes_tot[k] += v

    geral = {k: principal_tot[k] + subagentes_tot[k] for k in principal_tot}

    # Somar atribuições e eventos
    atrib_delta: Counter[str] = Counter()
    atrib_carr: Counter[str] = Counter()
    todos_eventos: list[dict] = []
    todos_frios: list[dict] = []
    for f in [fio_p, *fios_sub]:
        for k, v in f["atribuicao_delta"].items():
            atrib_delta[k] += v
        for k, v in f["atribuicao_carregamento"].items():
            atrib_carr[k] += v
        todos_eventos.extend(f["maiores_eventos"])
        for cf in f["cache_frios"]:
            todos_frios.append({**cf, "fio": f["arquivo"], "papel": f["papel"]})

    todos_eventos.sort(key=lambda x: x["token_reqs"], reverse=True)

    return {
        "sessao": principal.stem,
        "branch": fio_p["branch"],
        "qtd_subagentes": len(fios_sub),
        "total_geral": {**geral, "equivalente": round(equivalente(geral))},
        "total_principal": {**principal_tot, "equivalente": round(equivalente(principal_tot))},
        "total_subagentes": {**subagentes_tot, "equivalente": round(equivalente(subagentes_tot))},
        "por_modelo": {m: {**d, "equivalente": round(equivalente(d))} for m, d in total_por_modelo.items()},
        "contexto_principal": {
            "min": fio_p["ctx_min"],
            "medio": fio_p["ctx_medio"],
            "max": fio_p["ctx_max"],
            "final": fio_p["ctx_final"],
            "quedas": fio_p["quedas_contexto"],
            "compactacoes_marcadas": fio_p["compactacoes_marcadas"],
        },
        "agent_calls_por_tipo": dict(Counter(c["subagent_type"] for c in fio_p["agent_calls"])),
        "agent_calls_modelo_solicitado": dict(Counter(c["model_solicitado"] for c in fio_p["agent_calls"])),
        "cache_frios_total": len(todos_frios),
        "cache_frios_custo_extra_equiv": sum(c["custo_extra_equiv"] for c in todos_frios),
        "cache_frios_top5": sorted(todos_frios, key=lambda x: x["custo_extra_equiv"], reverse=True)[:5],
        "top10_origens_por_carregamento": [
            {"origem": k, "delta_tokens": round(atrib_delta[k]), "token_reqs": round(v), "custo_carr_equiv": round(v * PESOS["cache_read"])}
            for k, v in atrib_carr.most_common(10)
        ],
        "top10_eventos_carregamento": todos_eventos[:10],
        "top5_subagentes_caros": sorted(
            [
                {
                    "arquivo": sf["arquivo"],
                    "requisicoes": sf["requisicoes"],
                    "modelos": list(sf["por_modelo"].keys()),
                    "ctx_max": sf["ctx_max"],
                    "equivalente": round(sum(equivalente(d) for d in sf["por_modelo"].values())),
                }
                for sf in fios_sub
            ],
            key=lambda x: x["equivalente"],
            reverse=True,
        )[:5],
        "attachments_principal": fio_p["attachments_por_tipo"],
        "attachments_bytes_principal": fio_p["attachments_bytes_por_tipo"],
    }


def conciliar_harness(sessao_res: dict, harness_json: Path) -> dict:
    if not harness_json.is_file():
        return {"status": "sem_arquivo_harness"}
    h = json.loads(harness_json.read_text(encoding="utf-8"))
    modelos_h = h.get("modelos") or {}
    diffs = {}
    todos_modelos = set(modelos_h.keys()) | set(sessao_res["por_modelo"].keys())
    for m in sorted(todos_modelos):
        dh = modelos_h.get(m, {})
        ds = sessao_res["por_modelo"].get(m, {})
        d = {}
        for k in ("requisicoes", "input", "cache_write", "cache_read", "output"):
            vh = int(dh.get(k, 0))
            vs = int(ds.get(k, 0))
            if vh != vs:
                d[k] = {"harness": vh, "script": vs, "diff": vs - vh}
        if d:
            diffs[m] = d
    return {"status": "exato" if not diffs else "diferenca", "diferencas": diffs}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("transcripts", nargs="+", type=Path, help="Arquivos JSONL principais das sessões")
    p.add_argument("--harness-dir", type=Path, default=None, help="Diretório harness/uso para conciliação")
    a = p.parse_args(argv)

    saida = []
    for t in a.transcripts:
        res = analisar_sessao(t)
        if a.harness_dir:
            res["conciliacao_harness"] = conciliar_harness(res, a.harness_dir / f"{t.stem}.json")
        saida.append(res)
    print(json.dumps(saida, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
