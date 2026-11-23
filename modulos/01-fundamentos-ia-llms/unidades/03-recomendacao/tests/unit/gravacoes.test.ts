// VT-13 (proveniência das respostas gravadas, T080): RF-111, RF-110, E10, Art. III.
//
// Toda resposta gravada que os testes do explicador usam fica em `tests/fixtures/claude/` e diz de
// onde veio: `sintetica` (escrita à mão), `documentacao` (formato tirado de uma página da AWS, com o
// link) ou `captura` (resposta real do modelo, capturada na demonstração, sem dado pessoal). Uma
// gravação sem `proveniencia`, ou com outro valor, reprova (furo F8). Isso evita tratar resposta
// escrita à mão como prova do comportamento do modelo (5.6): o comportamento real não é validado em
// CI (D-006), e o ADR-0004 diz isso.
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  DIRETORIO_GRAVACOES,
  PROVENIENCIAS,
  carregarGravacao,
  validarGravacao,
} from '../fixtures/claude/gravacoes';

const arquivos = readdirSync(DIRETORIO_GRAVACOES).filter((f) => f.endsWith('.json')).sort();
const brutas = arquivos.map((f) => ({
  arquivo: f,
  dado: JSON.parse(readFileSync(path.join(DIRETORIO_GRAVACOES, f), 'utf-8')) as Record<string, unknown>,
}));

/** Gravação sintética mínima válida, base dos casos negativos. */
function base(): Record<string, unknown> {
  return {
    id: 'exemplo',
    proveniencia: 'sintetica',
    sintetica: true,
    descricao: 'exemplo',
    caminho: 'sucesso',
    tipo: 'messages',
    origem: {
      data: '2026-11-23',
      autor: 'escrita à mão',
      modelo: 'anthropic.claude-haiku-5-5',
      parametros: { max_tokens: 1024 },
    },
    resposta: {},
  };
}

describe('VT-13 · toda gravação tem proveniência válida (RF-111)', () => {
  it('há gravações no diretório', () => {
    expect(arquivos.length).toBeGreaterThan(0);
  });

  it.each(brutas)('$arquivo passa na validação de proveniência', ({ arquivo, dado }) => {
    expect(validarGravacao(dado)).toEqual([]);
    expect(dado.id).toBe(arquivo.replace(/\.json$/, ''));
  });

  it('os valores aceitos são só sintetica, documentacao e captura (furo F8)', () => {
    expect([...PROVENIENCIAS].sort()).toEqual(['captura', 'documentacao', 'sintetica']);
  });
});

describe('VT-13 · o validador reprova gravação sem proveniência ou fora da lista', () => {
  it('reprova sem o campo proveniencia', () => {
    const g = base();
    delete g.proveniencia;
    expect(validarGravacao(g).join(' ')).toMatch(/proveniencia/);
  });

  it.each(['real', 'gravada', '', 'Sintetica'])('reprova proveniencia = %j', (valor) => {
    expect(validarGravacao({ ...base(), proveniencia: valor }).join(' ')).toMatch(/proveniencia/);
  });

  it('reprova sintetica incoerente com a proveniência', () => {
    expect(validarGravacao({ ...base(), sintetica: false }).join(' ')).toMatch(/sintetica/);
    expect(validarGravacao({ ...base(), sintetica: undefined }).join(' ')).toMatch(/sintetica/);
  });

  it('reprova origem sem data, modelo ou parâmetros', () => {
    for (const campo of ['data', 'modelo', 'parametros']) {
      const g = base();
      const origem = { ...(g.origem as Record<string, unknown>) };
      delete origem[campo];
      expect(validarGravacao({ ...g, origem }).join(' ')).toMatch(new RegExp(campo));
    }
    expect(validarGravacao({ ...base(), origem: { ...(base().origem as object), data: '23/11/2026' } }).join(' ')).toMatch(/data/);
  });

  it('documentacao exige o link da AWS, a data da consulta e o que é sintético', () => {
    const doc = { ...base(), proveniencia: 'documentacao', sintetica: true };
    const erros = validarGravacao(doc).join(' ');
    expect(erros).toMatch(/fonte/);
    expect(erros).toMatch(/consultado_em/);
    expect(erros).toMatch(/da_fonte/);
    const origem = {
      ...(base().origem as object),
      fonte: 'https://exemplo.com/guardrail',
      consultado_em: '2026-11-20',
      da_fonte: 'x',
      sintetico: 'y',
    };
    expect(validarGravacao({ ...doc, origem }).join(' ')).toMatch(/fonte/);
  });

  it('captura exige sintetica false, região, id da requisição e declaração sem dado pessoal', () => {
    const cap = { ...base(), proveniencia: 'captura', sintetica: false };
    const erros = validarGravacao(cap).join(' ');
    expect(erros).toMatch(/regiao/);
    expect(erros).toMatch(/request_id/);
    expect(erros).toMatch(/sem_dado_pessoal/);
    expect(validarGravacao({ ...cap, sintetica: true }).join(' ')).toMatch(/sintetica/);
  });

  it('carregarGravacao lança erro para gravação inexistente', () => {
    expect(() => carregarGravacao('nao-existe')).toThrow();
  });
});

describe('VT-13 · gravações do explicador e do guardrail (RF-110, T080)', () => {
  const porId = new Map(brutas.map((b) => [b.dado.id as string, b.dado]));

  it.each([
    'sucesso',
    'retentativa-item-faltando',
    'sinal-sem-lastro',
    'preco-e-item-fora-da-lista',
    'lista-vazia-de-explicacoes',
    'sem-tool-use',
    'recusa',
    'erro-429',
    'erro-400',
    'erro-500',
    'explicador-ok',
    'explicador-indisponivel-validacao',
  ])('a gravação usada hoje pelos testes do explicador existe: %s', (id) => {
    expect(porId.has(id)).toBe(true);
  });

  it('intervenção do guardrail no InvokeModel traz amazon-bedrock-guardrailAction INTERVENED e cita a documentação', () => {
    const g = carregarGravacao('guardrail-invoke-intervencao');
    expect(g.proveniencia).toBe('documentacao');
    expect(g.origem.fonte).toBe('https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-test.html');
    expect((g.resposta as Record<string, unknown>)['amazon-bedrock-guardrailAction']).toBe('INTERVENED');
  });

  it('ApplyGuardrail: intervenção, erro retentável (429) e não retentável (400)', () => {
    const intervencao = carregarGravacao('apply-guardrail-intervencao');
    expect(intervencao.tipo).toBe('apply-guardrail');
    expect((intervencao.resposta as Record<string, unknown>).action).toBe('GUARDRAIL_INTERVENED');
    expect((intervencao.origem.parametros as Record<string, unknown>).source).toBe('OUTPUT');
    // O ApplyGuardrail não chama modelo.
    for (const id of ['apply-guardrail-intervencao', 'apply-guardrail-erro-429', 'apply-guardrail-erro-400']) {
      expect(carregarGravacao(id).origem.modelo).toBe('n/a (ApplyGuardrail)');
    }

    expect(carregarGravacao('apply-guardrail-erro-429').resposta).toMatchObject({ status: 429 });
    expect(carregarGravacao('apply-guardrail-erro-400').resposta).toMatchObject({ status: 400 });
  });

  it('403 por falta do guardrail é um erro HTTP AccessDeniedException', () => {
    const g = carregarGravacao('erro-403-sem-guardrail');
    expect(g.tipo).toBe('erro-http');
    expect(g.resposta).toMatchObject({ status: 403, tipo_de_erro: 'AccessDeniedException' });
  });

  it('nenhuma gravação traz e-mail ou documento de pessoa (Art. VIII)', () => {
    for (const { arquivo, dado } of brutas) {
      const texto = JSON.stringify(dado);
      expect(texto, arquivo).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      expect(texto, arquivo).not.toMatch(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/);
      expect(texto, arquivo).not.toMatch(/\b\d{11}\b/);
    }
  });
});

describe('VT-13 · os testes do explicador leem as gravações do diretório (T080)', () => {
  const testes = [
    path.resolve(__dirname, 'recommendation-explainer.test.ts'),
    path.resolve(__dirname, '../integration/explanation-in-recommendations.test.ts'),
  ];

  it.each(testes)('%s importa as gravações e não monta resposta à mão', (arquivo) => {
    const fonte = readFileSync(arquivo, 'utf-8');
    expect(fonte).toMatch(/fixtures\/claude\/gravacoes/);
    // Construtores de resposta inline (o formato antigo) não voltam.
    expect(fonte).not.toMatch(/type: 'message'/);
    expect(fonte).not.toMatch(/mockResolvedValue\(\{\s*status:/);
    // Erro HTTP montado à mão também não volta: vem de erroGravado.
    expect(fonte).not.toMatch(/new Anthropic\.(RateLimitError|BadRequestError|InternalServerError|APIError)\(/);
  });
});

describe('VT-13 · o ADR-0004 diz que o comportamento real não é validado em CI (D-006)', () => {
  const adr = readFileSync(path.resolve(__dirname, '../../adr/0004-explicacao-com-claude-no-bedrock.md'), 'utf-8');

  it('cita D-006, a proveniência e o diretório das gravações', () => {
    expect(adr).toMatch(/não é validado em CI/);
    expect(adr).toMatch(/D-006/);
    expect(adr).toMatch(/proveniencia/);
    expect(adr).toMatch(/tests\/fixtures\/claude\//);
  });
});
