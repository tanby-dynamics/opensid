import t from 'tap';
import db from '../db';
import { exportAll, importMerge, importWipe } from './repository';
import type { BackupPayload } from './types';

function resetDatabase() {
    db.exec(`
        DELETE FROM reconciliations;
        DELETE FROM dashboard_config;
        DELETE FROM transactions;
        DELETE FROM accounts;
    `);
}

function insertAccount(name: string, reconciliationEnabled: number): number {
    return Number(
        db
            .prepare('INSERT INTO accounts (name, reconciliation_enabled) VALUES (?, ?)')
            .run(name, reconciliationEnabled).lastInsertRowid,
    );
}

function emptyPayload(overrides: Partial<BackupPayload> = {}): BackupPayload {
    return {
        version: 8,
        exported_at: new Date().toISOString(),
        accounts: [],
        transactions: [],
        attachments: [],
        budgets: [],
        saved_views: [],
        tags: [],
        transaction_tags: [],
        reconciliations: [],
        rules: [],
        ...overrides,
    };
}

t.beforeEach(() => {
    resetDatabase();
});

t.teardown(() => {
    resetDatabase();
});

t.test('exportAll — round-trips reconciliation_enabled', (t) => {
    insertAccount('Checking', 1);
    insertAccount('Expense tracker', 0);

    const payload = exportAll();
    const byName = new Map(payload.accounts.map((a) => [a.name, a.reconciliation_enabled]));

    t.equal(byName.get('Checking'), 1);
    t.equal(byName.get('Expense tracker'), 0);
    t.end();
});

t.test('importMerge — preserves reconciliation_enabled from the backup', (t) => {
    const payload = emptyPayload({
        accounts: [
            { id: 1, name: 'Checking', created_at: '2026-01-01', deleted_at: null, kind: 'asset', exclude_from_net_worth: 0, reconciliation_enabled: 1 },
        ],
    });

    importMerge(payload);

    const account = db.prepare('SELECT reconciliation_enabled FROM accounts WHERE name = ?').get('Checking') as { reconciliation_enabled: number };
    t.equal(account.reconciliation_enabled, 1);
    t.end();
});

t.test('importMerge — grandfathers legacy backups with no reconciliation_enabled field to enabled', (t) => {
    const payload = emptyPayload({
        accounts: [
            { id: 1, name: 'Checking', created_at: '2026-01-01', deleted_at: null, kind: 'asset', exclude_from_net_worth: 0 } as never,
        ],
    });

    importMerge(payload);

    const account = db.prepare('SELECT reconciliation_enabled FROM accounts WHERE name = ?').get('Checking') as { reconciliation_enabled: number };
    t.equal(account.reconciliation_enabled, 1);
    t.end();
});

t.test('importWipe — preserves reconciliation_enabled from the backup', (t) => {
    const payload = emptyPayload({
        accounts: [
            { id: 1, name: 'Checking', created_at: '2026-01-01', deleted_at: null, kind: 'asset', exclude_from_net_worth: 0, reconciliation_enabled: 0 },
        ],
    });

    importWipe(payload);

    const account = db.prepare('SELECT reconciliation_enabled FROM accounts WHERE name = ?').get('Checking') as { reconciliation_enabled: number };
    t.equal(account.reconciliation_enabled, 0);
    t.end();
});
