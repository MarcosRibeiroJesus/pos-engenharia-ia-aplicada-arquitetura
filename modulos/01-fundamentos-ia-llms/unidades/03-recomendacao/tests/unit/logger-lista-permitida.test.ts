import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import type Anthropic from '@anthropic-ai/sdk';
import {
  RecommendationExplainer,
  ClaudeMessagesPort,
  GuardrailDeSaidaPort,
  IRecommendationExplainer,
} from '../../src/serving/src/application/recommendation-explainer';
import { GetRecommendationsUseCase } from '../../src/serving/src/application/get-recommendations.use-case';
import { BedrockApplyGuardrailClient } from '../../src/serving/src/infrastructure/bedrock/bedrock-apply-guardrail.client';
import { contratoBedrock } from '../../src/serving/src/config/env';
import {
  baseLogger,
  CAMPOS_PERMITIDOS_NO_LOG,
  redirecionarSaidaDoLog,
} from '../../src/serving/src/infrastructure/logging/logger';
import { buildServer } from '../../src/serving/src/presentation/server';
import { carregarGravacao, erroGravado, guardrailDeSaidaQueAprova, mensagemGravada, transporteAwsGravado } from '../fixtures/claude/gravacoes';

// VT-18 (T085, RNF-001, Art. IV, Art. VIII): com o logger real (mesmas opções, mesmos formatadores;
// só a saída é redirecionada para o teste), uma requisição com explain=true, no sucesso, na
// retentativa e na intervenção do guardrail, não grava prompt, texto do modelo nem título de
// catálogo; cada linha só tem campos da lista permitida. Aceite: a lista fica numa constante, e um
// campo novo no log exige mudar a lista e este teste.
//
// Nenhuma chamada real ao modelo nem à AWS: o Claude vem das gravações (D-006) e o ApplyGuardrail sai
// pelo cliente real do SDK da AWS sobre um transporte falso, sem rede.

/** Campos que o pino põe em toda linha, fora do objeto do chamador. */
const CAMPOS_DO_PINO = ['level', 'time', 'msg'];

/** A lista esperada, escrita aqui de propósito: campo novo no log muda a constante e este teste. */
const LISTA_ESPERADA = [
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
];

/** Dados sintéticos da requisição: nada disso pode aparecer no log. */
const USER_ID = 'usuario-sintetico-vt18';
const TITULOS = ['Garrafa termica sintetica VT18', 'Fonezinho'];
const CATEGORIAS = ['Casa Sintetica VT18', 'AudioSinteticoVT18'];
/** Trechos do prompt de sistema e da tool que nunca vão ao log. */
const TRECHOS_DO_PROMPT = ['Você escreve', 'Critérios', 'record_explanations', '<exemplo>'];
/** Texto que o guardrail devolve no lugar da resposta (gravações de intervenção). */
const TEXTO_DO_GUARDRAIL = 'Sorry, the model cannot answer';
/** ARN, conta e mensagem do provedor (403 gravado e contrato sintético). */
const PROIBIDOS_DO_PROVEDOR = ['arn:', '000000000000', 'not authorized', 'perfilsintetico', 'guardrailsintetico'];

const CONTRATO = {
  BEDROCK_PERFIL_ARN: 'arn:aws:bedrock:us-east-1:000000000000:application-inference-profile/perfilsintetico',
  GUARDRAIL_ID: 'guardrailsintetico',
  GUARDRAIL_VERSAO: '3',
};

/** Todas as frases (`reason`) e textos das gravações usadas: o texto do modelo não pode ir ao log. */
function textosDoModelo(...ids: string[]): string[] {
  const textos: string[] = [];
  for (const id of ids) {
    const content = (carregarGravacao(id).resposta as { content?: Anthropic.ContentBlock[] }).content ?? [];
    for (const bloco of content) {
      if (bloco.type === 'text') textos.push(bloco.text);
      if (bloco.type === 'tool_use') {
        const exps = (bloco.input as { explanations?: Array<{ reason: string }> }).explanations ?? [];
        for (const e of exps) textos.push(e.reason);
      }
    }
  }
  return textos;
}

let linhas: string[] = [];
let restaurar: () => void = () => undefined;

beforeEach(() => {
  linhas = [];
  restaurar = redirecionarSaidaDoLog((linha) => void linhas.push(linha));
});

afterEach(() => {
  restaurar();
  vi.restoreAllMocks();
});

function registros(): Array<Record<string, unknown>> {
  return linhas.map((l) => JSON.parse(l) as Record<string, unknown>);
}

function portaClaude(...passos: Array<Anthropic.Message | Error>): ClaudeMessagesPort {
  let i = 0;
  return {
    create: vi.fn(async () => {
      const passo = passos[Math.min(i++, passos.length - 1)];
      if (passo instanceof Error) throw passo;
      return passo;
    }),
  };
}

function guardrailGravado(...ids: string[]): GuardrailDeSaidaPort {
  const sdk = new BedrockRuntimeClient({
    region: 'us-east-1',
    endpoint: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    maxAttempts: 1,
    credentials: { accessKeyId: 'credencial-sintetica-de-teste', secretAccessKey: 'credencial-sintetica-de-teste' },
    requestHandler: transporteAwsGravado(...ids),
  });
  return new BedrockApplyGuardrailClient(contratoBedrock(CONTRATO), sdk);
}

function casoDeUso(explainer: IRecommendationExplainer) {
  return new GetRecommendationsUseCase({
    batchRepo: {
      getBatchCandidates: vi.fn().mockResolvedValue([
        { itemId: 'SKU-1', score: 0.8, rank: 1, title: TITULOS[0], priceCents: 1000, category: CATEGORIAS[0] },
        { itemId: 'SKU-2', score: 0.6, rank: 2, title: TITULOS[1], priceCents: 500, category: CATEGORIAS[1] },
      ]),
    },
    // SKU-1 também vem da busca vetorial, para os sinais da gravação `sucesso` terem lastro.
    vectorRepo: {
      searchBySession: vi.fn().mockResolvedValue([{ itemId: 'SKU-1', vectorScore: 0.9, title: TITULOS[0], priceCents: 1000 }]),
    },
    scoringClient: {
      scoreCandidates: vi.fn().mockResolvedValue([
        { itemId: 'SKU-1', score: 0.95 },
        { itemId: 'SKU-2', score: 0.7 },
      ]),
    },
    explainer,
  });
}

function explicador(porta: ClaudeMessagesPort, guardrail: GuardrailDeSaidaPort) {
  return new RecommendationExplainer(porta, { modelId: 'rotulo-do-modelo', timeoutMs: 1000, guardrailDeSaida: guardrail });
}

/** Requisição HTTP completa: os ganchos do servidor também gravam no log. */
async function requisitar(explainer: IRecommendationExplainer) {
  const app = buildServer({ recommendationUseCase: casoDeUso(explainer) });
  const res = await app.inject({
    method: 'GET',
    url: `/v1/recommendations?userId=${USER_ID}&limit=2&explain=true&sessionItemIds=SKU-9`,
    headers: { 'x-request-id': 'req-vt18-sintetico' },
  });
  await app.close();
  return res;
}

/** As regras do VT-18 sobre o log capturado. */
function conferirLog(proibidos: string[]) {
  const regs = registros();
  expect(regs.length).toBeGreaterThan(0);
  const permitidos = new Set<string>([...CAMPOS_PERMITIDOS_NO_LOG, ...CAMPOS_DO_PINO]);
  for (const r of regs) {
    for (const campo of Object.keys(r)) expect(permitidos.has(campo), `campo fora da lista: ${campo}`).toBe(true);
  }
  const log = linhas.join('\n');
  for (const p of [USER_ID, ...TITULOS, ...CATEGORIAS, ...TRECHOS_DO_PROMPT, ...proibidos]) {
    expect(log, `o log contém "${p}"`).not.toContain(p);
  }
  // O log continua útil: a etapa da explicação sai com a duração, o status e o requestId.
  const etapa = regs.find((r) => r.stage === 'claude-explanation');
  expect(etapa).toMatchObject({ requestId: 'req-vt18-sintetico', status: expect.any(String), durationMs: expect.any(Number) });
  return regs;
}

describe('VT-18 · lista permitida de campos do log', () => {
  it('a lista fica numa constante; um campo novo exige mudar a lista e este teste', () => {
    expect([...CAMPOS_PERMITIDOS_NO_LOG]).toEqual(LISTA_ESPERADA);
    expect(Object.isFrozen(CAMPOS_PERMITIDOS_NO_LOG)).toBe(true);
    // userId é identificador do cliente: fora da lista (Art. VIII).
    expect(CAMPOS_PERMITIDOS_NO_LOG).not.toContain('userId');
  });

  it('campo fora da lista sai da linha, inclusive nos vínculos do logger filho', () => {
    baseLogger.child({ requestId: 'req-1', userId: USER_ID }).info({ stage: 'x', prompt: 'Você escreve', title: TITULOS[0] }, 'ok');
    const [r] = registros();
    expect(r).toMatchObject({ requestId: 'req-1', stage: 'x', msg: 'ok' });
    expect(r).not.toHaveProperty('userId');
    expect(r).not.toHaveProperty('prompt');
    expect(r).not.toHaveProperty('title');
    // pid e hostname do pino também ficam fora (o hostname da tarefa traz o IP interno).
    expect(r).not.toHaveProperty('pid');
    expect(r).not.toHaveProperty('hostname');
  });

  it('valor de campo permitido com texto livre ou ARN é omitido', () => {
    baseLogger.warn({ categoria: 'texto livre com espaços', erro: CONTRATO.BEDROCK_PERFIL_ARN, status: 'ok' }, 'x');
    const [r] = registros();
    expect(r.status).toBe('ok');
    expect(r.categoria).toBe('[omitido]');
    expect(r.erro).toBe('[omitido]');
  });

  it('erro passado direto ao logger não leva a mensagem nem a pilha', () => {
    const erro = new Error(`User: ${CONTRATO.BEDROCK_PERFIL_ARN} is not authorized`);
    baseLogger.error(erro);
    baseLogger.error({ err: erro });
    baseLogger.error(erro, 'falha %s', 'argumento sintetico com texto');
    const log = linhas.join('\n');
    expect(linhas).toHaveLength(3);
    expect(log).not.toContain('not authorized');
    expect(log).not.toContain('arn:');
    expect(log).not.toContain('argumento sintetico');
    expect(registros()[0]).toMatchObject({ erro: 'Error' });
  });

  it('A2: argumento de interpolação (%s) não entra na mensagem', () => {
    // Um valor só com letras passaria na redação da mensagem: prova o corte dos argumentos em si.
    const soLetras = 'clienteSinteticoSemNumero';
    baseLogger.info('x %s', USER_ID);
    baseLogger.info('x %s', soLetras);
    baseLogger.info({ stage: 'y' }, 'y %s', soLetras);
    expect(linhas).toHaveLength(3);
    expect(linhas.join('\n')).not.toContain(USER_ID);
    expect(linhas.join('\n')).not.toContain(soLetras);
  });

  it('A1: mensagem com dado interpolado (número, aspas, ARN) vira [omitido]; a operacional passa', () => {
    baseLogger.info({}, `Stage completed in ${12.5}ms`);
    baseLogger.warn({}, `falha: ${CONTRATO.BEDROCK_PERFIL_ARN}`);
    baseLogger.warn({}, `frase do modelo: "${TITULOS[0]}"`);
    baseLogger.warn({}, 'Explicação indisponível; resposta segue sem explicação');
    const msgs = registros().map((r) => r.msg);
    expect(msgs).toEqual(['[omitido]', '[omitido]', '[omitido]', 'Explicação indisponível; resposta segue sem explicação']);
  });

  it('A1: um 500 pelo tratador de erro do servidor não leva a mensagem do erro ao log', async () => {
    const app = buildServer({ recommendationUseCase: casoDeUso(explicador(portaClaude(mensagemGravada('sucesso')), guardrailDeSaidaQueAprova())) });
    // Rota só do teste, para o erro chegar ao tratador global (o controlador trata os do caso de uso).
    app.get('/falha-letras', async () => {
      throw new Error('segredo sintetico do provedor so com letras');
    });
    app.get('/falha-arn', async () => {
      throw new Error(`User: ${CONTRATO.BEDROCK_PERFIL_ARN} is not authorized`);
    });
    const a = await app.inject({ method: 'GET', url: '/falha-letras', headers: { 'x-request-id': 'req-vt18-500' } });
    const b = await app.inject({ method: 'GET', url: '/falha-arn', headers: { 'x-request-id': 'req-vt18-500' } });
    await app.close();
    expect(a.statusCode).toBe(500);
    expect(b.statusCode).toBe(500);
    const log = linhas.join('\n');
    for (const p of ['segredo sintetico', ...PROIBIDOS_DO_PROVEDOR]) expect(log, `o log contém "${p}"`).not.toContain(p);
    expect(registros().filter((r) => r.msg === 'Request error')).toHaveLength(2);
  });
});

describe('VT-18 · requisição com explain=true pelo logger real', () => {
  it('sucesso: sem prompt, texto do modelo, título nem userId', async () => {
    const res = await requisitar(explicador(portaClaude(mensagemGravada('sucesso')), guardrailGravado('apply-guardrail-sem-intervencao')));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).explanation).toMatchObject({ status: 'ok' });
    conferirLog(textosDoModelo('sucesso'));
  });

  it('retentativa por validação: a resposta inválida e o feedback não vão ao log', async () => {
    const porta = portaClaude(mensagemGravada('retentativa-item-faltando'), mensagemGravada('sucesso'));
    const res = await requisitar(explicador(porta, guardrailDeSaidaQueAprova()));
    expect(JSON.parse(res.body).explanation).toMatchObject({ status: 'ok', attempts: 2 });
    conferirLog([...textosDoModelo('retentativa-item-faltando', 'sucesso'), 'SKU-2', 'não passou na validação']);
  });

  it('intervenção no InvokeModel: o texto de bloqueio não vai ao log', async () => {
    const res = await requisitar(explicador(portaClaude(mensagemGravada('guardrail-invoke-intervencao')), guardrailDeSaidaQueAprova()));
    expect(JSON.parse(res.body).explanation).toMatchObject({ status: 'unavailable', reason: 'guardrail' });
    const regs = conferirLog([TEXTO_DO_GUARDRAIL]);
    expect(regs.some((r) => r.categoria === 'guardrail')).toBe(true);
  });

  it('intervenção no ApplyGuardrail: nem as frases revisadas nem o texto do guardrail vão ao log', async () => {
    const porta = portaClaude(mensagemGravada('sucesso'));
    const res = await requisitar(explicador(porta, guardrailGravado('apply-guardrail-intervencao')));
    expect(JSON.parse(res.body).explanation).toMatchObject({ status: 'unavailable', reason: 'guardrail' });
    conferirLog([...textosDoModelo('sucesso'), TEXTO_DO_GUARDRAIL]);
  });

  it('validação reprovada nas duas tentativas: itemId inventado, contagens e frases ficam fora do log', async () => {
    const porta = portaClaude(mensagemGravada('preco-e-item-fora-da-lista'), mensagemGravada('preco-e-item-fora-da-lista'));
    const res = await requisitar(explicador(porta, guardrailDeSaidaQueAprova()));
    expect(JSON.parse(res.body).explanation).toMatchObject({ status: 'unavailable', reason: 'validation' });
    const regs = conferirLog([...textosDoModelo('preco-e-item-fora-da-lista'), 'SKU-404', 'caracteres', 'desconto']);
    expect(regs.find((r) => r.categoria === 'validation')).toMatchObject({ retentavel: true, tentativas: 2 });
  });

  it('explicador que lança exceção: a mensagem dela não vai ao log', async () => {
    const explainer: IRecommendationExplainer = {
      explain: vi.fn().mockRejectedValue(new Error(`texto sintetico do modelo ${CONTRATO.BEDROCK_PERFIL_ARN}`)),
    };
    const res = await requisitar(explainer);
    expect(res.statusCode).toBe(200);
    const regs = conferirLog(['texto sintetico do modelo', ...PROIBIDOS_DO_PROVEDOR]);
    expect(regs.some((r) => r.categoria === 'internal_error')).toBe(true);
  });

  it('erro inesperado na porta do Claude (internal_error): a mensagem não vai ao log', async () => {
    const porta = portaClaude(new TypeError('texto sintetico inesperado com o prompt Você escreve'));
    const res = await requisitar(explicador(porta, guardrailDeSaidaQueAprova()));
    expect(JSON.parse(res.body).explanation).toMatchObject({ status: 'unavailable', reason: 'internal_error' });
    conferirLog(['texto sintetico inesperado']);
  });

  it('403 do Bedrock: sem ARN, conta nem mensagem do provedor no log', async () => {
    const res = await requisitar(explicador(portaClaude(erroGravado('erro-403-sem-guardrail')), guardrailDeSaidaQueAprova()));
    expect(JSON.parse(res.body).explanation).toMatchObject({ status: 'unavailable', reason: 'model_error' });
    conferirLog(PROIBIDOS_DO_PROVEDOR);
  });
});
