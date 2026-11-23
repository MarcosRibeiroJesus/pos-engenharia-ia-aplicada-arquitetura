import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  encodeCandidatesCsv,
  RERANKER_FEATURES,
  ISageMakerScoringClient,
  SageMakerScoringRequest,
} from '../../src/serving/src/infrastructure/sagemaker/sagemaker-scoring.client';
import { SageMakerReranker } from '../../src/serving/src/application/reranker';
import { MergedCandidate } from '../../src/serving/src/domain/candidate';

// Paridade das features do re-ranker (T075, ADR-0008, nota de 2026-11-23): a fixture versionada é o
// contrato único entre o serviço e o CSV de treino. O treino (T042/T043) deve ler a mesma fixture e
// gerar as mesmas linhas. Aqui o candidato passa pelo re-ranker de verdade (que mapeia `fallback`
// para `batch`) e a linha que sairia para o endpoint é comparada byte a byte.

interface Caso {
  nome: string;
  candidato: { provenance: MergedCandidate['provenance']; batchScore?: number; vectorScore?: number };
  linha: string;
}

const fixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../fixtures/reranker-features.json'), 'utf-8')
) as { colunas: string[]; casas_decimais: number; cabecalho: boolean; casos: Caso[] };

describe('Paridade das features do re-ranker com a fixture compartilhada', () => {
  it('colunas, casas e cabeçalho da fixture são os do cliente', () => {
    expect(fixture.colunas).toEqual([...RERANKER_FEATURES]);
    expect(fixture.casas_decimais).toBe(6);
    expect(fixture.cabecalho).toBe(false);
  });

  it.each(fixture.casos.map((c) => [c.nome, c] as const))('%s', async (_nome, caso) => {
    const captured: SageMakerScoringRequest[] = [];
    const client: ISageMakerScoringClient = {
      scoreCandidates: vi.fn(async (req: SageMakerScoringRequest) => {
        captured.push(req);
        return [{ itemId: 'ITEM-1', score: 0.5 }];
      }),
    };
    const candidate: MergedCandidate = { itemId: 'ITEM-1', initialCombinedScore: 0.5, ...caso.candidato };

    await new SageMakerReranker(client).rerank({ userId: 'u-1', candidates: [candidate], limit: 1 });

    expect(encodeCandidatesCsv(captured[0].candidates)).toBe(caso.linha);
  });
});
