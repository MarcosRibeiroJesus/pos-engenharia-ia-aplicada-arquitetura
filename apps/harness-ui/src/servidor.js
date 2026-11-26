import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { listarPerfis } from './perfis.js';
import { lerEstadoHarness, montarPromptPassagem } from './harness.js';

const DIR_APP = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' ws://127.0.0.1:* ws://localhost:*",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

const ARQUIVOS_ESTATICOS = {
  '/': { caminho: join(DIR_APP, 'public', 'index.html'), tipo: 'text/html; charset=utf-8' },
  '/index.html': { caminho: join(DIR_APP, 'public', 'index.html'), tipo: 'text/html; charset=utf-8' },
  '/styles.css': { caminho: join(DIR_APP, 'public', 'styles.css'), tipo: 'text/css; charset=utf-8' },
  '/app.js': { caminho: join(DIR_APP, 'public', 'app.js'), tipo: 'application/javascript; charset=utf-8' },
  '/vendor/xterm.js': { caminho: join(DIR_APP, 'node_modules', '@xterm', 'xterm', 'lib', 'xterm.js'), tipo: 'application/javascript; charset=utf-8' },
  '/vendor/xterm.css': { caminho: join(DIR_APP, 'node_modules', '@xterm', 'xterm', 'css', 'xterm.css'), tipo: 'text/css; charset=utf-8' },
  '/vendor/addon-fit.js': { caminho: join(DIR_APP, 'node_modules', '@xterm', 'addon-fit', 'lib', 'addon-fit.js'), tipo: 'application/javascript; charset=utf-8' },
};

function compararToken(recebido, esperado) {
  if (!recebido || !esperado) return false;
  const a = Buffer.from(String(recebido), 'utf8');
  const b = Buffer.from(String(esperado), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function lerCorpoJson(req, limiteBytes = 64 * 1024) {
  return new Promise((ok, erro) => {
    const pedacos = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limiteBytes) {
        erro(new Error('corpo muito grande'));
        req.destroy();
        return;
      }
      pedacos.push(chunk);
    });
    req.on('end', () => {
      if (pedacos.length === 0) return ok({});
      try {
        ok(JSON.parse(Buffer.concat(pedacos).toString('utf8')));
      } catch {
        erro(new Error('JSON inválido'));
      }
    });
    req.on('error', erro);
  });
}

export function criarServidor({
  gerenciador,
  raiz,
  host = '127.0.0.1',
  porta = 4318,
  hostsPermitidos = [],
  painelIaUrl = 'http://localhost:4317',
  token = randomBytes(24).toString('hex'),
  listarPerfisFn = listarPerfis,
}) {
  const hosts = new Set(['127.0.0.1', 'localhost', '[::1]', ...hostsPermitidos]);
  let portaEfetiva = porta;

  const hostValido = (cabecalho) => {
    if (!cabecalho) return false;
    const semPorta = cabecalho.startsWith('[')
      ? cabecalho.slice(0, cabecalho.indexOf(']') + 1)
      : cabecalho.split(':')[0];
    return hosts.has(semPorta.toLowerCase());
  };

  const originValido = (origin) => {
    if (!origin) return true;
    try {
      const u = new URL(origin);
      if (u.protocol !== 'http:') return false;
      const p = u.port ? Number(u.port) : 80;
      return hosts.has(u.hostname.toLowerCase()) && p === portaEfetiva;
    } catch {
      return false;
    }
  };

  const cabecalhosSeguros = (extras = {}) => ({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    ...extras,
  });

  const enviarJson = (res, status, dados) => {
    const corpo = JSON.stringify(dados);
    res.writeHead(status, cabecalhosSeguros({ 'Content-Type': 'application/json; charset=utf-8' }));
    res.end(corpo);
  };

  const servidor = http.createServer(async (req, res) => {
    if (!hostValido(req.headers.host)) {
      return enviarJson(res, 403, { erro: 'Host não permitido' });
    }
    if (!originValido(req.headers.origin)) {
      return enviarJson(res, 403, { erro: 'Origin não permitido' });
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const rota = url.pathname;
    const metodo = req.method || 'GET';

    if (metodo === 'GET' && rota === '/healthz') {
      return enviarJson(res, 200, { ok: true, abas: gerenciador.listar().length });
    }

    if (metodo === 'GET' && Object.hasOwn(ARQUIVOS_ESTATICOS, rota)) {
      const item = ARQUIVOS_ESTATICOS[rota];
      if (!existsSync(item.caminho)) {
        return enviarJson(res, 404, { erro: 'ativo estático não encontrado' });
      }
      res.writeHead(200, cabecalhosSeguros({ 'Content-Type': item.tipo }));
      res.end(readFileSync(item.caminho));
      return;
    }

    if (metodo === 'GET' && rota === '/api/bootstrap') {
      return enviarJson(res, 200, {
        token,
        painelIaUrl,
        perfis: listarPerfisFn(),
        harness: lerEstadoHarness(raiz),
        terminais: gerenciador.listar(),
      });
    }

    if (metodo === 'GET' && rota === '/api/terminais') {
      return enviarJson(res, 200, { terminais: gerenciador.listar() });
    }

    if (metodo === 'GET' && rota === '/api/prompt') {
      const agente = url.searchParams.get('agente') || 'claude-code';
      const tarefa = url.searchParams.get('tarefa') || 'codigo';
      const projeto = url.searchParams.get('projeto') || '';
      return enviarJson(res, 200, { prompt: montarPromptPassagem({ agente, tarefa, projeto }) });
    }

    // Rotas de mutação exigem token efêmero
    if (['POST', 'PATCH', 'DELETE'].includes(metodo)) {
      if (!compararToken(req.headers['x-harness-token'], token)) {
        return enviarJson(res, 401, { erro: 'Token de sessão ausente ou inválido' });
      }
    }

    if (metodo === 'POST' && rota === '/api/terminais') {
      try {
        const body = await lerCorpoJson(req);
        const terminal = gerenciador.criar({
          perfilId: body.perfilId,
          titulo: body.titulo,
          cwd: body.cwd,
          cols: body.cols,
          rows: body.rows,
          projeto: body.projeto,
          promptInicial: body.promptInicial,
        });
        return enviarJson(res, 201, { terminal });
      } catch (e) {
        return enviarJson(res, 400, { erro: e.message });
      }
    }

    const matchId = rota.match(/^\/api\/terminais\/([a-zA-Z0-9_-]+)$/);
    if (matchId && metodo === 'PATCH') {
      try {
        const body = await lerCorpoJson(req);
        const atualizado = gerenciador.renomear(matchId[1], body.titulo);
        if (!atualizado) return enviarJson(res, 404, { erro: 'aba não encontrada' });
        return enviarJson(res, 200, { terminal: atualizado });
      } catch (e) {
        return enviarJson(res, 400, { erro: e.message });
      }
    }

    if (matchId && metodo === 'DELETE') {
      const ok = gerenciador.fechar(matchId[1]);
      if (!ok) return enviarJson(res, 404, { erro: 'aba não encontrada' });
      return enviarJson(res, 200, { ok: true });
    }

    return enviarJson(res, 404, { erro: 'rota não encontrada' });
  });

  // WebSocket por aba
  const wss = new WebSocketServer({ noServer: true });
  const clientesPorAba = new Map();

  const registrarCliente = (id, ws) => {
    if (!clientesPorAba.has(id)) clientesPorAba.set(id, new Set());
    clientesPorAba.get(id).add(ws);
  };

  const removerCliente = (id, ws) => {
    const conjunto = clientesPorAba.get(id);
    if (!conjunto) return;
    conjunto.delete(ws);
    if (conjunto.size === 0) clientesPorAba.delete(id);
  };

  const broadcast = (id, payload) => {
    const conjunto = clientesPorAba.get(id);
    if (!conjunto) return;
    const msg = JSON.stringify(payload);
    for (const ws of conjunto) {
      if (ws.readyState === 1) ws.send(msg);
    }
  };

  const onSaida = ({ id, dados }) => broadcast(id, { tipo: 'saida', dados });
  const onStatus = (terminal) => broadcast(terminal.id, { tipo: 'status', terminal });
  const onRemovido = ({ id }) => {
    broadcast(id, { tipo: 'removido', id });
    const conjunto = clientesPorAba.get(id);
    if (conjunto) {
      for (const ws of conjunto) ws.close(1000, 'aba fechada');
      clientesPorAba.delete(id);
    }
  };

  gerenciador.on('saida', onSaida);
  gerenciador.on('status', onStatus);
  gerenciador.on('removido', onRemovido);

  servidor.on('upgrade', (req, socket, head) => {
    if (!hostValido(req.headers.host) || !originValido(req.headers.origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const match = url.pathname.match(/^\/ws\/terminais\/([a-zA-Z0-9_-]+)$/);
    const tok = url.searchParams.get('token');
    if (!match || !compararToken(tok, token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const id = match[1];
    const terminal = gerenciador.obter(id);
    if (!terminal) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      registrarCliente(id, ws);
      ws.send(JSON.stringify({
        tipo: 'init',
        terminal: gerenciador.obter(id),
        buffer: gerenciador.lerBuffer(id) || '',
      }));

      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
        if (msg.tipo === 'entrada' && typeof msg.dados === 'string') {
          try { gerenciador.escrever(id, msg.dados); } catch { /* aba encerrada */ }
        } else if (msg.tipo === 'resize') {
          gerenciador.redimensionar(id, msg.cols, msg.rows);
        }
      });

      ws.on('close', () => removerCliente(id, ws));
    });
  });

  return {
    token,
    iniciar() {
      return new Promise((ok, erro) => {
        servidor.once('error', erro);
        servidor.listen(porta, host, () => {
          servidor.off('error', erro);
          const addr = servidor.address();
          portaEfetiva = typeof addr === 'object' && addr ? addr.port : porta;
          ok({ host, porta: portaEfetiva, url: `http://${host}:${portaEfetiva}`, token });
        });
      });
    },
    parar() {
      gerenciador.off('saida', onSaida);
      gerenciador.off('status', onStatus);
      gerenciador.off('removido', onRemovido);
      for (const conjunto of clientesPorAba.values()) {
        for (const ws of conjunto) ws.close(1001, 'servidor encerrado');
      }
      clientesPorAba.clear();
      gerenciador.fecharTodos();
      return new Promise((ok) => {
        wss.close(() => servidor.close(() => ok()));
      });
    },
  };
}
