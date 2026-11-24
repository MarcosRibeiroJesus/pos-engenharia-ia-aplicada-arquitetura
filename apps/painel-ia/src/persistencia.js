// Persistência em SQLite (node:sqlite, sem dependências). Guarda fatos, não agregados:
// mensagens com uso acumulado, sessões, tarefas, histórico de status e fatos detalhados
// por requisição/atribuição/subagente (sempre sem texto de mensagens nem caminhos).
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ESQUEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS sessoes (
  id TEXT PRIMARY KEY, projeto TEXT NOT NULL, branch TEXT, primeiro INTEGER, ultimo INTEGER, tarefa_ativa TEXT
);
CREATE TABLE IF NOT EXISTS tarefas (
  chave TEXT PRIMARY KEY, sessao TEXT NOT NULL, projeto TEXT NOT NULL, titulo TEXT NOT NULL,
  status TEXT NOT NULL, criado INTEGER, atualizado INTEGER
);
CREATE TABLE IF NOT EXISTS mensagens (
  id TEXT PRIMARY KEY, sessao TEXT NOT NULL, modelo TEXT NOT NULL, quando INTEGER NOT NULL, tarefa TEXT,
  input INTEGER NOT NULL, cache_write INTEGER NOT NULL, cache_read INTEGER NOT NULL, output INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS historico_status (
  tarefa TEXT NOT NULL, status TEXT NOT NULL, quando INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS requisicoes_detalhe (
  id TEXT NOT NULL, sessao TEXT NOT NULL, fio TEXT NOT NULL, is_subagente INTEGER NOT NULL,
  modelo TEXT NOT NULL, quando INTEGER NOT NULL,
  input INTEGER NOT NULL, cache_write INTEGER NOT NULL, cache_write_5m INTEGER NOT NULL, cache_write_1h INTEGER NOT NULL,
  cache_read INTEGER NOT NULL, output INTEGER NOT NULL, output_bytes INTEGER NOT NULL,
  tools TEXT NOT NULL, entradas TEXT NOT NULL,
  compactacao_marcada INTEGER NOT NULL, hook_injetado INTEGER NOT NULL, subagente_disparado INTEGER NOT NULL,
  quando_anterior INTEGER, tipo_anterior TEXT,
  PRIMARY KEY (sessao, fio, id)
);
CREATE TABLE IF NOT EXISTS chamadas_subagente (
  id TEXT PRIMARY KEY, sessao TEXT NOT NULL, subagent_type TEXT NOT NULL,
  model_solicitado TEXT NOT NULL, briefing_bytes INTEGER NOT NULL, quando INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS leituras_arquivo (
  sessao TEXT NOT NULL, arquivo_hash TEXT NOT NULL, total INTEGER NOT NULL, fios TEXT NOT NULL,
  PRIMARY KEY (sessao, arquivo_hash)
);
CREATE INDEX IF NOT EXISTS mensagens_sessao ON mensagens(sessao);
CREATE INDEX IF NOT EXISTS req_detalhe_sessao ON requisicoes_detalhe(sessao);
CREATE TABLE IF NOT EXISTS meta (chave TEXT PRIMARY KEY, valor TEXT);
`;
const VERSAO_ESQUEMA = '3';

// Migrações aditivas: só acrescentam colunas anuláveis, então linhas antigas ficam intactas (com null).
// v3: horário e tipo do evento anterior a cada requisição, para a latência da aba Modelos.
const COLUNAS_NOVAS = {
  requisicoes_detalhe: [['quando_anterior', 'INTEGER'], ['tipo_anterior', 'TEXT']],
};

function migrar(db) {
  db.exec('BEGIN');
  try {
    for (const [tabela, colunas] of Object.entries(COLUNAS_NOVAS)) {
      const existentes = new Set(db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name));
      for (const [nome, tipo] of colunas) if (!existentes.has(nome)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${nome} ${tipo}`);
    }
    db.prepare('INSERT OR REPLACE INTO meta VALUES (?, ?)').run('versao_esquema', VERSAO_ESQUEMA);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export class Persistencia {
  constructor(caminho) {
    if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true });
    try {
      this.db = new DatabaseSync(caminho);
    } catch (erro) {
      throw new Error(`não foi possível abrir o banco em ${caminho}: a pasta ${dirname(caminho)} precisa existir e ter `
        + `escrita para o usuário do processo (uid ${process.getuid?.() ?? '?'}). No Docker, use o volume nomeado do `
        + `compose.yml ou um tmpfs com uid=1000. Causa: ${erro.message}`, { cause: erro });
    }
    this.db.exec(ESQUEMA);
    migrar(this.db);
    this.sql = {
      sessao: this.db.prepare(`INSERT INTO sessoes (id, projeto, branch, primeiro, ultimo, tarefa_ativa) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET projeto = excluded.projeto, branch = excluded.branch,
        primeiro = MIN(COALESCE(sessoes.primeiro, excluded.primeiro), COALESCE(excluded.primeiro, sessoes.primeiro)),
        ultimo = MAX(COALESCE(sessoes.ultimo, 0), COALESCE(excluded.ultimo, 0)), tarefa_ativa = excluded.tarefa_ativa`),
      tarefa: this.db.prepare(`INSERT INTO tarefas (chave, sessao, projeto, titulo, status, criado, atualizado) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(chave) DO UPDATE SET titulo = excluded.titulo, status = excluded.status, projeto = excluded.projeto, atualizado = excluded.atualizado`),
      mensagem: this.db.prepare(`INSERT INTO mensagens (id, sessao, modelo, quando, tarefa, input, cache_write, cache_read, output)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET input = MAX(mensagens.input, excluded.input), cache_write = MAX(mensagens.cache_write, excluded.cache_write),
        cache_read = MAX(mensagens.cache_read, excluded.cache_read), output = MAX(mensagens.output, excluded.output)`),
      status: this.db.prepare('INSERT INTO historico_status (tarefa, status, quando) VALUES (?, ?, ?)'),
      reqDetalhe: this.db.prepare(`INSERT INTO requisicoes_detalhe
        (id, sessao, fio, is_subagente, modelo, quando, input, cache_write, cache_write_5m, cache_write_1h,
         cache_read, output, output_bytes, tools, entradas, compactacao_marcada, hook_injetado, subagente_disparado,
         quando_anterior, tipo_anterior)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(sessao, fio, id) DO UPDATE SET
          input = MAX(requisicoes_detalhe.input, excluded.input),
          cache_write = MAX(requisicoes_detalhe.cache_write, excluded.cache_write),
          cache_write_5m = MAX(requisicoes_detalhe.cache_write_5m, excluded.cache_write_5m),
          cache_write_1h = MAX(requisicoes_detalhe.cache_write_1h, excluded.cache_write_1h),
          cache_read = MAX(requisicoes_detalhe.cache_read, excluded.cache_read),
          output = MAX(requisicoes_detalhe.output, excluded.output),
          output_bytes = MAX(requisicoes_detalhe.output_bytes, excluded.output_bytes),
          tools = excluded.tools,
          subagente_disparado = MAX(requisicoes_detalhe.subagente_disparado, excluded.subagente_disparado),
          quando_anterior = COALESCE(requisicoes_detalhe.quando_anterior, excluded.quando_anterior),
          tipo_anterior = COALESCE(requisicoes_detalhe.tipo_anterior, excluded.tipo_anterior)`),
      chamadaSub: this.db.prepare(`INSERT OR IGNORE INTO chamadas_subagente
        (id, sessao, subagent_type, model_solicitado, briefing_bytes, quando) VALUES (?, ?, ?, ?, ?, ?)`),
      leituraArq: this.db.prepare(`INSERT INTO leituras_arquivo (sessao, arquivo_hash, total, fios) VALUES (?, ?, ?, ?)
        ON CONFLICT(sessao, arquivo_hash) DO UPDATE SET total = excluded.total, fios = excluded.fios`),
    };
  }

  /** Grava o que mudou desde o último salvamento, numa transação. Retorna quantas linhas gravou. */
  salvar(ag) {
    const { mensagens, tarefas, sessoes, status } = ag.sujos;
    const cs = ag.consumo?.sujos || { reqs: new Set(), chamadas: new Set(), leituras: new Set() };
    const total = mensagens.size + tarefas.size + sessoes.size + status.length
      + cs.reqs.size + cs.chamadas.size + cs.leituras.size;
    if (!total) return 0;
    this.db.exec('BEGIN');
    try {
      for (const id of sessoes) {
        const s = ag.sessoes.get(id);
        if (s) this.sql.sessao.run(id, s.projeto, s.branch, s.primeiro ?? null, s.ultimo || null, ag.ativa.get(id) ?? null);
      }
      for (const chave of tarefas) {
        const t = ag.tarefas.get(chave);
        if (t) this.sql.tarefa.run(chave, t.sessaoId, t.projeto, t.titulo, t.status, t.criado, t.atualizado);
      }
      for (const id of mensagens) {
        const m = ag.mensagens.get(id);
        if (m) this.sql.mensagem.run(id, m.sessao, m.modelo, m.quando, m.tarefa, m.uso.input, m.uso.cache_write, m.uso.cache_read, m.uso.output);
      }
      for (const h of status) this.sql.status.run(h.tarefa, h.status, h.quando);

      for (const chaveReq of cs.reqs) {
        const sep = chaveReq.lastIndexOf('::');
        const chaveFio = chaveReq.slice(0, sep);
        const mid = chaveReq.slice(sep + 2);
        const f = ag.consumo.fios.get(chaveFio);
        const r = f?.reqs.get(mid);
        if (r) {
          this.sql.reqDetalhe.run(
            r.id, r.sessao, r.fio, r.isSubagente ? 1 : 0, r.modelo, r.quando,
            r.input, r.cache_write, r.cache_write_5m, r.cache_write_1h,
            r.cache_read, r.output, r.output_bytes, JSON.stringify(r.tools), JSON.stringify(r.entradas),
            r.compactacao_marcada ? 1 : 0, r.hook_injetado ? 1 : 0, r.subagente_disparado ? 1 : 0,
            r.quando_anterior ?? null, r.tipo_anterior ?? null,
          );
        }
      }
      if (cs.chamadas.size) {
        for (const lista of ag.consumo.chamadasSubagente.values()) {
          for (const c of lista) {
            if (cs.chamadas.has(c.id)) {
              this.sql.chamadaSub.run(c.id, c.sessao, c.subagent_type, c.model_solicitado, c.briefing_bytes, c.quando);
            }
          }
        }
      }
      for (const chaveL of cs.leituras) {
        const [sid, hash] = chaveL.split('::');
        const rec = ag.consumo.leiturasArquivo.get(sid)?.get(hash);
        if (rec) this.sql.leituraArq.run(sid, hash, rec.total, JSON.stringify([...rec.fios]));
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    mensagens.clear(); tarefas.clear(); sessoes.clear(); status.length = 0;
    cs.reqs.clear(); cs.chamadas.clear(); cs.leituras.clear();
    return total;
  }

  /** Carrega o histórico salvo num agregador vazio. */
  restaurar(ag) {
    const linhas = (q) => this.db.prepare(q).all();
    ag.restaurar({
      sessoes: linhas('SELECT id, projeto, branch, tarefa_ativa AS tarefaAtiva FROM sessoes'),
      tarefas: linhas('SELECT * FROM tarefas'),
      mensagens: linhas('SELECT * FROM mensagens ORDER BY quando'),
      requisicoes: linhas('SELECT * FROM requisicoes_detalhe ORDER BY quando'),
      chamadas: linhas('SELECT * FROM chamadas_subagente ORDER BY quando'),
      leituras: linhas('SELECT * FROM leituras_arquivo'),
    });
    ag.sujos.mensagens.clear(); ag.sujos.tarefas.clear(); ag.sujos.sessoes.clear(); ag.sujos.status.length = 0;
  }

  historicoStatus() {
    return this.db.prepare('SELECT tarefa, status, quando FROM historico_status ORDER BY rowid').all();
  }

  consulta(sql, ...params) {
    return this.db.prepare(sql).all(...params);
  }

  fechar() {
    this.db.close();
  }
}
