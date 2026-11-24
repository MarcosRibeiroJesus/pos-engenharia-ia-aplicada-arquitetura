#!/usr/bin/env python3
"""Testes unitários do diagnóstico de consumo de tokens com transcripts 100% sintéticos."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import diagnostico_tokens as dt


def _ev_assistant(mid: str, modelo: str, ts: str, inp: int, cw: int, cr: int, out: int,
                  cw5: int = 0, cw1: int = 0, content=None) -> dict:
    return {
        "type": "assistant",
        "timestamp": ts,
        "gitBranch": "plataforma/painel-consumo-tokens",
        "message": {
            "id": mid,
            "model": modelo,
            "content": content if content is not None else [{"type": "text", "text": "ok"}],
            "usage": {
                "input_tokens": inp,
                "cache_creation_input_tokens": cw,
                "cache_read_input_tokens": cr,
                "output_tokens": out,
                "cache_creation": {
                    "ephemeral_5m_input_tokens": cw5,
                    "ephemeral_1h_input_tokens": cw1,
                },
            },
        },
    }


class TestDiagnosticoTokens(unittest.TestCase):
    def test_deduplicacao_subagente_cache_frio_e_conciliacao(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            principal = base / "sessao-sintetica.jsonl"
            sub_dir = base / "sessao-sintetica" / "subagents"
            sub_dir.mkdir(parents=True)
            sub = sub_dir / "agent-sintetico-1.jsonl"

            linhas_principal = [
                "linha corrompida nao json",
                json.dumps({"type": "user", "timestamp": "2026-11-23T10:00:00Z", "message": {"role": "user", "content": "inicio"}}),
                # Mensagem duplicada com mesmo id (streaming incremental: 2a linha tem output maior)
                json.dumps(_ev_assistant("m1", "claude-haiku-5-5", "2026-11-23T10:00:05Z", 10, 20000, 0, 50, cw1=20000,
                                         content=[{"type": "tool_use", "id": "tu1", "name": "Bash", "input": {"command": "echo ok"}}])),
                json.dumps(_ev_assistant("m1", "claude-haiku-5-5", "2026-11-23T10:00:06Z", 10, 20000, 0, 120, cw1=20000,
                                         content=[{"type": "tool_use", "id": "tu1", "name": "Bash", "input": {"command": "echo ok"}}])),
                # Mensagem synthetic deve ser ignorada
                json.dumps(_ev_assistant("msyn", "<synthetic>", "2026-11-23T10:00:07Z", 0, 0, 0, 0)),
                # Resultado grande de Bash
                json.dumps({"type": "user", "timestamp": "2026-11-23T10:00:10Z", "message": {
                    "role": "user",
                    "content": [{"type": "tool_result", "tool_use_id": "tu1", "content": "x" * 4000}],
                }}),
                # Segunda requisicao: contexto cresceu +2000, cache quente
                json.dumps(_ev_assistant("m2", "claude-haiku-5-5", "2026-11-23T10:00:15Z", 10, 2000, 20000, 200, cw1=2000,
                                         content=[{"type": "tool_use", "id": "tu2", "name": "Agent", "input": {"subagent_type": "revisor-independente", "prompt": "revise"}}])),
                # Pausa longa -> cache frio na terceira requisicao (cache_write=22000, cache_read=0)
                json.dumps(_ev_assistant("m3", "claude-haiku-5-5", "2026-11-23T12:00:00Z", 10, 22500, 0, 100, cw1=22500)),
            ]
            principal.write_text("\n".join(linhas_principal) + "\n", encoding="utf-8")

            linhas_sub = [
                json.dumps(_ev_assistant("s1", "claude-opus-5-5", "2026-11-23T10:01:00Z", 5, 10000, 0, 300, cw5=10000)),
            ]
            sub.write_text("\n".join(linhas_sub) + "\n", encoding="utf-8")

            res = dt.analisar_sessao(principal)
            self.assertEqual(res["qtd_subagentes"], 1)
            self.assertEqual(res["por_modelo"]["claude-haiku-5-5"]["requisicoes"], 3)
            self.assertEqual(res["por_modelo"]["claude-haiku-5-5"]["output"], 420)
            self.assertEqual(res["por_modelo"]["claude-opus-5-5"]["requisicoes"], 1)
            self.assertEqual(res["cache_frios_total"], 1)
            self.assertEqual(res["agent_calls_por_tipo"]["revisor-independente"], 1)
            self.assertNotIn("<synthetic>", res["por_modelo"])

            # Conciliação com arquivo harness/uso sintético
            hjson = base / "sessao-sintetica.json"
            hjson.write_text(json.dumps({
                "sessao": "sessao-sintetica",
                "modelos": {
                    "claude-haiku-5-5": {"requisicoes": 3, "input": 30, "cache_write": 44500, "cache_read": 20000, "output": 420},
                    "claude-opus-5-5": {"requisicoes": 1, "input": 5, "cache_write": 10000, "cache_read": 0, "output": 300},
                },
            }), encoding="utf-8")
            conc = dt.conciliar_harness(res, hjson)
            self.assertEqual(conc["status"], "exato")


if __name__ == "__main__":
    unittest.main()
