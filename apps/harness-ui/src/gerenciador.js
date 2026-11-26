import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { resolverPerfil as resolverPerfilPadrao } from './perfis.js';

function limitarInteiro(valor, min, max, padrao) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return padrao;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function anexarBuffer(atual, novo, limiteBytes) {
  const combinado = Buffer.concat([Buffer.from(atual, 'utf8'), Buffer.from(novo, 'utf8')]);
  if (combinado.length <= limiteBytes) return combinado.toString('utf8');
  return combinado.subarray(combinado.length - limiteBytes).toString('utf8');
}

export class GerenciadorTerminais extends EventEmitter {
  constructor({
    ptyFactory,
    raizPadrao,
    limiteBufferBytes = 256 * 1024,
    resolverPerfil = resolverPerfilPadrao,
    envPadrao = process.env,
  }) {
    super();
    if (typeof ptyFactory !== 'function') {
      throw new Error('ptyFactory é obrigatório');
    }
    this.ptyFactory = ptyFactory;
    this.raizPadrao = resolve(raizPadrao || process.cwd());
    this.limiteBufferBytes = limiteBufferBytes;
    this.resolverPerfil = resolverPerfil;
    this.envPadrao = envPadrao;
    this.abas = new Map();
    this.contadorPorPerfil = new Map();
  }

  validarCwd(cwd) {
    if (!cwd) return this.raizPadrao;
    const alvo = isAbsolute(cwd) ? resolve(cwd) : resolve(this.raizPadrao, cwd);
    const rel = relative(this.raizPadrao, alvo);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`diretório fora do diretório permitido: ${cwd}`);
    }
    if (!existsSync(alvo)) return this.raizPadrao;
    return alvo;
  }

  criar({ perfilId, titulo, cwd, cols = 120, rows = 32, projeto = null, promptInicial = null } = {}) {
    const { perfil, comando, args } = this.resolverPerfil(perfilId);
    const dir = this.validarCwd(cwd);
    const c = limitarInteiro(cols, 20, 500, 120);
    const r = limitarInteiro(rows, 5, 200, 32);

    const seq = (this.contadorPorPerfil.get(perfil.id) || 0) + 1;
    this.contadorPorPerfil.set(perfil.id, seq);

    const id = randomUUID().slice(0, 8);
    const tituloFinal = (titulo || '').trim() || (projeto ? `${perfil.nome} · ${projeto}` : `${perfil.nome} #${seq}`);

    const envLimpo = { ...this.envPadrao, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
    const proc = this.ptyFactory(comando, args, {
      name: 'xterm-256color',
      cols: c,
      rows: r,
      cwd: dir,
      env: envLimpo,
    });

    const agora = Date.now();
    const aba = {
      id,
      perfilId: perfil.id,
      nomePerfil: perfil.nome,
      cor: perfil.cor,
      titulo: tituloFinal,
      cwd: dir,
      projeto: projeto || null,
      promptInicial: promptInicial || null,
      status: 'running',
      exitCode: null,
      pid: proc.pid ?? null,
      criadoEm: agora,
      ultimaAtividadeEm: agora,
      buffer: '',
      proc,
    };

    proc.onData((dados) => {
      aba.buffer = anexarBuffer(aba.buffer, dados, this.limiteBufferBytes);
      aba.ultimaAtividadeEm = Date.now();
      this.emit('saida', { id: aba.id, dados });
    });

    proc.onExit(({ exitCode } = {}) => {
      aba.status = 'exited';
      aba.exitCode = Number.isFinite(exitCode) ? exitCode : null;
      aba.ultimaAtividadeEm = Date.now();
      this.emit('status', this.resumo(aba));
    });

    this.abas.set(id, aba);
    const resumo = this.resumo(aba);
    this.emit('criado', resumo);
    return resumo;
  }

  resumo(aba) {
    return {
      id: aba.id,
      perfilId: aba.perfilId,
      nomePerfil: aba.nomePerfil,
      cor: aba.cor,
      titulo: aba.titulo,
      cwd: aba.cwd,
      projeto: aba.projeto,
      promptInicial: aba.promptInicial,
      status: aba.status,
      exitCode: aba.exitCode,
      pid: aba.pid,
      criadoEm: aba.criadoEm,
      ultimaAtividadeEm: aba.ultimaAtividadeEm,
    };
  }

  listar() {
    return Array.from(this.abas.values(), (a) => this.resumo(a));
  }

  obter(id) {
    const aba = this.abas.get(id);
    return aba ? this.resumo(aba) : null;
  }

  lerBuffer(id) {
    const aba = this.abas.get(id);
    return aba ? aba.buffer : null;
  }

  escrever(id, dados) {
    const aba = this.abas.get(id);
    if (!aba) throw new Error(`aba não encontrada: ${id}`);
    if (aba.status !== 'running') throw new Error(`aba encerrada: ${id}`);
    aba.proc.write(String(dados));
  }

  redimensionar(id, cols, rows) {
    const aba = this.abas.get(id);
    if (!aba || aba.status !== 'running') return false;
    const c = limitarInteiro(cols, 20, 500, 120);
    const r = limitarInteiro(rows, 5, 200, 32);
    aba.proc.resize(c, r);
    return true;
  }

  renomear(id, titulo) {
    const aba = this.abas.get(id);
    if (!aba) return null;
    const limpo = String(titulo || '').trim().slice(0, 80);
    if (!limpo) return this.resumo(aba);
    aba.titulo = limpo;
    const res = this.resumo(aba);
    this.emit('status', res);
    return res;
  }

  fechar(id) {
    const aba = this.abas.get(id);
    if (!aba) return false;
    this.abas.delete(id);
    if (aba.status === 'running') {
      try { aba.proc.kill(); } catch { /* processo já encerrado */ }
    }
    this.emit('removido', { id });
    return true;
  }

  fecharTodos() {
    for (const id of Array.from(this.abas.keys())) {
      this.fechar(id);
    }
  }
}
