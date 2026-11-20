// Leitura incremental dos transcripts JSONL do Claude Code.
// Usa varredura periódica (stat + leitura do trecho novo) em vez de inotify: funciona em
// bind mounts do Docker Desktop no Windows e no macOS, onde eventos de arquivo não chegam.

import { readdir, open } from 'node:fs/promises';
import { join } from 'node:path';

export class LeitorTranscripts {
  constructor(raiz, aoEvento, { profundidade = 6 } = {}) {
    this.raiz = raiz;
    this.aoEvento = aoEvento;
    this.profundidade = profundidade;
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
      if (e.isDirectory()) saida.push(...await this.#listar(caminho, nivel + 1));
      else if (e.isFile() && e.name.endsWith('.jsonl')) saida.push(caminho);
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
      const tamanho = info.size - st.posicao;
      const buf = Buffer.alloc(tamanho);
      await fh.read(buf, 0, tamanho, st.posicao);
      st.posicao = info.size;
      const texto = st.resto + buf.toString('utf8');
      const linhas = texto.split('\n');
      st.resto = linhas.pop(); // linha ainda incompleta
      this.estado.set(caminho, st);
      let n = 0;
      for (const linha of linhas) {
        if (!linha.trim()) continue;
        let ev;
        try { ev = JSON.parse(linha); } catch { this.erros++; continue; }
        this.aoEvento(ev);
        n++;
      }
      return n;
    } finally {
      await fh.close();
    }
  }
}
