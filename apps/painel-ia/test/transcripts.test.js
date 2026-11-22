import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LeitorTranscripts } from '../src/transcripts.js';

test('lê só o que foi acrescentado e respeita linha incompleta', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'painel-'));
  await mkdir(join(dir, 'proj', 'sub'), { recursive: true });
  const arq = join(dir, 'proj', 'sub', 's.jsonl');
  await writeFile(arq, '{"a":1}\n{"a":2');
  const vistos = [];
  const leitor = new LeitorTranscripts(dir, (ev) => vistos.push(ev));
  await leitor.varrer();
  assert.deepEqual(vistos, [{ a: 1 }]);
  await appendFile(arq, '}\nnão é json\n{"a":3}\n');
  await leitor.varrer();
  assert.deepEqual(vistos, [{ a: 1 }, { a: 2 }, { a: 3 }]);
  assert.equal(leitor.erros, 1);
});

test('arquivo truncado é relido do início', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'painel-'));
  const arq = join(dir, 's.jsonl');
  await writeFile(arq, '{"a":1}\n{"a":2}\n');
  const vistos = [];
  const leitor = new LeitorTranscripts(dir, (ev) => vistos.push(ev.a));
  await leitor.varrer();
  await writeFile(arq, '{"a":9}\n');
  await leitor.varrer();
  assert.deepEqual(vistos, [1, 2, 9]);
});

test('diretório inexistente não derruba o leitor', async () => {
  const leitor = new LeitorTranscripts('/nao/existe', () => {});
  await leitor.varrer();
  assert.equal(leitor.arquivos, 0);
});
