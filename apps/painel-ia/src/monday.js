// Itens do board de aprovações no Monday (opcional). O token fica só no servidor.

const CONSULTA = `query ($quadro: [ID!]) {
  boards(ids: $quadro) { items_page(limit: 100) { items { id name url column_values { text column { title } } } } }
}`;

export async function itensMonday({ token, quadro, fetch = globalThis.fetch }) {
  const resp = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token, 'API-Version': '2025-04' },
    body: JSON.stringify({ query: CONSULTA, variables: { quadro: [String(quadro)] } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`Monday respondeu ${resp.status}`);
  const corpo = await resp.json();
  if (corpo.errors?.length) throw new Error(`Monday: ${corpo.errors[0].message}`);
  const itens = corpo.data?.boards?.[0]?.items_page?.items || [];
  return itens.map((it) => {
    const col = (titulo) => it.column_values.find((c) => c.column?.title === titulo)?.text || '';
    return { id: it.id, nome: it.name, url: it.url, status: col('Status'), tipo: col('Tipo'), prioridade: col('Prioridade') };
  });
}
