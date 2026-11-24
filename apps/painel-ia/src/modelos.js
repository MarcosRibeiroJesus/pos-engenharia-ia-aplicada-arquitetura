// Aba "Modelos": requisições, tokens, cache, custo estimado, latência observada e vazão por modelo.
// Tudo sai das requisições medidas nos transcripts. Onde falta dado, o resultado diz "nao-medido" e o
// motivo; nenhum número é estimado para preencher lacuna.
import { readFileSync } from 'node:fs';

export const LIMITE_PAUSA_MS = 10 * 60_000;
export const ROTULO_CUSTO = 'estimativa, preços a conferir';
export const ROTULO_LATENCIA = 'tempo observado entre eventos; inclui processamento local e rede; não é tempo até o primeiro token';
const MTOK = 1_000_000;

/** Lê a tabela de preços (entrada do dono) de src/precos.json. */
export function carregarPrecos(url = new URL('./precos.json', import.meta.url)) {
  return JSON.parse(readFileSync(url, 'utf8'));
}

/** Preço do modelo pelo id exato ou com sufixo de data (`claude-opus-5-5-AAAAMMDD`); null se não cadastrado. */
export function precoDoModelo(modelo, precos) {
  const m = String(modelo || '');
  return precos?.modelos?.find((p) => m === p.modelo || (m.startsWith(`${p.modelo}-`) && /^\d{8}$/.test(m.slice(p.modelo.length + 1)))) || null;
}

/** Tamanho do prompt de uma requisição: entrada nova + cache escrito + cache lido. */
const tamanhoPrompt = (r) => (r.input || 0) + (r.cache_write || 0) + (r.cache_read || 0);

/**
 * Custo de uma requisição em USD. Cada tipo de token com preço null entra em `semPreco` (tokens), não no custo.
 * O cache escrito sem a divisão 5m/1h no transcript também fica sem preço, para não supor o TTL.
 */
export function custoRequisicao(r, preco) {
  if (!preco) return { usd: null, motivo: 'sem preço cadastrado', semPreco: {}, faixa: null };
  const prompt = tamanhoPrompt(r);
  let faixa = preco.faixas.findIndex((f) => f.ate_tokens_entrada == null || prompt <= f.ate_tokens_entrada);
  if (faixa < 0) faixa = preco.faixas.length - 1;
  const f = preco.faixas[faixa];
  const w5 = r.cache_write_5m || 0;
  const w1 = r.cache_write_1h || 0;
  const semTtl = Math.max(0, (r.cache_write || 0) - w5 - w1);
  const partes = [
    ['entrada', r.input || 0],
    ['saida', r.output || 0],
    ['cache_escrita_5m', w5],
    ['cache_escrita_1h', w1],
    ['cache_leitura', r.cache_read || 0],
  ];
  let usd = 0;
  const semPreco = {};
  for (const [campo, tokens] of partes) {
    if (!tokens) continue;
    if (f[campo] == null) semPreco[campo] = (semPreco[campo] || 0) + tokens;
    else usd += (tokens / MTOK) * f[campo];
  }
  if (semTtl) semPreco.cache_escrita_sem_ttl = semTtl;
  return { usd, semPreco, faixa };
}

/** Percentil com interpolação linear entre vizinhos (p em 0..1). null para lista vazia. */
export function percentil(valores, p) {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const pos = (v.length - 1) * p;
  const i = Math.floor(pos);
  const frac = pos - i;
  if (i + 1 >= v.length) return v[i];
  return v[i] + frac * (v[i + 1] - v[i]);
}

const naoMedido = (motivo) => ({ status: 'nao-medido', motivo });

function estatLatencia(lista, descricao) {
  if (!lista.length) return naoMedido(`sem evento anterior do tipo ${descricao} com Δ válido (0 a 10 min)`);
  return { status: 'medido', n: lista.length, mediana_ms: percentil(lista, 0.5), p90_ms: percentil(lista, 0.9) };
}

/** Resumo por modelo a partir das requisições detalhadas (uma por mensagem do assistente). */
export function resumoModelos(requisicoes, precos) {
  const grupos = new Map();
  for (const r of requisicoes) {
    let g = grupos.get(r.modelo);
    if (!g) {
      g = { modelo: r.modelo, requisicoes: 0,
        tokens: { input: 0, cache_write_5m: 0, cache_write_1h: 0, cache_write_sem_ttl: 0, cache_read: 0, output: 0 },
        usd: 0, semPreco: {}, porFaixa: {}, lat: { ferramenta: [], usuario: [] }, tps: [],
        descartes: { negativo: 0, pausa: 0, sem_anterior: 0 } };
      grupos.set(r.modelo, g);
    }
    g.requisicoes++;
    const w5 = r.cache_write_5m || 0;
    const w1 = r.cache_write_1h || 0;
    g.tokens.input += r.input || 0;
    g.tokens.cache_write_5m += w5;
    g.tokens.cache_write_1h += w1;
    g.tokens.cache_write_sem_ttl += Math.max(0, (r.cache_write || 0) - w5 - w1);
    g.tokens.cache_read += r.cache_read || 0;
    g.tokens.output += r.output || 0;

    const c = custoRequisicao(r, precoDoModelo(r.modelo, precos));
    if (c.usd != null) {
      g.usd += c.usd;
      g.porFaixa[c.faixa] = (g.porFaixa[c.faixa] || 0) + 1;
    }
    for (const [k, n] of Object.entries(c.semPreco)) g.semPreco[k] = (g.semPreco[k] || 0) + n;

    const tipo = r.tipo_anterior;
    if (r.quando_anterior == null || (tipo !== 'ferramenta' && tipo !== 'usuario')) { g.descartes.sem_anterior++; continue; }
    const delta = r.quando - r.quando_anterior;
    if (delta < 0) { g.descartes.negativo++; continue; }
    if (delta > LIMITE_PAUSA_MS) { g.descartes.pausa++; continue; }
    g.lat[tipo].push(delta);
    if (tipo === 'ferramenta' && delta > 0) g.tps.push((r.output || 0) / (delta / 1000));
  }

  const modelos = [...grupos.values()].map((g) => {
    const preco = precoDoModelo(g.modelo, precos);
    const promptTotal = g.tokens.input + g.tokens.cache_write_5m + g.tokens.cache_write_1h + g.tokens.cache_write_sem_ttl + g.tokens.cache_read;
    const semPrecoTokens = Object.values(g.semPreco).reduce((s, n) => s + n, 0);
    const custo = preco
      ? { status: 'estimativa', rotulo: ROTULO_CUSTO, usd: g.usd, parcial: semPrecoTokens > 0, sem_preco: g.semPreco,
        sem_preco_tokens: semPrecoTokens, requisicoes_por_faixa: g.porFaixa, nome: preco.nome, preco_status: preco.status }
      : { status: 'sem preço cadastrado', rotulo: ROTULO_CUSTO, usd: null, motivo: 'modelo fora de src/precos.json' };
    return {
      modelo: g.modelo,
      requisicoes: g.requisicoes,
      tokens: g.tokens,
      taxa_cache: promptTotal ? g.tokens.cache_read / promptTotal : null,
      custo,
      latencia: {
        rotulo: ROTULO_LATENCIA,
        ferramenta: estatLatencia(g.lat.ferramenta, 'resultado de ferramenta'),
        usuario: estatLatencia(g.lat.usuario, 'mensagem do usuário'),
        descartes: g.descartes,
      },
      vazao: g.tps.length
        ? { status: 'medido', n: g.tps.length, mediana_tps: percentil(g.tps, 0.5) }
        : naoMedido('sem requisição após resultado de ferramenta com Δ válido (maior que 0 e até 10 min)'),
    };
  }).sort((a, b) => b.requisicoes - a.requisicoes);

  return {
    precos: { fonte: precos.fonte, consultado_em: precos.consultado_em, status: precos.status, unidade: precos.unidade,
      modelos: precos.modelos },
    rotulos: { custo: ROTULO_CUSTO, latencia: ROTULO_LATENCIA },
    limite_pausa_ms: LIMITE_PAUSA_MS,
    modelos,
  };
}
