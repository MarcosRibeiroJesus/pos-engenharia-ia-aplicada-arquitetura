import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agregador, equivalente } from '../src/agregador.js';
import { LeitorTranscripts } from '../src/transcripts.js';
import { Persistencia } from '../src/persistencia.js';
import { relatorio } from '../src/relatorio.js';

function evAssistant({ id, sessao, modelo, ts, inp = 10, cw = 0, cr = 0, out = 100, cw5 = 0, cw1 = 0, content = [{ type: 'text', text: 'ok' }], branch = 'plataforma/painel-consumo-tokens' }) {
  return {
    type: 'assistant',
    sessionId: sessao,
    gitBranch: branch,
    timestamp: ts,
    message: {
      id,
      model: modelo,
      content,
      usage: {
        input_tokens: inp,
        cache_creation_input_tokens: cw,
        cache_read_input_tokens: cr,
        output_tokens: out,
        cache_creation: {
          ephemeral_5m_input_tokens: cw5,
          ephemeral_1h_input_tokens: cw1,
        },
      },
    },
  };
}

function gerarTranscriptSintetico(dir) {
  const sessao = 'sessao-sintetica-001';
  const principal = join(dir, `${sessao}.jsonl`);
  const subDir = join(dir, sessao, 'subagents');
  mkdirSync(subDir, { recursive: true });
  const sub1 = join(subDir, 'agent-rev-001.jsonl');

  const linhas = [
    'linha corrompida {{{ nao json',
    // Mensagem sem usage deve ser ignorada na contagem
    JSON.stringify({ type: 'assistant', sessionId: sessao, timestamp: '2026-11-23T10:00:00Z', message: { id: 'm0', model: 'claude-haiku-5-5', content: [{ type: 'text', text: 'sem usage' }] } }),
    // Mensagem synthetic deve ser ignorada
    JSON.stringify(evAssistant({ id: 'msyn', sessao, modelo: '<synthetic>', ts: '2026-11-23T10:00:01Z', inp: 100, out: 50 })),
    // Req 1 duplicada (streaming incremental) + Read de arquivo + Bash
    JSON.stringify(evAssistant({
      id: 'm1', sessao, modelo: 'claude-haiku-5-5', ts: '2026-11-23T10:00:05Z',
      inp: 10, cw: 30000, cr: 0, out: 50, cw1: 30000,
      content: [
        { type: 'tool_use', id: 'tu-read-1', name: 'Read', input: { file_path: '/repo/src/a.js' } },
        { type: 'tool_use', id: 'tu-bash-1', name: 'Bash', input: { command: 'npm test' } },
      ],
    })),
    JSON.stringify(evAssistant({
      id: 'm1', sessao, modelo: 'claude-haiku-5-5', ts: '2026-11-23T10:00:06Z',
      inp: 10, cw: 30000, cr: 0, out: 180, cw1: 30000,
      content: [{ type: 'text', text: 'rodando' }],
    })),
    // Hook attachment + tool_result grande de Bash + Read
    JSON.stringify({ type: 'attachment', sessionId: sessao, timestamp: '2026-11-23T10:00:08Z', attachment: { type: 'hook_success', text: 'h'.repeat(400) } }),
    JSON.stringify({
      type: 'user', sessionId: sessao, timestamp: '2026-11-23T10:00:09Z',
      message: {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tu-read-1', content: 'r'.repeat(1000) },
          { type: 'tool_result', tool_use_id: 'tu-bash-1', content: 'b'.repeat(16000) },
        ],
      },
    }),
    // Req 2: contexto cresceu +8000 (30010 -> 38010), dispara Agent com briefing grande
    JSON.stringify(evAssistant({
      id: 'm2', sessao, modelo: 'claude-haiku-5-5', ts: '2026-11-23T10:00:20Z',
      inp: 10, cw: 8000, cr: 30000, out: 300, cw1: 8000,
      content: [{ type: 'tool_use', id: 'tu-ag-1', name: 'Agent', input: { subagent_type: 'revisor-independente', prompt: 'p'.repeat(15000) } }],
    })),
    // Req 3: retomada > 8h depois + cache frio (cache_write=38500, cache_read=0) + troca de modelo para Sonnet
    JSON.stringify(evAssistant({
      id: 'm3', sessao, modelo: 'claude-sonnet-5-5', ts: '2026-11-23T20:00:00Z',
      inp: 10, cw: 38500, cr: 0, out: 200, cw1: 38500,
      content: [{ type: 'text', text: 'retomando' }],
    })),
    // Compactacao: contexto cai de 38510 para 12010
    JSON.stringify({ type: 'system', subtype: 'compact_boundary', sessionId: sessao, timestamp: '2026-11-23T20:01:00Z' }),
    JSON.stringify(evAssistant({
      id: 'm4', sessao, modelo: 'claude-sonnet-5-5', ts: '2026-11-23T20:01:10Z',
      inp: 10, cw: 12000, cr: 0, out: 150, cw1: 12000,
      content: [{ type: 'text', text: 'compactado' }],
    })),
  ];
  writeFileSync(principal, `${linhas.join('\n')}\n`, 'utf8');

  // Subagente Opus que reabre o mesmo arquivo /repo/src/a.js
  const linhasSub = [
    JSON.stringify(evAssistant({
      id: 's1', sessao, modelo: 'claude-opus-5-5', ts: '2026-11-23T10:00:25Z',
      inp: 5, cw: 20000, cr: 0, out: 400, cw5: 20000,
      content: [{ type: 'tool_use', id: 'tu-sub-read', name: 'Read', input: { file_path: '/repo/src/a.js' } }],
    })),
    JSON.stringify({
      type: 'user', sessionId: sessao, timestamp: '2026-11-23T10:00:28Z',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu-sub-read', content: 'r'.repeat(1000) }] },
    }),
    JSON.stringify(evAssistant({
      id: 's2', sessao, modelo: 'claude-opus-5-5', ts: '2026-11-23T10:00:35Z',
      inp: 5, cw: 1000, cr: 20000, out: 500, cw5: 1000,
      content: [{ type: 'text', text: 'revisao concluida' }],
    })),
  ];
  writeFileSync(sub1, `${linhasSub.join('\n')}\n`, 'utf8');

  return { sessao, principal, sub1 };
}

test('consumo interno: deduplicacao, subagente, cache frio, compactacao, retomada e fechamento da atribuicao', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'painel-consumo-'));
  try {
    const { sessao } = gerarTranscriptSintetico(dir);
    const ag = new Agregador({ agora: () => Date.parse('2026-11-23T20:02:00Z') });
    const leitor = new LeitorTranscripts(dir, (ev, meta) => ag.ingerir(ev, meta));
    await leitor.varrer();

    assert.equal(leitor.erros, 1, 'linha corrompida contabilizada');

    const est = ag.estado();
    // 4 reqs principal (m1..m4) + 2 reqs subagente (s1..s2) = 6 reqs
    assert.equal(est.totais.requisicoes, 6);
    assert.equal(est.totais.output, 180 + 300 + 200 + 150 + 400 + 500);
    assert.ok(est.porDia.length >= 1, 'visao por dia presente');

    const det = ag.detalheSessao(sessao);
    assert.ok(det, 'detalhe da sessao disponivel');
    assert.equal(det.sessao, sessao);

    // Marcadores na linha do tempo do fio principal
    const principalReqs = det.timeline.filter((r) => r.fio === 'principal');
    assert.equal(principalReqs.length, 4);
    assert.equal(principalReqs[1].hook_injetado, true);
    assert.equal(principalReqs[1].subagente_disparado, true);
    assert.equal(principalReqs[2].cache_frio, true);
    assert.equal(principalReqs[2].retomada_longa, true);
    assert.equal(principalReqs[2].troca_modelo, true);
    assert.equal(principalReqs[3].compactacao, true);

    // Atribuicao fecha 100% com o delta positivo medido
    const somaOrigens = det.atribuicao.origens.reduce((s, o) => s + o.delta_tokens, 0);
    assert.equal(Math.round(somaOrigens), Math.round(det.atribuicao.delta_total_medido));
    assert.equal(det.atribuicao.metodo, 'proporcional');

    // Subagentes e arquivo reaberto
    assert.equal(det.subagentes.fios.length, 1);
    assert.equal(det.subagentes.fios[0].arquivos_reabertos, 1);
    assert.ok(det.subagentes.chamadas.some((c) => c.subagent_type === 'revisor-independente'));

    // Oportunidades de economia detectadas e rotuladas como estimativa
    const regras = new Set(det.oportunidades.map((o) => o.regra));
    assert.ok(regras.has('cache_frio_pausa'), 'detecta cache frio');
    assert.ok(regras.has('briefing_subagente_grande'), 'detecta briefing grande');
    assert.ok(regras.has('sessao_longa_sem_compactar'), 'detecta retomada >8h');
    for (const op of det.oportunidades) {
      assert.equal(op.rotulo, 'estimativa');
      assert.ok(op.evidencia && op.acao);
    }

    // Privacidade: nenhum conteudo de prompt/resultado aparece no JSON serializado
    const serializado = JSON.stringify(det);
    assert.ok(!serializado.includes('/repo/src/a.js'), 'caminho de arquivo nao vaza');
    assert.ok(!serializado.includes('bbbbbbbbbb'), 'conteudo de tool_result nao vaza');
    assert.ok(!serializado.includes('pppppppppp'), 'conteudo de briefing nao vaza');

    // Persistencia e restauracao SQLite + relatorio MD/CSV
    const p = new Persistencia(':memory:');
    p.salvar(ag);
    const ag2 = new Agregador({ agora: () => Date.parse('2026-11-23T20:02:00Z') });
    p.restaurar(ag2);
    const det2 = ag2.detalheSessao(sessao);
    assert.equal(det2.timeline.length, det.timeline.length);
    assert.equal(Math.round(det2.atribuicao.delta_total_medido), Math.round(det.atribuicao.delta_total_medido));

    const md = relatorio(p, { formato: 'md' });
    assert.ok(md.includes('## Por tipo de token'));
    assert.ok(md.includes('## Por dia'));
    assert.ok(md.includes('## Atribuição de crescimento de contexto'));
    assert.ok(md.includes('## Oportunidades de economia'));
    assert.ok(!md.includes('/repo/src/a.js'));

    const csv = relatorio(p, { formato: 'csv' });
    assert.ok(csv.includes('claude-opus-5-5'));
    p.fechar();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('leitura em fluxo processa arquivo grande em chunks sem falhar', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'painel-stream-'));
  try {
    const arq = join(dir, 'grande.jsonl');
    // Gera ~500 KB (> 64 KB chunk) com 500 linhas sinteticas
    const linhas = [];
    for (let i = 0; i < 500; i++) {
      linhas.push(JSON.stringify(evAssistant({
        id: `big-${i}`, sessao: 'sessao-grande', modelo: 'claude-haiku-5-5',
        ts: new Date(Date.parse('2026-11-23T10:00:00Z') + i * 1000).toISOString(),
        inp: 10, cw: 100, cr: 10000 + i * 100, out: 50,
        content: [{ type: 'text', text: 'x'.repeat(700) }],
      })));
    }
    writeFileSync(arq, `${linhas.join('\n')}\n`, 'utf8');
    const ag = new Agregador();
    const leitor = new LeitorTranscripts(dir, (ev, meta) => ag.ingerir(ev, meta), { chunkBytes: 16 * 1024 });
    const n = await leitor.varrer();
    assert.equal(n, 500);
    assert.equal(ag.estado().totais.requisicoes, 500);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
