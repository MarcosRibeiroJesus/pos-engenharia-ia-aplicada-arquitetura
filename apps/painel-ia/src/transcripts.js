// Leitura incremental e em fluxo (chunks fixos) dos transcripts JSONL do Claude Code e do Antigravity.
// Usa varredura periódica (stat + leitura do trecho novo) em vez de inotify: funciona em
// bind mounts do Docker Desktop no Windows e no macOS, onde eventos de arquivo não chegam.

import { readdir, open } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const CHUNK_PADRAO = 64 * 1024;

/** Extrai metadados estruturais do caminho sem expor o caminho completo do sistema. */
export function metadadosArquivo(caminho, origem = 'claude-code') {
  const arq = basename(caminho);
  const pai = dirname(caminho);
  if (origem === 'antigravity') {
    // .../<conversation-id>/.system_generated/logs/transcript.jsonl
    const avo = dirname(pai);
    const bisavo = dirname(avo);
    const convId = basename(pai) === 'logs' && basename(avo) === '.system_generated'
      ? basename(bisavo)
      : basename(pai);
    // Qualifica o ID de sessão pela origem para evitar qualquer colisão com sessões do Claude Code.
    const sessaoPai = `agy:${convId}`;
    return { arquivo: arq, fio: 'principal', isSubagente: false, sessaoPai, agente: 'antigravity' };
  }
  if (basename(pai) === 'subagents') {
    const sessaoPai = basename(dirname(pai));
    return { arquivo: arq, fio: arq.replace(/\.jsonl$/, ''), isSubagente: true, sessaoPai, agente: 'claude-code' };
  }
  return { arquivo: arq, fio: 'principal', isSubagente: false, sessaoPai: arq.replace(/\.jsonl$/, ''), agente: 'claude-code' };
}

/** Normaliza um evento do transcript.jsonl do Antigravity para o contrato comum do Agregador/Consumo. */
export function normalizarEventoAntigravity(ev, meta) {
  if (!ev || typeof ev !== 'object') return null;
  const sessaoId = meta.sessaoPai || 'antigravity-sem-sessao';
  const ts = ev.created_at || new Date().toISOString();
  const t = ev.type;

  if (t === 'USER_INPUT') {
    return {
      type: 'user',
      sessionId: sessaoId,
      timestamp: ts,
      message: { role: 'user', content: typeof ev.content === 'string' ? ev.content : '' },
    };
  }
  if (t === 'SYSTEM_MESSAGE') {
    return {
      type: 'user',
      sessionId: sessaoId,
      timestamp: ts,
      message: { role: 'user', content: `<system-reminder>${typeof ev.content === 'string' ? ev.content : ''}</system-reminder>` },
    };
  }
  if (t === 'GENERIC') {
    return {
      type: 'user',
      sessionId: sessaoId,
      timestamp: ts,
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: `agy-step-${ev.step_index}`, content: typeof ev.content === 'string' ? ev.content : '' }],
      },
    };
  }
  if (t === 'PLANNER_RESPONSE') {
    if (ev.status && ev.status !== 'DONE') return null;
    if (!ev.model) return null;
    // Identidade determinística: exige step_index ou created_at; sem ambos usa hash estável do uso/modelo (nunca Date.now).
    let sufixoId;
    if (ev.step_index != null) sufixoId = `step-${ev.step_index}`;
    else if (ev.created_at) sufixoId = `ts-${ev.created_at}`;
    else sufixoId = `h-${createHash('sha256').update(JSON.stringify([ev.model, ev.input_tokens, ev.cache_read_tokens, ev.output_tokens])).digest('hex').slice(0, 12)}`;
    const content = [];
    if (typeof ev.thinking === 'string' && ev.thinking) content.push({ type: 'thinking', thinking: ev.thinking });
    if (typeof ev.content === 'string' && ev.content) content.push({ type: 'text', text: ev.content });
    if (Array.isArray(ev.tool_calls)) {
      ev.tool_calls.forEach((tc, idx) => {
        if (!tc || typeof tc !== 'object') return;
        const nome = String(tc.name || 'desconhecida');
        const inp = tc.args && typeof tc.args === 'object' ? tc.args : {};
        // Compatibilidade de detecção de leitura de arquivo (Read / read_file)
        const normInp = nome === 'read_file' && inp.Path ? { ...inp, file_path: inp.Path } : inp;
        content.push({ type: 'tool_use', id: `agy-${sufixoId}-${idx}`, name: nome === 'read_file' ? 'Read' : nome, input: normInp });
      });
    }
    return {
      type: 'assistant',
      sessionId: sessaoId,
      timestamp: ev.created_at || null,
      message: {
        id: `${sessaoId}:${sufixoId}`,
        model: String(ev.model),
        content,
        usage: {
          input_tokens: Number(ev.input_tokens) || 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: Number(ev.cache_read_tokens) || 0,
          output_tokens: Number(ev.output_tokens) || 0,
        },
      },
    };
  }
  return null;
}

export class LeitorTranscripts {
  constructor(raiz, aoEvento, { profundidade = 6, chunkBytes = CHUNK_PADRAO, origem = 'claude-code', somenteNome = null } = {}) {
    this.raiz = raiz;
    this.aoEvento = aoEvento;
    this.profundidade = profundidade;
    this.chunkBytes = Math.max(1024, chunkBytes);
    this.origem = origem;
    this.somenteNome = somenteNome;
    this.estado = new Map(); // caminho -> { posicao, resto }
    this.erros = 0;
    this.arquivos = 0;
  }

  async #listar(dir, nivel) {
    if (nivel > this.profundidade) return [];
    let entradas;
    try { entradas = await readdir(dir, { withFileTypes: true }); } catch { return []; }
    const saida = [];
    for (const e of entradas) {
      const caminho = join(dir, e.name);
      if (e.isDirectory()) {
        if (this.origem === 'antigravity' && e.name === 'chunks') continue;
        saida.push(...await this.#listar(caminho, nivel + 1));
      } else if (e.isFile() && e.name.endsWith('.jsonl')) {
        if (this.somenteNome && e.name !== this.somenteNome) continue;
        saida.push(caminho);
      }
    }
    return saida;
  }

  /** Lê o que mudou desde a última varredura. Retorna quantos eventos novos entraram. */
  async varrer() {
    const arquivos = await this.#listar(this.raiz, 0);
    this.arquivos = arquivos.length;
    let novos = 0;
    for (const caminho of arquivos) novos += await this.#lerNovo(caminho);
    return novos;
  }

  async #lerNovo(caminho) {
    // Abre primeiro e mede pelo próprio descritor: o tamanho lido é o do arquivo aberto, sem corrida
    // entre a checagem e o uso (CodeQL js/file-system-race).
    let fh;
    try { fh = await open(caminho, 'r'); } catch { return 0; }
    try {
      const info = await fh.stat();
      let st = this.estado.get(caminho) || { posicao: 0, resto: '' };
      if (info.size < st.posicao) st = { posicao: 0, resto: '' }; // truncado ou reescrito
      if (info.size === st.posicao) { this.estado.set(caminho, st); return 0; }

      const meta = metadadosArquivo(caminho, this.origem);
      const buf = Buffer.allocUnsafe(Math.min(this.chunkBytes, info.size - st.posicao));
      let n = 0;

      while (st.posicao < info.size) {
        const falta = info.size - st.posicao;
        const ler = Math.min(buf.length, falta);
        const { bytesRead } = await fh.read(buf, 0, ler, st.posicao);
        if (!bytesRead) break;
        st.posicao += bytesRead;
        const texto = st.resto + buf.toString('utf8', 0, bytesRead);
        const linhas = texto.split('\n');
        st.resto = linhas.pop(); // linha ainda incompleta
        for (const linha of linhas) {
          if (!linha.trim()) continue;
          let ev;
          try { ev = JSON.parse(linha); } catch { this.erros++; continue; }
          if (this.origem === 'antigravity') {
            ev = normalizarEventoAntigravity(ev, meta);
            if (!ev) continue;
          }
          this.aoEvento(ev, meta);
          n++;
        }
      }
      this.estado.set(caminho, st);
      return n;
    } finally {
      await fh.close();
    }
  }
}
