import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Agregador } from '../src/agregador.js';
import { Persistencia } from '../src/persistencia.js';
import {
  carregarPrecos, precoDoModelo, custoRequisicao, percentil, resumoModelos, LIMITE_PAUSA_MS,
} from '../src/modelos.js';

const PRECOS = carregarPrecos();
const req = (o) => ({
  modelo: 'claude-opus-5-5', quando: 0, quando_anterior: null, tipo_anterior: null,
  input: 0, cache_write: 0, cache_write_5m: 0, cache_write_1h: 0, cache_read: 0, output: 0, ...o,
});

// ---------- tabela de preços (entrada do dono, valores exatos do briefing) ----------

test('precos.json traz fonte, data de consulta e status "conferir" em todos os modelos', () => {
  assert.equal(PRECOS.fonte, 'https://platform.claude.com/docs/en/about-claude/pricing');
  assert.equal(PRECOS.consultado_em, '2026-11-24');
  for (const p of PRECOS.modelos) assert.equal(p.status, 'conferir');
  const opus = precoDoModelo('claude-opus-5-5', PRECOS);
  assert.deepEqual(
    [opus.faixas[0].entrada, opus.faixas[0].saida, opus.faixas[0].cache_escrita_5m, opus.faixas[0].cache_escrita_1h, opus.faixas[0].cache_leitura],
    [4, 20, 5, 8, 0.2],
  );
  const sonnet = precoDoModelo('claude-sonnet-5-5', PRECOS);
  assert.equal(sonnet.faixas[0].cache_escrita_1h, null);
});

test('modelo fora da tabela fica sem preço cadastrado e sem custo', () => {
  assert.equal(precoDoModelo('claude-fable-1', PRECOS), null);
  assert.equal(precoDoModelo('claude-haiku-4-5-20251001', PRECOS), null);
  const c = custoRequisicao(req({ modelo: 'claude-fable-1', input: 1000, output: 1000 }), null);
  assert.equal(c.usd, null);
  assert.equal(c.motivo, 'sem preço cadastrado');
});

// ---------- custo ----------

test('custo do Opus: tokens × preço por MTok em cada tipo', () => {
  const p = precoDoModelo('claude-opus-5-5', PRECOS);
  const c = custoRequisicao(req({ input: 1_000_000, output: 1_000_000, cache_write: 2_000_000,
    cache_write_5m: 1_000_000, cache_write_1h: 1_000_000, cache_read: 1_000_000 }), p);
  assert.ok(Math.abs(c.usd - (4 + 20 + 5 + 8 + 0.2)) < 1e-9);
  assert.deepEqual(c.semPreco, {});
});

test('Haiku 5.5 aplica a faixa por requisição: até 100 mil tokens de entrada e acima disso', () => {
  const p = precoDoModelo('claude-haiku-5-5', PRECOS);
  // prompt = input + cache_write + cache_read = 100 000 → faixa de baixo
  const baixo = custoRequisicao(req({ modelo: 'claude-haiku-5-5', input: 50_000, cache_read: 50_000, output: 1_000_000 }), p);
  assert.ok(Math.abs(baixo.usd - (0.05 * 0.10 + 0.05 * 0.01 + 0.50)) < 1e-12);
  assert.equal(baixo.faixa, 0);
  // prompt = 100 001 → faixa de cima
  const alto = custoRequisicao(req({ modelo: 'claude-haiku-5-5', input: 50_001, cache_read: 50_000, output: 1_000_000 }), p);
  assert.ok(Math.abs(alto.usd - (0.050001 * 0.50 + 0.05 * 0.05 + 2.50)) < 1e-12);
  assert.equal(alto.faixa, 1);
});

test('tipo de token sem preço (cache escrito do Haiku, 1h do Sonnet) não vira custo: fica listado como sem preço', () => {
  const haiku = precoDoModelo('claude-haiku-5-5', PRECOS);
  const c = custoRequisicao(req({ modelo: 'claude-haiku-5-5', input: 1000, cache_write: 3000, cache_write_1h: 3000 }), haiku);
  assert.ok(Math.abs(c.usd - 1000 * 0.10 / 1e6) < 1e-15);
  assert.deepEqual(c.semPreco, { cache_escrita_1h: 3000 });
  const sonnet = precoDoModelo('claude-sonnet-5-5', PRECOS);
  const s = custoRequisicao(req({ modelo: 'claude-sonnet-5-5', cache_write: 10, cache_write_5m: 4, cache_write_1h: 6 }), sonnet);
  assert.ok(Math.abs(s.usd - 4 * 2.5 / 1e6) < 1e-15);
  assert.deepEqual(s.semPreco, { cache_escrita_1h: 6 });
});

test('cache escrito sem a divisão 5m/1h não é precificado por suposição', () => {
  const p = precoDoModelo('claude-opus-5-5', PRECOS);
  const c = custoRequisicao(req({ cache_write: 100 }), p);
  assert.equal(c.usd, 0);
  assert.deepEqual(c.semPreco, { cache_escrita_sem_ttl: 100 });
});

// ---------- estatística ----------

test('mediana e p90 por interpolação linear', () => {
  assert.equal(percentil([], 0.5), null);
  assert.equal(percentil([7], 0.9), 7);
  assert.equal(percentil([4, 1, 3, 2], 0.5), 2.5);
  assert.equal(percentil([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9.1);
  assert.equal(percentil([10, 20, 30], 0.5), 20);
});

// ---------- latência e vazão ----------

test('latência: Δ negativo e Δ acima de 10 minutos são descartados; grupos separados por evento anterior', () => {
  const reqs = [
    req({ quando: 2_000, quando_anterior: 1_000, tipo_anterior: 'ferramenta', output: 100 }), // 1 s
    req({ quando: 5_000, quando_anterior: 2_000, tipo_anterior: 'ferramenta', output: 300 }), // 3 s
    req({ quando: 1_000, quando_anterior: 2_000, tipo_anterior: 'ferramenta', output: 10 }), // negativo
    req({ quando: LIMITE_PAUSA_MS + 1, quando_anterior: 0, tipo_anterior: 'ferramenta', output: 10 }), // pausa
    req({ quando: LIMITE_PAUSA_MS, quando_anterior: 0, tipo_anterior: 'usuario', output: 10 }), // exatamente 10 min: entra
    req({ quando: 9_000, quando_anterior: 1_000, tipo_anterior: 'usuario', output: 10 }), // 8 s
    req({ quando: 9_000 }), // sem evento anterior medido
  ];
  const [m] = resumoModelos(reqs, PRECOS).modelos;
  assert.equal(m.requisicoes, 7);
  assert.equal(m.latencia.ferramenta.n, 2);
  assert.equal(m.latencia.ferramenta.mediana_ms, 2_000);
  assert.equal(m.latencia.ferramenta.p90_ms, 2_800);
  assert.equal(m.latencia.usuario.n, 2);
  assert.equal(m.latencia.usuario.mediana_ms, (LIMITE_PAUSA_MS + 8_000) / 2);
  assert.deepEqual(m.latencia.descartes, { negativo: 1, pausa: 1, sem_anterior: 1 });
  // vazão só no grupo "ferramenta": 100/1 e 300/3 tokens por segundo
  assert.equal(m.vazao.n, 2);
  assert.equal(m.vazao.mediana_tps, 100);
});

test('sem latência medida o resumo diz nao-medido e o motivo, nunca um número', () => {
  const [m] = resumoModelos([req({ quando: 5 })], PRECOS).modelos;
  assert.equal(m.latencia.ferramenta.status, 'nao-medido');
  assert.match(m.latencia.ferramenta.motivo, /sem evento anterior/);
  assert.equal(m.latencia.ferramenta.mediana_ms, undefined);
  assert.equal(m.vazao.status, 'nao-medido');
});

test('resumo por modelo: tokens por tipo, acerto do cache e custo rotulado como estimativa', () => {
  const reqs = [
    req({ input: 100, cache_write: 100, cache_write_5m: 100, cache_read: 800, output: 50 }),
    req({ modelo: 'claude-mythos-1', input: 10, output: 10 }),
  ];
  const r = resumoModelos(reqs, PRECOS);
  assert.equal(r.precos.status, 'conferir');
  const opus = r.modelos.find((m) => m.modelo === 'claude-opus-5-5');
  assert.deepEqual(opus.tokens, { input: 100, cache_write_5m: 100, cache_write_1h: 0, cache_write_sem_ttl: 0, cache_read: 800, output: 50 });
  assert.equal(opus.taxa_cache, 0.8);
  assert.equal(opus.custo.rotulo, 'estimativa, preços a conferir');
  assert.ok(Math.abs(opus.custo.usd - (100 * 4 + 100 * 5 + 800 * 0.2 + 50 * 20) / 1e6) < 1e-15);
  assert.equal(opus.custo.parcial, false);
  const mythos = r.modelos.find((m) => m.modelo === 'claude-mythos-1');
  assert.equal(mythos.custo.usd, null);
  assert.equal(mythos.custo.status, 'sem preço cadastrado');
});

// ---------- ingestão: horário e tipo do evento anterior ----------

const T = (s) => `2026-11-24T10:00:${String(s).padStart(2, '0')}.000Z`;
const assist = (id, s, extra = {}) => ({ type: 'assistant', sessionId: 's1', timestamp: T(s), gitBranch: 'plataforma/x',
  message: { id, model: 'claude-opus-5-5', usage: { input_tokens: 1, output_tokens: 40 }, content: [{ type: 'text', text: 'x' }] }, ...extra });

test('a ingestão guarda o horário e o tipo do evento anterior (ferramenta ou usuário) e ignora anexos de hook', () => {
  const a = new Agregador();
  a.ingerir({ type: 'user', sessionId: 's1', timestamp: T(0), message: { content: 'pergunta' } });
  a.ingerir({ type: 'attachment', sessionId: 's1', timestamp: T(1), attachment: { type: 'hook_success', content: 'ok' } });
  a.ingerir(assist('m1', 3));
  a.ingerir(assist('m1', 4)); // segundo bloco da mesma mensagem não muda nada
  a.ingerir({ type: 'user', sessionId: 's1', timestamp: T(10), message: { content: [{ type: 'tool_result', tool_use_id: 't', content: 'r' }] } });
  a.ingerir(assist('m2', 12));
  a.ingerir(assist('m3', 13)); // sem evento de usuário entre m2 e m3
  const reqs = [...a.consumo.requisicoes()];
  const por = Object.fromEntries(reqs.map((r) => [r.id, r]));
  assert.equal(por.m1.quando_anterior, Date.parse(T(0)));
  assert.equal(por.m1.tipo_anterior, 'usuario');
  assert.equal(por.m2.quando_anterior, Date.parse(T(10)));
  assert.equal(por.m2.tipo_anterior, 'ferramenta');
  assert.equal(por.m3.quando_anterior, null);
  const [m] = resumoModelos(reqs, PRECOS).modelos;
  assert.equal(m.latencia.ferramenta.mediana_ms, 2_000);
  assert.equal(m.vazao.mediana_tps, 20);
});

// ---------- persistência e migração ----------

const ESQUEMA_V2 = `
CREATE TABLE requisicoes_detalhe (
  id TEXT NOT NULL, sessao TEXT NOT NULL, fio TEXT NOT NULL, is_subagente INTEGER NOT NULL,
  modelo TEXT NOT NULL, quando INTEGER NOT NULL,
  input INTEGER NOT NULL, cache_write INTEGER NOT NULL, cache_write_5m INTEGER NOT NULL, cache_write_1h INTEGER NOT NULL,
  cache_read INTEGER NOT NULL, output INTEGER NOT NULL, output_bytes INTEGER NOT NULL,
  tools TEXT NOT NULL, entradas TEXT NOT NULL,
  compactacao_marcada INTEGER NOT NULL, hook_injetado INTEGER NOT NULL, subagente_disparado INTEGER NOT NULL,
  PRIMARY KEY (sessao, fio, id)
);
CREATE TABLE meta (chave TEXT PRIMARY KEY, valor TEXT);
INSERT INTO meta VALUES ('versao_esquema', '2');
INSERT INTO requisicoes_detalhe VALUES ('velha', 's0', 'principal', 0, 'claude-opus-5-5', 1000,
  10, 0, 0, 0, 0, 5, 0, '[]', '[]', 0, 0, 0);
`;

test('migração do esquema 2 para 3 preserva as linhas antigas, com latência nula (nao-medido)', async () => {
  const caminho = join(await mkdtemp(join(tmpdir(), 'painel-mig-')), 'painel.db');
  const velho = new DatabaseSync(caminho);
  velho.exec(ESQUEMA_V2);
  velho.close();

  const p = new Persistencia(caminho);
  const versao = p.consulta("SELECT valor FROM meta WHERE chave = 'versao_esquema'")[0].valor;
  assert.equal(versao, '3');
  const linhas = p.consulta('SELECT id, input, output, quando_anterior, tipo_anterior FROM requisicoes_detalhe');
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].id, 'velha');
  assert.equal(linhas[0].input, 10);
  assert.equal(linhas[0].quando_anterior, null);
  assert.equal(linhas[0].tipo_anterior, null);

  const a = new Agregador();
  p.restaurar(a);
  const [m] = resumoModelos([...a.consumo.requisicoes()], PRECOS).modelos;
  assert.equal(m.requisicoes, 1);
  assert.equal(m.latencia.ferramenta.status, 'nao-medido');
  p.fechar();

  // abrir de novo não migra duas vezes nem perde dado
  const p2 = new Persistencia(caminho);
  assert.equal(p2.consulta('SELECT COUNT(*) n FROM requisicoes_detalhe')[0].n, 1);
  p2.fechar();
});

test('o horário do evento anterior sobrevive a salvar e restaurar, e reler o transcript preenche linha antiga', async () => {
  const caminho = join(await mkdtemp(join(tmpdir(), 'painel-mig-')), 'painel.db');
  const a = new Agregador();
  a.ingerir({ type: 'user', sessionId: 's1', timestamp: T(10), message: { content: [{ type: 'tool_result', tool_use_id: 't', content: 'r' }] } });
  a.ingerir(assist('m2', 12));
  const p = new Persistencia(caminho);
  p.salvar(a);
  const b = new Agregador();
  p.restaurar(b);
  const r = [...b.consumo.requisicoes()][0];
  assert.equal(r.quando_anterior, Date.parse(T(10)));
  assert.equal(r.tipo_anterior, 'ferramenta');

  // linha antiga sem horário anterior: reler o transcript preenche
  p.db.exec('UPDATE requisicoes_detalhe SET quando_anterior = NULL, tipo_anterior = NULL');
  const c = new Agregador();
  p.restaurar(c);
  c.ingerir({ type: 'user', sessionId: 's1', timestamp: T(10), message: { content: [{ type: 'tool_result', tool_use_id: 't', content: 'r' }] } });
  c.ingerir(assist('m2', 12));
  p.salvar(c);
  const linha = p.consulta('SELECT quando_anterior, tipo_anterior FROM requisicoes_detalhe')[0];
  assert.equal(linha.quando_anterior, Date.parse(T(10)));
  assert.equal(linha.tipo_anterior, 'ferramenta');
  p.fechar();
});

// ---------- interface ----------

test('a página tem a aba Modelos com os rótulos de estimativa e de latência', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /data-aba="modelos"/);
  assert.match(html, /data-painel="modelos"/);
  assert.match(html, /estimativa, preços a conferir/);
  assert.match(html, /tempo observado entre eventos; inclui processamento local e rede; não é tempo até o primeiro token/);
});
