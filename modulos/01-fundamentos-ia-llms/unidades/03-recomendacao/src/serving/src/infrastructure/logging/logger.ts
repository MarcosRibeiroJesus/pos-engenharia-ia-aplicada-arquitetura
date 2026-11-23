import pino, { Logger, LoggerOptions } from 'pino';
import { env } from '../../config/env';

export interface StageMetrics {
  stageName: string;
  durationMs: number;
  itemCountBefore?: number;
  itemCountAfter?: number;
  fallbackTriggered?: boolean;
}

/**
 * Lista permitida de campos do log (T085, VT-18, RNF-001, Art. IV e VIII). Tudo o que não estiver aqui
 * sai da linha antes da escrita, inclusive os vínculos do logger filho: prompt, texto do modelo,
 * título e categoria do catálogo, userId, `err` (mensagem e pilha), `detail` do explicador, ARN e
 * mensagem do provedor. Os campos são operacionais (identificador da requisição, etapa, duração,
 * status, categoria do erro, contagens); nenhum carrega texto livre. Campo novo no log exige mudar
 * esta lista e o teste `logger-lista-permitida.test.ts`.
 */
export const CAMPOS_PERMITIDOS_NO_LOG: readonly string[] = Object.freeze([
  'requestId',
  'status',
  'statusCode',
  'durationMs',
  'responseTimeMs',
  'stage',
  'categoria',
  'retentavel',
  'dependencia',
  'origem',
  'erro',
  'tentativas',
  'method',
  'rota',
  'degradedMode',
  'fallbackTriggered',
  'itemCountBefore',
  'itemCountAfter',
  'batchCount',
  'vectorCount',
  'mergedCount',
  'beforeCount',
  'afterCount',
  'finalCount',
  'totalBefore',
  'totalAfter',
  'filteredOutCount',
  'candidatos',
  'descartadas',
  'acimaDoLimite',
  'limite',
  'rerankerModelId',
  'breaker',
  'metricName',
]);

const PERMITIDOS = new Set(CAMPOS_PERMITIDOS_NO_LOG);

/** Valor de texto aceito num campo permitido: identificador curto, sem espaço. */
const VALOR_IDENTIFICADOR = /^[\p{L}\p{N}_.:/-]{1,128}$/u;
const OMITIDO = '[omitido]';

/**
 * Redação por campo: mantém só os campos da lista e, neles, só número finito, booleano ou
 * identificador curto. Texto livre (com espaço) e ARN viram `[omitido]`: a lista protege o nome do
 * campo, e esta regra protege o valor de um campo permitido preenchido por engano.
 */
function filtrarCampos(obj: Record<string, unknown>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [campo, valor] of Object.entries(obj)) {
    if (!PERMITIDOS.has(campo) || valor === undefined) continue;
    if (typeof valor === 'boolean' || (typeof valor === 'number' && Number.isFinite(valor))) {
      saida[campo] = valor;
    } else if (typeof valor === 'string' && VALOR_IDENTIFICADOR.test(valor) && !/arn:/i.test(valor)) {
      saida[campo] = valor;
    } else {
      saida[campo] = OMITIDO;
    }
  }
  return saida;
}

/**
 * Mensagem aceita: frase curta escrita no código, só com letras, espaço e pontuação simples. Número,
 * aspas, chaves, `%`, `=`, `@`, `<` e ARN indicam dado interpolado (contagem, id, ARN, JSON, frase do
 * modelo com número) e fazem a mensagem virar `[omitido]`; os valores vão nos campos da lista.
 * É defesa em profundidade: um texto só de letras interpolado passa. A proteção principal é o código
 * não interpolar dado na mensagem, e os testes do VT-18 provam isso nos pontos sensíveis.
 */
const MENSAGEM_FIXA = /^[\p{L} ;:,.()/-]{0,160}$/u;

function redigirMensagem(msg: string): string {
  return MENSAGEM_FIXA.test(msg) && !/arn:/i.test(msg) ? msg : OMITIDO;
}

type Destino =(linha: string) => void;
const destinoPadrao: Destino = (linha) => void process.stdout.write(linha);
let destinoAtual: Destino = destinoPadrao;

/**
 * Troca a saída do logger (os testes capturam as linhas do logger real, VT-18). Devolve a função que
 * restaura a saída anterior, para a mutação ficar isolada em cada teste.
 */
export function redirecionarSaidaDoLog(destino: Destino): () => void {
  const anterior = destinoAtual;
  destinoAtual = destino;
  return () => {
    destinoAtual = anterior;
  };
}

const pinoOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  formatters: {
    level: (label) => ({ level: label }),
    // Vínculos do filho (e o pid/hostname do pino) passam pela mesma lista.
    bindings: (bindings) => filtrarCampos(bindings),
    log: (obj) => filtrarCampos(obj),
  },
  hooks: {
    // Um Error passado direto (ou em `err` sem mensagem) faria o pino usar `err.message` como `msg`, e
    // argumentos extras entrariam no `msg` por interpolação. Aqui o erro vira só o nome da classe, e a
    // mensagem é só o texto fixo do código.
    logMethod(args, method) {
      const [primeiro, segundo] = args as unknown[];
      const msg = redigirMensagem(typeof segundo === 'string' ? segundo : '');
      if (primeiro instanceof Error) {
        return method.apply(this, [{ erro: primeiro.name }, msg] as never);
      }
      if (typeof primeiro === 'string') {
        // Só a mensagem, sem os argumentos de interpolação (`%s`), que são dado e não texto fixo.
        return method.apply(this, [redigirMensagem(primeiro)] as never);
      }
      return method.apply(this, [primeiro ?? {}, msg] as never);
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

export const baseLogger: Logger = pino(pinoOptions, { write: (linha: string) => destinoAtual(linha) });

// O pino não passa os vínculos de `child()` pelo `formatters.bindings` (ele o troca pela identidade
// nos filhos). Então o filtro entra aqui: os filhos herdam esta função pelo protótipo, e os netos
// também passam pela lista.
const childDoPino = Object.getPrototypeOf(baseLogger).child as (
  this: Logger,
  bindings: Record<string, unknown>,
  options?: unknown
) => Logger;
(baseLogger as unknown as { child: unknown }).child = function child(
  this: Logger,
  bindings: Record<string, unknown>,
  options?: unknown
): Logger {
  return childDoPino.call(this, filtrarCampos(bindings ?? {}), options);
};

export interface RequestContext {
  requestId: string;
  /** Aceito por compatibilidade; não vai para o log (fora da lista permitida, Art. VIII). */
  userId?: string;
}

export function createChildLogger(context: RequestContext): Logger {
  return baseLogger.child({ requestId: context.requestId });
}

export class StageTimer {
  private startTime: bigint;
  private logger: Logger;
  private stageName: string;

  constructor(logger: Logger, stageName: string) {
    this.logger = logger;
    this.stageName = stageName;
    this.startTime = process.hrtime.bigint();
  }

  public end(extraMetadata: {
    itemCountBefore?: number;
    itemCountAfter?: number;
    fallbackTriggered?: boolean;
    [key: string]: unknown;
  } = {}): number {
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - this.startTime) / 1_000_000;
    const roundedDuration = Math.round(durationMs * 100) / 100;

    this.logger.info({
      stage: this.stageName,
      durationMs: roundedDuration,
      ...extraMetadata,
    }, 'Stage completed'); // etapa e duração vão nos campos `stage` e `durationMs`

    return roundedDuration;
  }
}
