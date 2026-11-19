// Persistência em SQLite (node:sqlite, sem dependências). Guarda fatos, não agregados:
// mensagens com uso acumulado, sessões, tarefas e o histórico de status. Os agregados são
// recalculados na carga, então o banco continua válido se a regra de agregação mudar.
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
CREATE INDEX IF NOT EXISTS mensagens_sessao ON mensagens(sessao);
CREATE TABLE IF NOT EXISTS meta (chave TEXT PRIMARY KEY, valor TEXT);
INSERT OR IGNORE INTO meta VALUES ('versao_esquema', '1');
`;

export class Persistencia {
  constructor(caminho) {
    if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true });
    this.db = new DatabaseSync(caminho);
    this.db.exec(ESQUEMA);
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
    };
  }

  /** Grava o que mudou desde o último salvamento, numa transação. Retorna quantas linhas gravou. */
  salvar(ag) {
    const { mensagens, tarefas, sessoes, status } = ag.sujos;
    const total = mensagens.size + tarefas.size + sessoes.size + status.length;
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
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    mensagens.clear(); tarefas.clear(); sessoes.clear(); status.length = 0;
    return total;
  }

  /** Carrega o histórico salvo num agregador vazio. */
  restaurar(ag) {
    const linhas = (q) => this.db.prepare(q).all();
    ag.restaurar({
      sessoes: linhas('SELECT id, projeto, branch, tarefa_ativa AS tarefaAtiva FROM sessoes'),
      tarefas: linhas('SELECT * FROM tarefas'),
      mensagens: linhas('SELECT * FROM mensagens ORDER BY quando'),
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
