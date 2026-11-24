// Análise interna de consumo de tokens por sessão, fio, atribuição proporcional,
// subagentes e oportunidades de economia. Nunca armazena texto de mensagens nem caminhos.

import { createHash } from 'node:crypto';

const PESOS = { input: 1, cache_write: 2, cache_read: 0.1, output: 5 };
const PAUSA_LONGA_S = 8 * 3600;

function eq(u) {
  return (u.input || 0) * PESOS.input + (u.cache_write || 0) * PESOS.cache_write
    + (u.cache_read || 0) * PESOS.cache_read + (u.output || 0) * PESOS.output;
}

export function hashCurto(valor) {
  return createHash('sha256').update(String(valor)).digest('hex').slice(0, 12);
}

export function tamanhoBytesConteudo(content) {
  if (content == null) return 0;
  if (typeof content === 'string') return Buffer.byteLength(content, 'utf8');
  if (Array.isArray(content)) {
    let total = 0;
    for (const item of content) {
      if (typeof item === 'string') total += Buffer.byteLength(item, 'utf8');
      else if (item && typeof item === 'object') {
        for (const k of ['text', 'thinking', 'content']) {
          if (item[k] != null) total += tamanhoBytesConteudo(item[k]);
        }
        if (item.input != null) total += Buffer.byteLength(JSON.stringify(item.input), 'utf8');
      }
    }
    return total;
  }
  if (typeof content === 'object') return Buffer.byteLength(JSON.stringify(content), 'utf8');
  return 0;
}

function chaveFio(sessaoId, fio) {
  return `${sessaoId}::${fio}`;
}

export class AnalisadorConsumo {
  constructor() {
    this.fios = new Map(); // `${sessao}::${fio}` -> { sessao, fio, isSubagente, ordem: [], reqs: Map, pendentes: [], compactacaoPendente: false, toolNomes: Map }
    this.chamadasSubagente = new Map(); // sessao -> [{ tool_use_id, subagent_type, model_solicitado, briefing_bytes, quando }]
    this.leiturasArquivo = new Map(); // sessao -> Map(arquivo_hash -> Set(fio) e contagem)
    this.sujos = { reqs: new Set(), chamadas: new Set(), leituras: new Set() };
  }

  #fio(sessaoId, meta = {}) {
    const fio = meta.fio || 'principal';
    const ch = chaveFio(sessaoId, fio);
    let f = this.fios.get(ch);
    if (!f) {
      f = {
        chave: ch,
        sessao: sessaoId,
        fio,
        isSubagente: Boolean(meta.isSubagente),
        ordem: [],
        reqs: new Map(),
        pendentes: [],
        compactacaoPendente: false,
        toolNomes: new Map(),
      };
      this.fios.set(ch, f);
    }
    return f;
  }

  #registrarLeitura(sessaoId, fio, filePath) {
    if (!filePath) return;
    const h = hashCurto(filePath);
    let mapa = this.leiturasArquivo.get(sessaoId);
    if (!mapa) { mapa = new Map(); this.leiturasArquivo.set(sessaoId, mapa); }
    let rec = mapa.get(h);
    if (!rec) { rec = { hash: h, total: 0, fios: new Set() }; mapa.set(h, rec); }
    rec.total++;
    rec.fios.add(fio);
    this.sujos.leituras.add(`${sessaoId}::${h}`);
  }

  /** Ingestão de qualquer evento JSONL para rastrear contexto, hooks, tools e subagentes. */
  ingerir(ev, meta = {}, agora = Date.now()) {
    if (!ev || typeof ev !== 'object') return;
    const sessaoId = meta.isSubagente && meta.sessaoPai ? meta.sessaoPai : (ev.sessionId || meta.sessaoPai || 'sem-sessao');
    const f = this.#fio(sessaoId, meta);
    const ts = Date.parse(ev.timestamp) || agora;
    const t = ev.type;

    if (t === 'system') {
      if (ev.subtype === 'compact_boundary' || ev.subtype === 'microcompact_boundary' || ev.compactMetadata) {
        f.compactacaoPendente = true;
      }
      return;
    }

    if (t === 'attachment') {
      const att = ev.attachment && typeof ev.attachment === 'object' ? ev.attachment : {};
      const tipo = String(att.type || 'desconhecido');
      const bytes = tamanhoBytesConteudo(att);
      if (bytes > 0) f.pendentes.push({ origem: `hook/attachment:${tipo}`, bytes, hook: true });
      return;
    }

    if (t === 'user') {
      if (ev.isCompactSummary) f.compactacaoPendente = true;
      const content = ev.message?.content;
      if (typeof content === 'string') {
        const bytes = Buffer.byteLength(content, 'utf8');
        if (bytes > 0) {
          if (content.includes('<system-reminder>')) f.pendentes.push({ origem: 'system-reminder:user', bytes, hook: true });
          else if (ev.isMeta) f.pendentes.push({ origem: 'meta/skill:user', bytes, hook: false });
          else f.pendentes.push({ origem: 'usuario:prompt', bytes, hook: false });
        }
      } else if (Array.isArray(content)) {
        for (const b of content) {
          if (!b || typeof b !== 'object') continue;
          if (b.type === 'tool_result') {
            const nome = f.toolNomes.get(b.tool_use_id) || 'tool_desconhecida';
            const bytes = tamanhoBytesConteudo(b.content);
            if (bytes > 0) f.pendentes.push({ origem: `tool_result:${nome}`, bytes, hook: false });
          } else if (b.type === 'text') {
            const txt = String(b.text || '');
            const bytes = Buffer.byteLength(txt, 'utf8');
            if (bytes > 0) {
              if (txt.includes('<system-reminder>')) f.pendentes.push({ origem: 'system-reminder:bloco', bytes, hook: true });
              else if (ev.isMeta) f.pendentes.push({ origem: 'meta/skill:bloco', bytes, hook: false });
              else f.pendentes.push({ origem: 'usuario:texto', bytes, hook: false });
            }
          }
        }
      }
      return;
    }

    if (t !== 'assistant') return;
    const msg = ev.message;
    if (!msg) return;
    const content = Array.isArray(msg.content) ? msg.content : [];

    let disparouSubagente = false;
    const toolsBloco = [];
    let bytesBloco = 0;

    for (const b of content) {
      if (!b || typeof b !== 'object') continue;
      bytesBloco += tamanhoBytesConteudo(b);
      if (b.type === 'tool_use') {
        const nome = String(b.name || 'desconhecida');
        toolsBloco.push(nome);
        if (b.id) f.toolNomes.set(b.id, nome);
        const inp = b.input && typeof b.input === 'object' ? b.input : {};
        if (nome === 'Read' && inp.file_path) this.#registrarLeitura(sessaoId, f.fio, inp.file_path);
        if (nome === 'Agent' || nome === 'Task') {
          disparouSubagente = true;
          const lista = this.chamadasSubagente.get(sessaoId) || [];
          const idChamada = b.id || `${sessaoId}:${ts}:${lista.length}`;
          if (!lista.some((c) => c.id === idChamada)) {
            lista.push({
              id: idChamada,
              sessao: sessaoId,
              subagent_type: String(inp.subagent_type || 'geral'),
              model_solicitado: String(inp.model || 'padrao'),
              briefing_bytes: tamanhoBytesConteudo(inp.prompt),
              quando: ts,
            });
            this.chamadasSubagente.set(sessaoId, lista);
            this.sujos.chamadas.add(idChamada);
          }
        }
      }
    }

    const modelo = msg.model;
    const usage = msg.usage;
    if (!usage || typeof usage !== 'object' || !modelo || modelo === '<synthetic>') return;

    const mid = String(msg.id || ev.uuid);
    let rec = f.reqs.get(mid);
    if (!rec) {
      const hookInjetado = f.pendentes.some((p) => p.hook);
      rec = {
        id: mid,
        sessao: sessaoId,
        fio: f.fio,
        isSubagente: f.isSubagente,
        modelo: String(modelo),
        quando: ts,
        input: 0,
        cache_write: 0,
        cache_write_5m: 0,
        cache_write_1h: 0,
        cache_read: 0,
        output: 0,
        output_bytes: 0,
        tools: [],
        entradas: f.pendentes.splice(0),
        compactacao_marcada: f.compactacaoPendente,
        hook_injetado: hookInjetado,
        subagente_disparado: false,
      };
      f.compactacaoPendente = false;
      f.ordem.push(mid);
      f.reqs.set(mid, rec);
    }

    const cc = usage.cache_creation && typeof usage.cache_creation === 'object' ? usage.cache_creation : {};
    rec.input = Math.max(rec.input, Number(usage.input_tokens) || 0);
    rec.cache_write = Math.max(rec.cache_write, Number(usage.cache_creation_input_tokens) || 0);
    rec.cache_write_5m = Math.max(rec.cache_write_5m, Number(cc.ephemeral_5m_input_tokens) || 0);
    rec.cache_write_1h = Math.max(rec.cache_write_1h, Number(cc.ephemeral_1h_input_tokens) || 0);
    rec.cache_read = Math.max(rec.cache_read, Number(usage.cache_read_input_tokens) || 0);
    rec.output = Math.max(rec.output, Number(usage.output_tokens) || 0);
    rec.output_bytes += bytesBloco;
    if (disparouSubagente) rec.subagente_disparado = true;
    for (const nome of toolsBloco) if (!rec.tools.includes(nome)) rec.tools.push(nome);
    this.sujos.reqs.add(`${f.chave}::${mid}`);
  }

  /** Restaura fatos persistidos no SQLite. */
  restaurar({ requisicoes = [], chamadas = [], leituras = [] }) {
    for (const r of requisicoes) {
      const f = this.#fio(r.sessao, { fio: r.fio, isSubagente: Boolean(r.is_subagente) });
      if (!f.reqs.has(r.id)) f.ordem.push(r.id);
      f.reqs.set(r.id, {
        id: r.id,
        sessao: r.sessao,
        fio: r.fio,
        isSubagente: Boolean(r.is_subagente),
        modelo: r.modelo,
        quando: r.quando,
        input: r.input,
        cache_write: r.cache_write,
        cache_write_5m: r.cache_write_5m || 0,
        cache_write_1h: r.cache_write_1h || 0,
        cache_read: r.cache_read,
        output: r.output,
        output_bytes: r.output_bytes || 0,
        tools: r.tools ? JSON.parse(r.tools) : [],
        entradas: r.entradas ? JSON.parse(r.entradas) : [],
        compactacao_marcada: Boolean(r.compactacao_marcada),
        hook_injetado: Boolean(r.hook_injetado),
        subagente_disparado: Boolean(r.subagente_disparado),
      });
    }
    for (const c of chamadas) {
      const lista = this.chamadasSubagente.get(c.sessao) || [];
      if (!lista.some((x) => x.id === c.id)) lista.push(c);
      this.chamadasSubagente.set(c.sessao, lista);
    }
    for (const l of leituras) {
      let mapa = this.leiturasArquivo.get(l.sessao);
      if (!mapa) { mapa = new Map(); this.leiturasArquivo.set(l.sessao, mapa); }
      mapa.set(l.arquivo_hash, { hash: l.arquivo_hash, total: l.total, fios: new Set(JSON.parse(l.fios || '[]')) });
    }
    this.sujos.reqs.clear();
    this.sujos.chamadas.clear();
    this.sujos.leituras.clear();
  }

  /** Calcula a visão completa de uma sessão: timeline, atribuição, subagentes e oportunidades. */
  analisarSessao(sessaoId) {
    const fiosSessao = [...this.fios.values()].filter((f) => f.sessao === sessaoId);
    if (!fiosSessao.length) return null;

    const timeline = [];
    const atribuicaoMapa = new Map(); // origem -> { delta_tokens, token_reqs, ocorrencias, bytes }
    const maioresEventos = [];
    const fiosSub = [];
    let deltaTotalMedido = 0;

    const somarOrigem = (origem, delta, tokenReqs, bytes) => {
      let g = atribuicaoMapa.get(origem);
      if (!g) { g = { origem, delta_tokens: 0, token_reqs: 0, ocorrencias: 0, bytes: 0 }; atribuicaoMapa.set(origem, g); }
      g.delta_tokens += delta;
      g.token_reqs += tokenReqs;
      g.ocorrencias += 1;
      g.bytes += bytes;
    };

    const leituras = this.leiturasArquivo.get(sessaoId) || new Map();

    for (const f of fiosSessao) {
      const reqs = f.ordem.map((id) => f.reqs.get(id)).filter(Boolean).sort((a, b) => a.quando - b.quando);
      const contextos = reqs.map((r) => r.input + r.cache_write + r.cache_read);
      const quedasIdx = [];
      for (let i = 1; i < contextos.length; i++) {
        if (reqs[i].compactacao_marcada || (contextos[i - 1] > 20_000 && contextos[i] < contextos[i - 1] * 0.65)) {
          quedasIdx.push(i);
        }
      }
      const reqsRestantes = (i) => {
        for (const q of quedasIdx) if (q > i) return q - i;
        return reqs.length - i;
      };

      let subEquiv = 0;
      let subOutputBytes = 0;
      const subModelos = new Set();

      for (let i = 0; i < reqs.length; i++) {
        const r = reqs[i];
        const ctx = contextos[i];
        const taxaCache = ctx > 0 ? r.cache_read / ctx : 0;
        const pausaS = i > 0 ? Math.max(0, (r.quando - reqs[i - 1].quando) / 1000) : 0;
        const retomadaLonga = i > 0 && pausaS >= PAUSA_LONGA_S;
        const cacheFrio = i > 0 && r.cache_write > 15_000 && r.cache_read < ctx * 0.2;
        const compactacao = r.compactacao_marcada || (i > 0 && contextos[i - 1] > 20_000 && ctx < contextos[i - 1] * 0.65);
        const trocaModelo = i > 0 && r.modelo !== reqs[i - 1].modelo;
        const deltaCtx = i > 0 ? ctx - contextos[i - 1] : 0;

        const ponto = {
          idx: i,
          id: r.id,
          fio: f.fio,
          isSubagente: f.isSubagente,
          modelo: r.modelo,
          quando: r.quando,
          input: r.input,
          cache_write: r.cache_write,
          cache_write_5m: r.cache_write_5m,
          cache_write_1h: r.cache_write_1h,
          cache_read: r.cache_read,
          output: r.output,
          equivalente: Math.round(eq(r)),
          contexto: ctx,
          taxa_cache: Number(taxaCache.toFixed(4)),
          delta_contexto: deltaCtx,
          pausa_s: Math.round(pausaS),
          retomada_longa: retomadaLonga,
          cache_frio: cacheFrio,
          compactacao,
          troca_modelo: trocaModelo,
          hook_injetado: r.hook_injetado,
          subagente_disparado: r.subagente_disparado,
          tools: r.tools,
        };
        timeline.push(ponto);

        if (f.isSubagente) {
          subEquiv += eq(r);
          subOutputBytes += r.output_bytes;
          subModelos.add(r.modelo);
        }

        if (i > 0 && deltaCtx > 0) {
          deltaTotalMedido += deltaCtx;
          const itens = [];
          if (reqs[i - 1].output_bytes > 0) itens.push({ origem: 'assistant:output', bytes: reqs[i - 1].output_bytes });
          for (const e of r.entradas) itens.push({ origem: e.origem, bytes: e.bytes });
          const somaBytes = itens.reduce((s, x) => s + x.bytes, 0);
          const restantes = reqsRestantes(i);

          if (somaBytes > 0) {
            const porChave = new Map();
            for (const x of itens) porChave.set(x.origem, (porChave.get(x.origem) || 0) + x.bytes);
            let atribuido = 0;
            const chaves = [...porChave.entries()];
            for (let k = 0; k < chaves.length; k++) {
              const [ch, nb] = chaves[k];
              const parte = k === chaves.length - 1 ? Math.max(0, deltaCtx - atribuido) : deltaCtx * (nb / somaBytes);
              atribuido += parte;
              const tokenReqs = parte * restantes;
              somarOrigem(ch, parte, tokenReqs, nb);
              if (parte >= 500) {
                maioresEventos.push({
                  fio: f.fio,
                  req_idx: i,
                  origem: ch,
                  bytes: nb,
                  delta_tokens: Math.round(parte),
                  reqs_seguintes: restantes,
                  token_reqs: Math.round(tokenReqs),
                  custo_carr_equiv: Math.round(tokenReqs * PESOS.cache_read),
                  rotulo: 'estimativa proporcional',
                });
              }
            }
          } else {
            somarOrigem('nao-atribuido', deltaCtx, deltaCtx * restantes, 0);
          }
        }
      }

      if (f.isSubagente) {
        let reabertos = 0;
        for (const rec of leituras.values()) {
          if (rec.fios.has(f.fio) && rec.fios.size > 1) reabertos++;
        }
        fiosSub.push({
          fio: f.fio,
          requisicoes: reqs.length,
          modelos: [...subModelos],
          ctx_max: contextos.length ? Math.max(...contextos) : 0,
          output_bytes: subOutputBytes,
          arquivos_reabertos: reabertos,
          equivalente: Math.round(subEquiv),
        });
      }
    }

    const origens = [...atribuicaoMapa.values()]
      .map((o) => ({
        ...o,
        delta_tokens: Number(o.delta_tokens.toFixed(2)),
        token_reqs: Math.round(o.token_reqs),
        custo_carr_equiv: Math.round(o.token_reqs * PESOS.cache_read),
      }))
      .sort((a, b) => b.token_reqs - a.token_reqs);

    maioresEventos.sort((a, b) => b.token_reqs - a.token_reqs);
    fiosSub.sort((a, b) => b.equivalente - a.equivalente);

    const chamadas = this.chamadasSubagente.get(sessaoId) || [];
    const porTipoSub = {};
    for (const c of chamadas) porTipoSub[c.subagent_type] = (porTipoSub[c.subagent_type] || 0) + 1;

    const oportunidades = detectarOportunidades({
      sessaoId, timeline, origens, maioresEventos, chamadas, fiosSub, leituras,
    });

    return {
      sessao: sessaoId,
      timeline,
      atribuicao: {
        metodo: 'proporcional',
        delta_total_medido: deltaTotalMedido,
        origens,
        ranking_carregamento: maioresEventos.slice(0, 20),
      },
      subagentes: {
        total_fios: fiosSub.length,
        total_equivalente: fiosSub.reduce((s, x) => s + x.equivalente, 0),
        por_tipo: porTipoSub,
        chamadas,
        fios: fiosSub,
      },
      oportunidades,
    };
  }

  /** Agrega oportunidades, atribuições e subagentes de todas as sessões para as visões globais. */
  resumoGlobal() {
    const sessoesIds = new Set([...this.fios.values()].map((f) => f.sessao));
    const origensGlobais = new Map();
    const oportunidades = [];
    const subagentesResumo = [];
    const porTipoSub = {};
    let totalSubEquiv = 0;
    let totalArquivosReabertos = 0;

    for (const sid of sessoesIds) {
      const det = this.analisarSessao(sid);
      if (!det) continue;
      for (const o of det.atribuicao.origens) {
        let g = origensGlobais.get(o.origem);
        if (!g) { g = { origem: o.origem, delta_tokens: 0, token_reqs: 0, custo_carr_equiv: 0, ocorrencias: 0 }; origensGlobais.set(o.origem, g); }
        g.delta_tokens += o.delta_tokens;
        g.token_reqs += o.token_reqs;
        g.custo_carr_equiv += o.custo_carr_equiv;
        g.ocorrencias += o.ocorrencias;
      }
      oportunidades.push(...det.oportunidades);
      totalSubEquiv += det.subagentes.total_equivalente;
      for (const [k, v] of Object.entries(det.subagentes.por_tipo)) porTipoSub[k] = (porTipoSub[k] || 0) + v;
      for (const sf of det.subagentes.fios) {
        totalArquivosReabertos += sf.arquivos_reabertos;
        subagentesResumo.push({ sessao: sid.slice(0, 8), sessaoId: sid, ...sf });
      }
    }

    oportunidades.sort((a, b) => b.economia_estimada_equiv - a.economia_estimada_equiv);
    subagentesResumo.sort((a, b) => b.equivalente - a.equivalente);

    return {
      atribuicao: [...origensGlobais.values()]
        .map((o) => ({ ...o, delta_tokens: Math.round(o.delta_tokens) }))
        .sort((a, b) => b.token_reqs - a.token_reqs)
        .slice(0, 25),
      subagentes: {
        total_equivalente: totalSubEquiv,
        total_fios: subagentesResumo.length,
        arquivos_reabertos: totalArquivosReabertos,
        por_tipo: porTipoSub,
        top: subagentesResumo.slice(0, 30),
      },
      oportunidades: oportunidades.slice(0, 50),
    };
  }
}

/** Regras explícitas e determinísticas de oportunidade de economia (sempre rotuladas como estimativa). */
export function detectarOportunidades({ sessaoId, timeline, origens, maioresEventos, chamadas, fiosSub, leituras }) {
  const ops = [];
  const curta = sessaoId.slice(0, 8);

  // 1. Cache frio no meio do fio
  const frios = timeline.filter((r) => r.cache_frio);
  if (frios.length) {
    const econ = frios.reduce((s, r) => s + Math.round(r.cache_write * (PESOS.cache_write - PESOS.cache_read)), 0);
    ops.push({
      regra: 'cache_frio_pausa',
      titulo: 'Cache esfriou no meio da sessão',
      severidade: econ > 500_000 ? 'alta' : 'media',
      sessao: curta,
      sessaoId,
      evidencia: `${frios.length} ocorrência(s); maior reescrita: ${Math.max(...frios.map((f) => f.cache_write)).toLocaleString('pt-BR')} tokens`,
      economia_estimada_equiv: econ,
      rotulo: 'estimativa',
      acao: 'Evitar pausas acima do TTL do cache (5 min em subagentes / 1 h no principal) ou recomeçar com resumo estruturado ao voltar.',
    });
  }

  // 2. Resultado de ferramenta grande carregado no contexto
  const grandes = maioresEventos.filter((e) => e.origem.startsWith('tool_result:') && e.delta_tokens >= 3000 && e.reqs_seguintes >= 15);
  for (const e of grandes.slice(0, 3)) {
    ops.push({
      regra: 'resultado_ferramenta_grande',
      titulo: `Saída grande de ${e.origem.replace('tool_result:', '')} mantida no contexto`,
      severidade: e.custo_carr_equiv > 100_000 ? 'alta' : 'media',
      sessao: curta,
      sessaoId,
      evidencia: `${e.fio} req #${e.req_idx}: +${e.delta_tokens.toLocaleString('pt-BR')} tokens × ${e.reqs_seguintes} reqs seguintes`,
      economia_estimada_equiv: Math.round(e.custo_carr_equiv * 0.7),
      rotulo: 'estimativa',
      acao: 'Filtrar saída com rtk/head/grep antes de retornar ao contexto ou isolar a inspeção em subagente descartável.',
    });
  }

  // 3. Sessão longa sem compactar ou retomada > 8h
  const principal = timeline.filter((r) => !r.isSubagente);
  const ctxMaxP = principal.length ? Math.max(...principal.map((r) => r.contexto)) : 0;
  const compactacoes = principal.filter((r) => r.compactacao).length;
  const retomadasLongas = principal.filter((r) => r.retomada_longa);
  if ((ctxMaxP > 200_000 && principal.length >= 80 && compactacoes === 0) || retomadasLongas.length > 0) {
    const excesso = principal.reduce((s, r) => s + Math.max(0, r.contexto - 150_000) * PESOS.cache_read, 0);
    ops.push({
      regra: 'sessao_longa_sem_compactar',
      titulo: retomadasLongas.length ? 'Retomada após pausa > 8 h sem abrir sessão nova' : 'Sessão longa sem compactação',
      severidade: 'alta',
      sessao: curta,
      sessaoId,
      evidencia: `contexto máx ${ctxMaxP.toLocaleString('pt-BR')} tokens em ${principal.length} reqs (${compactacoes} compactações, ${retomadasLongas.length} retomadas >8h)`,
      economia_estimada_equiv: Math.round(excesso || (retomadasLongas[0]?.cache_write || 20_000) * 1.5),
      rotulo: 'estimativa',
      acao: 'Seguir a regra de Retomada de sessão do CLAUDE.md: encerrar com resumo estruturado e abrir sessão limpa.',
    });
  }

  // 4. Mesmo arquivo lido repetidas vezes ou reaberto por subagentes
  const relidos = [...leituras.values()].filter((l) => l.total >= 3 || l.fios.size >= 2);
  if (relidos.length) {
    const excessoLeituras = relidos.reduce((s, l) => s + (l.total - 1), 0);
    ops.push({
      regra: 'arquivo_relido',
      titulo: 'Arquivos relidos várias vezes ou reabertos por subagentes',
      severidade: excessoLeituras >= 10 ? 'media' : 'baixa',
      sessao: curta,
      sessaoId,
      evidencia: `${relidos.length} arquivo(s) (por hash) com ${excessoLeituras} leitura(s) redundante(s)`,
      economia_estimada_equiv: excessoLeituras * 1500,
      rotulo: 'estimativa',
      acao: 'Passar trechos exatos ou resumo no briefing do subagente e evitar reler arquivos que não mudaram.',
    });
  }

  // 5. Briefing de subagente muito grande
  const briefingsGrandes = chamadas.filter((c) => c.briefing_bytes > 12_000);
  if (briefingsGrandes.length) {
    ops.push({
      regra: 'briefing_subagente_grande',
      titulo: 'Briefing de subagente acima de 12 KB',
      severidade: 'media',
      sessao: curta,
      sessaoId,
      evidencia: `${briefingsGrandes.length} chamada(s), maior: ${Math.max(...briefingsGrandes.map((c) => c.briefing_bytes)).toLocaleString('pt-BR')} bytes`,
      economia_estimada_equiv: briefingsGrandes.reduce((s, c) => s + Math.round((c.briefing_bytes / 4) * 2), 0),
      rotulo: 'estimativa',
      acao: 'Referenciar caminhos de arquivo em vez de colar conteúdo extenso no briefing do subagente.',
    });
  }

  // 6. Injeção repetida por hook / attachment
  const hooksPesados = origens.filter((o) => (o.origem.startsWith('hook/') || o.origem.startsWith('system-reminder')) && o.ocorrencias >= 20 && o.token_reqs > 500_000);
  if (hooksPesados.length) {
    const custo = hooksPesados.reduce((s, o) => s + o.custo_carr_equiv, 0);
    ops.push({
      regra: 'injecao_hook_repetida',
      titulo: 'Injeções repetidas de hook/reminder acumulando no contexto',
      severidade: custo > 300_000 ? 'alta' : 'media',
      sessao: curta,
      sessaoId,
      evidencia: hooksPesados.map((h) => `${h.origem} (${h.ocorrencias}×)`).join(', '),
      economia_estimada_equiv: Math.round(custo * 0.6),
      rotulo: 'estimativa',
      acao: 'Reduzir verbosidade de saída dos hooks e injetar apenas deltas quando o estado realmente mudar.',
    });
  }

  // 7. Opus usado em subagentes sem delegação para Sonnet (D-058)
  const subOpus = fiosSub.filter((s) => s.modelos.some((m) => m.includes('opus')));
  const subSonnet = fiosSub.filter((s) => s.modelos.some((m) => m.includes('sonnet')));
  if (subOpus.length >= 5 && subSonnet.length === 0) {
    const equivOpus = subOpus.reduce((s, x) => s + x.equivalente, 0);
    ops.push({
      regra: 'modelo_caro_mecanica',
      titulo: 'Subagentes só em Opus sem uso de Sonnet no mecânico (D-058)',
      severidade: 'alta',
      sessao: curta,
      sessaoId,
      evidencia: `${subOpus.length} subagentes Opus (${equivOpus.toLocaleString('pt-BR')} eq.) e 0 Sonnet`,
      economia_estimada_equiv: Math.round(equivOpus * 0.25),
      rotulo: 'estimativa',
      acao: 'Passar model=sonnet explicitamente ao disparar ajustes de texto, alinhamentos e correções mecânicas.',
    });
  }

  // 8. Proporção elevada de rodadas de revisão
  const revisoes = chamadas.filter((c) => /revis/i.test(c.subagent_type)).length;
  if (revisoes >= 4 && chamadas.length > 0 && revisoes / chamadas.length >= 0.4) {
    const equivSub = fiosSub.reduce((s, x) => s + x.equivalente, 0);
    ops.push({
      regra: 'revisao_excessiva',
      titulo: 'Alta proporção de rodadas de revisão independente',
      severidade: 'media',
      sessao: curta,
      sessaoId,
      evidencia: `${revisoes} de ${chamadas.length} subagentes (${Math.round((100 * revisoes) / chamadas.length)}%) foram revisores`,
      economia_estimada_equiv: Math.round(equivSub * 0.15),
      rotulo: 'estimativa',
      acao: 'Agrupar tarefas correlatas antes da revisão independente e rodar linters/testes locais antes de chamar o revisor.',
    });
  }

  return ops;
}
