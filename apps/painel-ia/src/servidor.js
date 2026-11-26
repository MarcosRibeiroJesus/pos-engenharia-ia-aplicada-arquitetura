// Servidor HTTP sem dependências: página estática, API de estado, detalhe de sessão, SSE e healthcheck.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PUBLICO = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const ARQUIVOS = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/app.css': ['app.css', 'text/css; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml'],
};
const CACHE = Object.fromEntries(Object.entries(ARQUIVOS).map(([rota, [arq, tipo]]) => [rota, { corpo: readFileSync(join(PUBLICO, arq)), tipo }]));

const SEGURANCA = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cache-Control': 'no-store',
};
const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const MAX_CLIENTES = 20;
const ID_SESSAO_RE = /^[a-zA-Z0-9_:-]{1,128}$/;

function nomeDoHost(host = '') {
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1);
  return host.split(':')[0].toLowerCase();
}

export function criarServidor({ estado, detalheSessao = () => null, hostsPermitidos = [], extras = {} }) {
  const permitidos = new Set([...HOSTS_LOCAIS, ...hostsPermitidos.map((h) => h.toLowerCase())]);
  const clientes = new Set();

  const enviar = (res, corpo, tipo, status = 200) => {
    res.writeHead(status, { ...SEGURANCA, 'Content-Type': tipo });
    res.end(corpo);
  };

  const srv = createServer(async (req, res) => {
    if (!permitidos.has(nomeDoHost(req.headers.host))) return enviar(res, 'Host não permitido', 'text/plain; charset=utf-8', 421);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return enviar(res, 'Método não permitido', 'text/plain; charset=utf-8', 405);
    }
    const rota = (req.url || '/').split('?')[0];

    if (rota === '/healthz') return enviar(res, 'ok', 'text/plain; charset=utf-8');
    if (rota === '/api/estado') return enviar(res, JSON.stringify(estado()), 'application/json; charset=utf-8');
    if (rota.startsWith('/api/sessao/')) {
      const id = decodeURIComponent(rota.slice('/api/sessao/'.length));
      if (!ID_SESSAO_RE.test(id)) return enviar(res, 'ID de sessão inválido', 'text/plain; charset=utf-8', 400);
      const det = detalheSessao(id);
      if (!det) return enviar(res, 'Sessão não encontrada', 'text/plain; charset=utf-8', 404);
      return enviar(res, JSON.stringify(det), 'application/json; charset=utf-8');
    }
    if (rota === '/eventos') {
      if (clientes.size >= MAX_CLIENTES) return enviar(res, 'Muitas conexões', 'text/plain; charset=utf-8', 503);
      res.writeHead(200, { ...SEGURANCA, 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`retry: 3000\nevent: estado\ndata: ${JSON.stringify(estado())}\n\n`);
      clientes.add(res);
      req.on('close', () => clientes.delete(res));
      return undefined;
    }
    // Só rotas próprias do objeto: '/constructor' ou '/__proto__' não podem virar chamada (CodeQL js/unvalidated-dynamic-method-call).
    if (Object.hasOwn(extras, rota) && typeof extras[rota] === 'function') {
      try {
        const [corpo, tipo, nome] = await extras[rota]();
        if (nome) res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
        return enviar(res, corpo, tipo);
      } catch (e) {
        // a mensagem da rota não deve trazer segredo; o chamador só precisa saber que falhou
        return enviar(res, JSON.stringify({ ok: false, erro: String(e.message || 'falha') }), 'application/json; charset=utf-8', 502);
      }
    }
    const arq = Object.hasOwn(CACHE, rota) ? CACHE[rota] : undefined;
    if (!arq) return enviar(res, 'Não encontrado', 'text/plain; charset=utf-8', 404);
    return enviar(res, req.method === 'HEAD' ? '' : arq.corpo, arq.tipo);
  });

  const pulso = setInterval(() => { for (const c of clientes) c.write(': pulso\n\n'); }, 25_000);
  pulso.unref();

  srv.notificar = () => {
    if (!clientes.size) return;
    const dados = `event: estado\ndata: ${JSON.stringify(estado())}\n\n`;
    for (const c of clientes) c.write(dados);
  };
  srv.fecharTudo = () => {
    clearInterval(pulso);
    for (const c of clientes) c.end();
    clientes.clear();
    srv.closeAllConnections?.();
    srv.close();
  };
  return srv;
}
