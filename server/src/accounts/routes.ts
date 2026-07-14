import { Router } from 'express';
import db from '../db';
import * as repo from './repository';
import * as dashboardConfig from '../dashboard-config/repository';

const router = Router();

router.get('/', (_req, res) => {
    res.json(repo.findAll());
});

// Must be registered before /:id to avoid Express matching 'balances' as an ID
router.get('/balances', (_req, res) => {
    const rows = db
        .prepare(
            `
        WITH balances AS (
            SELECT account_id, SUM(amount_cents) AS balance_cents
            FROM transactions
            WHERE deleted_at IS NULL
            GROUP BY account_id
        )
        SELECT a.id, a.name, COALESCE(b.balance_cents, 0) AS balance_cents
        FROM accounts a
        LEFT JOIN balances b ON b.account_id = a.id
        WHERE a.deleted_at IS NULL
        ORDER BY a.name
    `,
        )
        .all();
    res.json(rows);
});

function isValidKind(kind: unknown): kind is 'asset' | 'liability' {
    return kind === 'asset' || kind === 'liability';
}

router.post('/', (req, res) => {
    const { name, kind, exclude_from_net_worth } = req.body as { name?: string; kind?: unknown; exclude_from_net_worth?: unknown };
    if (!name || name.trim() === '') {
        res.status(400).json({ error: 'name is required' });
        return;
    }
    if (kind !== undefined && !isValidKind(kind)) {
        res.status(400).json({ error: 'kind must be asset or liability' });
        return;
    }
    if (repo.findByName(name.trim())) {
        res.status(409).json({ error: 'name already exists' });
        return;
    }
    const account = repo.create(name.trim(), isValidKind(kind) ? kind : 'asset', exclude_from_net_worth === true);
    dashboardConfig.add(account.id, 'transactions');
    res.status(201).json(account);
});

router.get('/:id/cleared-balance', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!repo.findById(id)) {
        res.status(404).json({ error: 'account not found' });
        return;
    }
    const row = db
        .prepare(
            'SELECT COALESCE(SUM(amount_cents), 0) AS cleared_balance_cents FROM transactions WHERE account_id = ? AND cleared_at IS NOT NULL AND deleted_at IS NULL',
        )
        .get(id) as { cleared_balance_cents: number };
    res.json({ cleared_balance_cents: row.cleared_balance_cents });
});

router.get('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const account = repo.findById(id);
    if (!account) {
        res.status(404).json({ error: 'account not found' });
        return;
    }
    res.json(account);
});

router.put('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { name, kind, exclude_from_net_worth } = req.body as { name?: string; kind?: unknown; exclude_from_net_worth?: unknown };
    if (!name || name.trim() === '') {
        res.status(400).json({ error: 'name is required' });
        return;
    }
    if (kind !== undefined && !isValidKind(kind)) {
        res.status(400).json({ error: 'kind must be asset or liability' });
        return;
    }
    const current = repo.findById(id);
    if (!current) {
        res.status(404).json({ error: 'account not found' });
        return;
    }
    const existing = repo.findByName(name.trim());
    if (existing && existing.id !== id) {
        res.status(409).json({ error: 'name already exists' });
        return;
    }
    const resolvedKind = isValidKind(kind) ? kind : current.kind;
    const resolvedExclude = exclude_from_net_worth === undefined ? current.exclude_from_net_worth === 1 : exclude_from_net_worth === true;
    const account = repo.update(id, name.trim(), resolvedKind, resolvedExclude);
    if (!account) {
        res.status(404).json({ error: 'account not found' });
        return;
    }
    res.json(account);
});

router.delete('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const deleted = repo.softDelete(id);
    if (!deleted) {
        res.status(404).json({ error: 'account not found' });
        return;
    }
    res.status(204).send();
});

export default router;
