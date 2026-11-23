import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  EmfMetricsPublisher,
  ICloudWatchMetricsPublisher,
} from '../../src/serving/src/infrastructure/monitoring/cloudwatch-metrics';

// VT-15 (T015, ADR-0013): as contagens do serviço saem como linhas Embedded Metric Format no stdout,
// que o driver awslogs já envia ao CloudWatch Logs pelo endpoint `logs`. Sem PutMetricData e sem o
// endpoint de interface `monitoring`. Os nomes e o namespace são os mesmos dos 7 alarmes.

const NAMESPACE = 'Ecommerce/Recommendations';
const FIXED_NOW = 1_763_856_000_000; // instante sintético fixo

interface EmfLine {
  _aws: {
    Timestamp: number;
    CloudWatchMetrics: Array<{
      Namespace: string;
      Dimensions: string[][];
      Metrics: Array<{ Name: string; Unit: string }>;
    }>;
  };
  [key: string]: unknown;
}

function captureLines(): { lines: string[]; publisher: EmfMetricsPublisher } {
  const lines: string[] = [];
  const publisher = new EmfMetricsPublisher({
    namespace: NAMESPACE,
    write: (line: string) => {
      lines.push(line);
    },
    now: () => FIXED_NOW,
  });
  return { lines, publisher };
}

function parseSingle(lines: string[]): EmfLine {
  expect(lines).toHaveLength(1);
  expect(lines[0].endsWith('\n')).toBe(true);
  // uma linha JSON por contagem: nenhuma quebra de linha no meio
  expect(lines[0].slice(0, -1)).not.toContain('\n');
  return JSON.parse(lines[0]) as EmfLine;
}

function assertEmfCount(doc: EmfLine, metricName: string): void {
  expect(doc._aws.Timestamp).toBe(FIXED_NOW);
  expect(doc._aws.CloudWatchMetrics).toHaveLength(1);
  const directive = doc._aws.CloudWatchMetrics[0];
  expect(directive.Namespace).toBe(NAMESPACE);
  // sem dimensões, como os alarmes (`dimensions = {}`) esperam
  expect(directive.Dimensions).toEqual([[]]);
  expect(directive.Metrics).toEqual([{ Name: metricName, Unit: 'Count' }]);
  expect(doc[metricName]).toBe(1);
}

const COUNTS: Array<[string, (p: ICloudWatchMetricsPublisher) => Promise<void>]> = [
  ['DegradedModeCount', (p) => p.publishDegradedMode()],
  ['SageMakerFallbackCount', (p) => p.publishSageMakerFallback()],
  ['MemoryDbFallbackCount', (p) => p.publishMemoryDbFallback()],
  ['DynamoDbFallbackCount', (p) => p.publishDynamoDbFallback()],
  ['ExplanationRetryCount', (p) => p.publishExplanationRetry!()],
];

describe('EmfMetricsPublisher (VT-15)', () => {
  it.each(COUNTS)('%s sai como uma linha EMF com unidade Count no namespace do serviço', async (name, publish) => {
    const { lines, publisher } = captureLines();
    await publish(publisher);
    assertEmfCount(parseSingle(lines), name);
  });

  it('ExplanationFallbackCount sai como linha EMF, seguida da contagem por categoria', async () => {
    const { lines, publisher } = captureLines();
    await publisher.publishExplanationFallback('timeout');
    expect(lines).toHaveLength(2);
    assertEmfCount(parseSingle([lines[0]]), 'ExplanationFallbackCount');
    assertEmfCount(parseSingle([lines[1]]), 'ExplanationFallback_timeout');
  });

  it('a linha EMF não leva userId, prompt nem texto do modelo', async () => {
    const { lines, publisher } = captureLines();
    for (const [, publish] of COUNTS) await publish(publisher);
    await publisher.publishExplanationFallback('validation');

    for (const line of lines) {
      const doc = JSON.parse(line) as EmfLine;
      const metricNames = doc._aws.CloudWatchMetrics[0].Metrics.map((m) => m.Name);
      // só o bloco _aws e os valores das métricas declaradas: nenhum campo livre
      expect(Object.keys(doc).sort()).toEqual(['_aws', ...metricNames].sort());
      for (const forbidden of ['userId', 'user_id', 'prompt', 'messages', 'text', 'explanation', 'requestId']) {
        expect(line).not.toContain(forbidden);
      }
    }
  });

  it('falha ao escrever não derruba a requisição', async () => {
    const publisher = new EmfMetricsPublisher({
      namespace: NAMESPACE,
      write: () => {
        throw new Error('stdout fechado');
      },
      now: () => FIXED_NOW,
    });
    await expect(publisher.publishDegradedMode()).resolves.toBeUndefined();
  });

  it('o namespace padrão vem do env (METRICS_NAMESPACE = Ecommerce/Recommendations)', async () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      // namespace e destino padrão (env e stdout); só o relógio é fixado
      await new EmfMetricsPublisher({ now: () => FIXED_NOW }).publishDegradedMode();
      const emfCalls = spy.mock.calls.map((c) => String(c[0])).filter((s) => s.includes('"_aws"'));
      expect(emfCalls).toHaveLength(1);
      assertEmfCount(JSON.parse(emfCalls[0]) as EmfLine, 'DegradedModeCount');
    } finally {
      spy.mockRestore();
    }
  });

  it('sem chamada ao PutMetricData nem ao client do CloudWatch no serviço', () => {
    const servingSrc = path.resolve(__dirname, '../../src/serving');
    const source = readFileSync(path.join(servingSrc, 'src/infrastructure/monitoring/cloudwatch-metrics.ts'), 'utf8');
    expect(source).not.toMatch(/PutMetricData/);
    expect(source).not.toMatch(/@aws-sdk\/client-cloudwatch/);
    const pkg = JSON.parse(readFileSync(path.join(servingSrc, 'package.json'), 'utf8'));
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain('@aws-sdk/client-cloudwatch');
  });
});
