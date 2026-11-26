import { existsSync as fsExistsSync } from 'node:fs';
import { posix, win32 } from 'node:path';

export function catalogoPerfis(platform = process.platform, env = process.env) {
  const shellCandidatos = platform === 'win32'
    ? [
        { comando: 'pwsh.exe', args: ['-NoLogo'] },
        { comando: 'powershell.exe', args: ['-NoLogo'] },
      ]
    : [{ comando: env.SHELL || 'bash', args: [] }];

  return [
    {
      id: 'claude-code',
      nome: 'Claude Code',
      cor: '#d97757',
      icone: 'C',
      descricao: 'Agente principal (Claude Code CLI)',
      candidatos: [{ comando: 'claude', args: [] }],
    },
    {
      id: 'antigravity',
      nome: 'Antigravity',
      cor: '#60a5fa',
      icone: 'A',
      descricao: 'Google Antigravity CLI (Gemini)',
      candidatos: [{ comando: 'agy', args: [] }],
    },
    {
      id: 'copilot',
      nome: 'GitHub Copilot',
      cor: '#a78bfa',
      icone: 'G',
      descricao: 'GitHub Copilot CLI',
      candidatos: [
        { comando: 'copilot', args: [] },
        { comando: 'gh', args: ['copilot'] },
      ],
    },
    {
      id: 'shell',
      nome: 'Shell',
      cor: '#34d399',
      icone: '>',
      descricao: platform === 'win32' ? 'Terminal livre (PowerShell)' : 'Terminal livre (Shell)',
      candidatos: shellCandidatos,
    },
  ];
}

export function encontrarExecutavel(comando, opts = {}) {
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? process.env;
  const existsSync = opts.existsSync ?? fsExistsSync;

  if (!comando) return null;
  const pathMod = platform === 'win32' ? win32 : posix;
  if (pathMod.isAbsolute(comando)) return existsSync(comando) ? comando : null;

  const pathEnv = env.PATH || env.Path || '';
  const dirs = pathEnv.split(pathMod.delimiter).filter(Boolean);
  const exts = platform === 'win32'
    ? (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : [''];

  const temExtensao = platform === 'win32' && /\.[a-z0-9]+$/i.test(comando);
  const sufixos = temExtensao ? [''] : exts.map((e) => e.toLowerCase());

  for (const dir of dirs) {
    for (const ext of sufixos) {
      const candidato = pathMod.join(dir, `${comando}${ext}`);
      if (existsSync(candidato)) return candidato;
      if (platform === 'win32' && ext) {
        const maiusculo = pathMod.join(dir, `${comando}${ext.toUpperCase()}`);
        if (existsSync(maiusculo)) return maiusculo;
      }
    }
  }
  return null;
}

export function listarPerfis(opts = {}) {
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? process.env;
  return catalogoPerfis(platform, env).map((perfil) => {
    let comandoResolvido = null;
    let args = [];
    for (const c of perfil.candidatos) {
      const encontrado = encontrarExecutavel(c.comando, opts);
      if (encontrado) {
        comandoResolvido = encontrado;
        args = c.args;
        break;
      }
    }
    return {
      id: perfil.id,
      nome: perfil.nome,
      cor: perfil.cor,
      icone: perfil.icone,
      descricao: perfil.descricao,
      disponivel: Boolean(comandoResolvido),
      comandoResolvido,
      args,
    };
  });
}

export function resolverPerfil(perfilId, opts = {}) {
  const perfis = listarPerfis(opts);
  const encontrado = perfis.find((p) => p.id === perfilId);
  if (!encontrado) {
    throw new Error(`perfil desconhecido: ${perfilId}`);
  }
  if (!encontrado.disponivel) {
    throw new Error(`executável do perfil '${perfilId}' não encontrado no PATH`);
  }
  return {
    perfil: encontrado,
    comando: encontrado.comandoResolvido,
    args: encontrado.args,
  };
}
