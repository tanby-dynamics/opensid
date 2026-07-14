import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.env.DATABASE_PATH ?? path.resolve('sid.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT (datetime('now')),
        deleted_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS transactions (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id   INTEGER NOT NULL REFERENCES accounts(id),
        description  TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        type         TEXT NOT NULL CHECK(type IN ('income', 'expense')),
        date         DATE NOT NULL,
        notes        TEXT,
        created_at   DATETIME NOT NULL DEFAULT (datetime('now')),
        updated_at   DATETIME NOT NULL DEFAULT (datetime('now')),
        deleted_at   DATETIME
    );

    CREATE TABLE IF NOT EXISTS attachments (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER NOT NULL REFERENCES transactions(id),
        filename       TEXT NOT NULL,
        mime_type      TEXT NOT NULL,
        size_bytes     INTEGER NOT NULL DEFAULT 0,
        data           BLOB NOT NULL,
        created_at     DATETIME NOT NULL DEFAULT (datetime('now')),
        deleted_at     DATETIME
    );
`);

try {
    db.exec(`ALTER TABLE attachments ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0`);
} catch {
    // column already exists
}

try {
    db.exec(`ALTER TABLE transactions ADD COLUMN category TEXT`);
} catch {
    // column already exists
}

try {
    db.exec(`ALTER TABLE transactions ADD COLUMN created_at DATETIME`);
    db.exec(`UPDATE transactions SET created_at = datetime('now') WHERE created_at IS NULL`);
} catch {
    // column already exists
}

try {
    db.exec(`ALTER TABLE transactions ADD COLUMN recurrence TEXT CHECK(recurrence IN ('daily','weekly','fortnightly','monthly','yearly') OR recurrence IS NULL)`);
} catch { /* column already exists */ }

try {
    db.exec(`ALTER TABLE transactions ADD COLUMN recurrence_end_date DATE`);
} catch { /* column already exists */ }

try {
    db.exec(`ALTER TABLE transactions ADD COLUMN recurrence_source_id INTEGER REFERENCES transactions(id)`);
} catch { /* column already exists */ }

db.exec(`
    CREATE TABLE IF NOT EXISTS budgets (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id        INTEGER NOT NULL REFERENCES accounts(id),
        category          TEXT NOT NULL,
        amount_cents      INTEGER NOT NULL,
        period            TEXT NOT NULL DEFAULT 'monthly' CHECK(period IN ('monthly', 'weekly')),
        warning_threshold INTEGER NOT NULL DEFAULT 80,
        danger_threshold  INTEGER NOT NULL DEFAULT 100,
        created_at        DATETIME NOT NULL DEFAULT (datetime('now')),
        deleted_at        DATETIME,
        UNIQUE(account_id, category)
    );
`);

// ALTER runs before CREATE: if dashboard_config doesn't exist the ALTER throws and is swallowed,
// then CREATE TABLE IF NOT EXISTS creates it with the columns already in the schema definition.
try {
    db.exec(`ALTER TABLE dashboard_config ADD COLUMN tile_type TEXT DEFAULT 'transactions'`);
} catch {
    // column already exists
}

try {
    db.exec(`ALTER TABLE dashboard_config ADD COLUMN time_window TEXT`);
} catch {
    // column already exists
}

db.exec(`
    CREATE TABLE IF NOT EXISTS dashboard_config (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id  INTEGER NOT NULL REFERENCES accounts(id),
        position    INTEGER NOT NULL,
        tile_type   TEXT NOT NULL DEFAULT 'transactions',
        time_window TEXT
    );
`);

try {
    db.exec(`ALTER TABLE dashboard_config ADD COLUMN show_balance INTEGER NOT NULL DEFAULT 0`);
    db.exec(`UPDATE dashboard_config SET show_balance = 1 WHERE tile_type = 'transactions'`);
} catch {
    // column already exists
}

try {
    db.exec(`ALTER TABLE dashboard_config ADD COLUMN forecast_discretionary INTEGER NOT NULL DEFAULT 0`);
} catch {
    // column already exists
}

db.exec(`
    CREATE TABLE IF NOT EXISTS saved_views (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        scope       TEXT NOT NULL CHECK(scope IN ('account', 'global')),
        account_id  INTEGER REFERENCES accounts(id),
        name        TEXT NOT NULL,
        filters     TEXT NOT NULL,
        is_default  INTEGER NOT NULL DEFAULT 0,
        position    INTEGER NOT NULL DEFAULT 0,
        created_at  DATETIME NOT NULL DEFAULT (datetime('now')),
        deleted_at  DATETIME
    );

    CREATE UNIQUE INDEX IF NOT EXISTS saved_views_one_default_per_scope
        ON saved_views(scope, COALESCE(account_id, -1))
        WHERE is_default = 1 AND deleted_at IS NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS saved_views_unique_name_per_scope
        ON saved_views(scope, COALESCE(account_id, -1), LOWER(name))
        WHERE deleted_at IS NULL;
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        colour     TEXT,
        created_at DATETIME NOT NULL DEFAULT (datetime('now')),
        deleted_at DATETIME
    );

    CREATE UNIQUE INDEX IF NOT EXISTS tags_name_unique
        ON tags(LOWER(name)) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS transaction_tags (
        transaction_id INTEGER NOT NULL REFERENCES transactions(id),
        tag_id         INTEGER NOT NULL REFERENCES tags(id),
        PRIMARY KEY (transaction_id, tag_id)
    );
`);

// One-shot migration: widen type CHECK to include 'transfer' and add transfer_group_id.
// SQLite cannot ALTER a CHECK constraint, so we use the table-rename pattern.
{
    const cols = (db.prepare('PRAGMA table_info(transactions)').all() as { name: string }[]).map((c) => c.name);
    if (!cols.includes('transfer_group_id')) {
        db.pragma('foreign_keys = OFF');
        db.exec(`
            BEGIN TRANSACTION;

            CREATE TABLE transactions_new (
                id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id           INTEGER NOT NULL REFERENCES accounts(id),
                description          TEXT NOT NULL,
                amount_cents         INTEGER NOT NULL,
                type                 TEXT NOT NULL CHECK(type IN ('income', 'expense', 'transfer')),
                date                 DATE NOT NULL,
                notes                TEXT,
                created_at           DATETIME NOT NULL DEFAULT (datetime('now')),
                updated_at           DATETIME NOT NULL DEFAULT (datetime('now')),
                deleted_at           DATETIME,
                category             TEXT,
                recurrence           TEXT CHECK(recurrence IN ('daily','weekly','fortnightly','monthly','yearly') OR recurrence IS NULL),
                recurrence_end_date  DATE,
                recurrence_source_id INTEGER REFERENCES transactions_new(id),
                transfer_group_id    TEXT
            );

            INSERT INTO transactions_new
                (id, account_id, description, amount_cents, type, date, notes,
                 created_at, updated_at, deleted_at, category, recurrence,
                 recurrence_end_date, recurrence_source_id, transfer_group_id)
            SELECT id, account_id, description, amount_cents, type, date, notes,
                   created_at, updated_at, deleted_at, category, recurrence,
                   recurrence_end_date, recurrence_source_id, NULL
            FROM transactions;

            DROP TABLE transactions;

            ALTER TABLE transactions_new RENAME TO transactions;

            CREATE INDEX IF NOT EXISTS transactions_transfer_group_id
                ON transactions(transfer_group_id) WHERE transfer_group_id IS NOT NULL;

            COMMIT;
        `);
        db.pragma('foreign_keys = ON');
    }
}

// Backfill: transactions with no category get description copied to category
db.exec(`UPDATE transactions SET category = description WHERE category IS NULL OR category = ''`);

// Seed dashboard_config for existing accounts on first run (no-op if already populated)
const seeded = (db.prepare('SELECT COUNT(*) AS cnt FROM dashboard_config').get() as { cnt: number }).cnt;
if (seeded === 0) {
    db.exec(`
        INSERT INTO dashboard_config (account_id, position)
        SELECT id, ROW_NUMBER() OVER (ORDER BY name) AS position
        FROM accounts
        WHERE deleted_at IS NULL
    `);
}

try {
    db.exec(`ALTER TABLE transactions ADD COLUMN cleared_at DATETIME`);
} catch { /* column already exists */ }

db.exec(`
    CREATE TABLE IF NOT EXISTS reconciliations (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id              INTEGER NOT NULL REFERENCES accounts(id),
        statement_date          DATE NOT NULL,
        statement_balance_cents INTEGER NOT NULL,
        completed_at            DATETIME NOT NULL DEFAULT (datetime('now')),
        notes                   TEXT
    );
`);

try {
    db.exec(`ALTER TABLE accounts ADD COLUMN kind TEXT NOT NULL DEFAULT 'asset' CHECK(kind IN ('asset','liability'))`);
} catch { /* column already exists */ }

try {
    db.exec(`ALTER TABLE accounts ADD COLUMN exclude_from_net_worth INTEGER NOT NULL DEFAULT 0`);
} catch { /* column already exists */ }

// One-shot migration: allow NULL account_id on dashboard_config for cross-account tiles
// (net_worth / net_worth_chart). SQLite cannot drop a NOT NULL constraint, so table-rename.
{
    const cols = (db.prepare('PRAGMA table_info(dashboard_config)').all() as { name: string; notnull: number }[]);
    const accountIdCol = cols.find((c) => c.name === 'account_id');
    if (accountIdCol && accountIdCol.notnull === 1) {
        db.pragma('foreign_keys = OFF');
        db.exec(`
            BEGIN TRANSACTION;

            CREATE TABLE dashboard_config_new (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id  INTEGER REFERENCES accounts(id),
                position    INTEGER NOT NULL,
                tile_type   TEXT NOT NULL DEFAULT 'transactions',
                time_window TEXT,
                show_balance INTEGER NOT NULL DEFAULT 0,
                forecast_discretionary INTEGER NOT NULL DEFAULT 0
            );

            INSERT INTO dashboard_config_new
                (id, account_id, position, tile_type, time_window, show_balance, forecast_discretionary)
            SELECT id, account_id, position, tile_type, time_window, show_balance, forecast_discretionary
            FROM dashboard_config;

            DROP TABLE dashboard_config;

            ALTER TABLE dashboard_config_new RENAME TO dashboard_config;

            COMMIT;
        `);
        db.pragma('foreign_keys = ON');
    }
}

db.exec(`
    CREATE TABLE IF NOT EXISTS rules (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        name                TEXT NOT NULL,
        priority            INTEGER NOT NULL DEFAULT 100,
        enabled             INTEGER NOT NULL DEFAULT 1,
        account_id          INTEGER REFERENCES accounts(id),
        match_type          TEXT NOT NULL DEFAULT 'substring' CHECK(match_type IN ('substring','regex')),
        description_pattern TEXT,
        amount_min_cents    INTEGER,
        amount_max_cents    INTEGER,
        tx_type             TEXT CHECK(tx_type IN ('income','expense','transfer') OR tx_type IS NULL),
        set_category        TEXT,
        add_tag_ids         TEXT,
        notes_prefix        TEXT,
        last_run_at         DATETIME,
        last_match_count    INTEGER NOT NULL DEFAULT 0,
        created_at          DATETIME NOT NULL DEFAULT (datetime('now')),
        deleted_at          DATETIME
    );
`);

export default db;


