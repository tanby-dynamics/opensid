import { Router } from 'express';
import * as repo from './repository';
import { findById as findAccount } from '../accounts/repository';

const router = Router({ mergeParams: true });

router.get<{ accountId: string }>('/', (req, res) => {
    const accountId = parseInt(req.params.accountId, 10);
    if (!findAccount(accountId)) {
        res.status(404).json({ error: 'account not found' });
        return;
    }
    res.json(repo.list(accountId));
});

router.get<{ accountId: string }>('/last', (req, res) => {
    const accountId = parseInt(req.params.accountId, 10);
    if (!findAccount(accountId)) {
        res.status(404).json({ error: 'account not found' });
        return;
    }
    res.json(repo.getLast(accountId));
});

router.post<{ accountId: string }>('/', (req, res) => {
    const accountId = parseInt(req.params.accountId, 10);
    const account = findAccount(accountId);
    if (!account) {
        res.status(404).json({ error: 'account not found' });
        return;
    }
    if (account.reconciliation_enabled !== 1) {
        res.status(403).json({ error: 'Reconciliation is disabled for this account' });
        return;
    }

    const { statement_date, statement_balance_cents, notes } = req.body as {
        statement_date?: string;
        statement_balance_cents?: number;
        notes?: string;
    };

    if (!statement_date || statement_date.trim() === '') {
        res.status(400).json({ error: 'statement_date is required' });
        return;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (statement_date.trim() > today) {
        res.status(400).json({ error: 'Statement date cannot be in the future' });
        return;
    }
    if (statement_balance_cents === undefined || statement_balance_cents === null || isNaN(Number(statement_balance_cents))) {
        res.status(400).json({ error: 'Statement balance is required' });
        return;
    }

    const reconciliation = repo.create({
        account_id: accountId,
        statement_date: statement_date.trim(),
        statement_balance_cents: Number(statement_balance_cents),
        notes: notes?.trim() ?? null,
    });
    res.status(201).json(reconciliation);
});

export default router;
