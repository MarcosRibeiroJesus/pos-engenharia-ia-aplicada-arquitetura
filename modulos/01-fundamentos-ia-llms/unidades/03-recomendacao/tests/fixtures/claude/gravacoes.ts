// Respostas gravadas do explicador (RF-111, RF-110, VT-13).
//
// Cada arquivo JSON deste diretório é uma resposta que os testes entregam no lugar do Claude ou do
// Bedrock. Nenhuma veio de chamada real ao modelo até a primeira demonstração (T107): por isso cada
// uma diz a própria proveniência, e o validador abaixo reprova a que não disser.
//
// - `sintetica`: escrita à mão, no formato da Messages API ou do Bedrock.
// - `documentacao`: o formato (ou o campo testado) vem de uma página da documentação da AWS, com o
//   link e a data da consulta; o resto do corpo é sintético e isso fica dito em `origem.sintetico`.
// - `captura`: resposta real, capturada na demonstração, sem dado pessoal.
//
// O comportamento real do modelo não é validado em CI (D-006): estas gravações provam o código do
// explicador diante de cada formato, não a qualidade do texto que o modelo escreve.
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import type { GuardrailDeSaidaPort } from '../../../src/serving/src/application/recommendation-explainer';

export const DIRETORIO_GRAVACOES = __dirname;

export const PROVENIENCIAS = ['sintetica', 'documentacao', 'captura'] as const;
export type Proveniencia = (typeof PROVENIENCIAS)[number];

// `erro-http`: erro da Messages API como o SDK da Anthropic o lança. `erro-aws`: erro de uma API da AWS
// (o ApplyGuardrail) como o SDK da AWS o recebe: cabeçalho `x-amzn-errortype` e corpo com `message`.
export const TIPOS = ['messages', 'erro-http', 'erro-aws', 'apply-guardrail', 'resultado-explicador'] as const;
export type TipoGravacao = (typeof TIPOS)[number];

export interface OrigemGravacao {
  /** Data em que a gravação foi escrita ou capturada (AAAA-MM-DD). */
  data: string;
  /** Modelo que a gravação imita (sintética e documentação) ou que respondeu (captura). */
  modelo: string;
  /** Parâmetros da requisição que a gravação responde. */
  parametros: Record<string, unknown>;
  autor?: string;
  fonte?: string;
  consultado_em?: string;
  da_fonte?: string;
  sintetico?: string;
  regiao?: string;
  request_id?: string;
  sem_dado_pessoal?: boolean;
  [campo: string]: unknown;
}

export interface Gravacao {
  id: string;
  proveniencia: Proveniencia;
  sintetica: boolean;
  descricao: string;
  caminho: string;
  tipo: TipoGravacao;
  origem: OrigemGravacao;
  resposta: unknown;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const FONTE_AWS = /^https:\/\/docs\.aws\.amazon\.com\//;

function texto(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Lista os problemas de proveniência de uma gravação; lista vazia quer dizer válida. */
export function validarGravacao(g: Record<string, unknown>): string[] {
  const erros: string[] = [];
  const prov = g.proveniencia;
  if (!PROVENIENCIAS.includes(prov as Proveniencia)) {
    erros.push(`proveniencia ausente ou fora de ${PROVENIENCIAS.join(', ')}: ${JSON.stringify(prov)}`);
  }
  if (typeof g.sintetica !== 'boolean' || g.sintetica !== (prov !== 'captura')) {
    erros.push('sintetica deve ser true, a não ser na proveniencia captura (false)');
  }
  for (const campo of ['id', 'descricao', 'caminho']) {
    if (!texto(g[campo])) erros.push(`${campo} ausente`);
  }
  if (!TIPOS.includes(g.tipo as TipoGravacao)) erros.push(`tipo fora de ${TIPOS.join(', ')}`);
  if (!('resposta' in g)) erros.push('resposta ausente');

  const origem = (g.origem ?? {}) as Record<string, unknown>;
  if (typeof g.origem !== 'object' || g.origem === null) erros.push('origem ausente');
  if (!texto(origem.data) || !DATA.test(origem.data)) erros.push('origem.data ausente ou fora de AAAA-MM-DD');
  if (!texto(origem.modelo)) erros.push('origem.modelo ausente');
  if (typeof origem.parametros !== 'object' || origem.parametros === null) erros.push('origem.parametros ausente');

  if (prov === 'sintetica' && !texto(origem.autor)) erros.push('origem.autor ausente na sintetica');
  if (prov === 'documentacao') {
    if (!texto(origem.fonte) || !FONTE_AWS.test(origem.fonte)) {
      erros.push('origem.fonte deve ser um link de docs.aws.amazon.com');
    }
    if (!texto(origem.consultado_em) || !DATA.test(origem.consultado_em)) erros.push('origem.consultado_em ausente');
    if (!texto(origem.da_fonte)) erros.push('origem.da_fonte ausente (o que veio da documentação)');
    if (!texto(origem.sintetico)) erros.push('origem.sintetico ausente (o que foi escrito à mão)');
  }
  if (prov === 'captura') {
    if (!texto(origem.regiao)) erros.push('origem.regiao ausente na captura');
    if (!texto(origem.request_id)) erros.push('origem.request_id ausente na captura');
    if (origem.sem_dado_pessoal !== true) erros.push('origem.sem_dado_pessoal deve ser true na captura');
  }
  return erros;
}

/** Lê e valida uma gravação pelo id (nome do arquivo sem `.json`); lança se faltar ou for inválida. */
export function carregarGravacao(id: string): Gravacao {
  const arquivo = path.join(DIRETORIO_GRAVACOES, `${id}.json`);
  if (!existsSync(arquivo)) throw new Error(`gravação inexistente: ${id}`);
  const dado = JSON.parse(readFileSync(arquivo, 'utf-8')) as Record<string, unknown>;
  const erros = validarGravacao(dado);
  if (erros.length > 0) throw new Error(`gravação ${id} inválida: ${erros.join('; ')}`);
  return dado as unknown as Gravacao;
}

/** Resposta da Messages API gravada (tipo `messages`). */
export function mensagemGravada(id: string): Anthropic.Message {
  const g = carregarGravacao(id);
  if (g.tipo !== 'messages') throw new Error(`gravação ${id} não é do tipo messages`);
  return structuredClone(g.resposta) as Anthropic.Message;
}

interface ErroHttpGravado {
  status: number;
  tipo_de_erro?: string;
  corpo: Record<string, unknown>;
  mensagem: string;
  cabecalhos?: Record<string, string>;
}

/** Erro HTTP gravado (tipo `erro-http`), como o SDK o lançaria (subclasse pelo status). */
export function erroGravado(id: string): ReturnType<typeof Anthropic.APIError.generate> {
  const g = carregarGravacao(id);
  if (g.tipo !== 'erro-http') throw new Error(`gravação ${id} não é do tipo erro-http`);
  const r = g.resposta as ErroHttpGravado;
  return Anthropic.APIError.generate(r.status, r.corpo, r.mensagem, new Headers(r.cabecalhos ?? {}));
}

/** Resultado do explicador gravado (tipo `resultado-explicador`), usado pela integração da API. */
export function resultadoGravado<T>(id: string): T {
  const g = carregarGravacao(id);
  if (g.tipo !== 'resultado-explicador') throw new Error(`gravação ${id} não é do tipo resultado-explicador`);
  return structuredClone(g.resposta) as T;
}

// ---------------------------------------------------------------- ApplyGuardrail (SDK da AWS, T084)

/** Resposta HTTP crua que o SDK da AWS recebe do transporte e desserializa sozinho. */
export interface RespostaHttpGravada {
  statusCode: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

interface ErroAwsGravado {
  status: number;
  tipo_de_erro: string;
  cabecalhos: Record<string, string>;
  corpo: Record<string, unknown>;
}

/**
 * Resposta HTTP do ApplyGuardrail gravada (tipo `apply-guardrail`, status 200, ou `erro-aws`). O teste
 * entrega a resposta ao transporte do SDK da AWS, e é o desserializador do próprio SDK que monta o
 * resultado ou a exceção (ThrottlingException, ValidationException, AccessDeniedException): nenhuma
 * exceção da AWS é montada à mão.
 */
export function respostaHttpAwsGravada(id: string): RespostaHttpGravada {
  const g = carregarGravacao(id);
  const json = (corpo: unknown) => new TextEncoder().encode(JSON.stringify(corpo));
  if (g.tipo === 'apply-guardrail') {
    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: json(g.resposta) };
  }
  if (g.tipo === 'erro-aws') {
    const r = g.resposta as ErroAwsGravado;
    return { statusCode: r.status, headers: { 'content-type': 'application/json', ...r.cabecalhos }, body: json(r.corpo) };
  }
  throw new Error(`gravação ${id} não é do tipo apply-guardrail nem erro-aws`);
}

/** Pedido que o SDK da AWS entregou ao transporte, já assinado. */
export interface PedidoAwsRegistrado {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/**
 * Transporte falso do SDK da AWS (`requestHandler`): devolve as gravações na ordem (a última se repete)
 * e guarda os pedidos. Nenhuma rede. Respeita o `abortSignal` como o transporte real.
 */
export function transporteAwsGravado(...ids: string[]) {
  const pedidos: PedidoAwsRegistrado[] = [];
  let i = 0;
  return {
    pedidos,
    handle: async (request: any, opcoes?: { abortSignal?: AbortSignal }) => {
      if (opcoes?.abortSignal?.aborted) {
        const erro = new Error('Request aborted');
        erro.name = 'AbortError';
        throw erro;
      }
      const corpo = request.body === undefined ? '' : new TextDecoder().decode(request.body as Uint8Array);
      pedidos.push({
        method: request.method,
        path: request.path,
        headers: { ...request.headers },
        body: corpo ? (JSON.parse(corpo) as Record<string, unknown>) : {},
      });
      const id = ids[Math.min(i++, ids.length - 1)];
      return { response: respostaHttpAwsGravada(id) };
    },
  };
}

/**
 * Guardrail de saída que sempre aprova (`NONE`), para os testes cujo assunto não é a revisão da saída
 * (T084). Não é gravação: os casos do ApplyGuardrail usam as gravações acima pelo VT-12.
 */
export function guardrailDeSaidaQueAprova(): GuardrailDeSaidaPort {
  return { revisarSaida: async () => 'NONE' };
}
