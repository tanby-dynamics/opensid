import { Router } from 'express';
import { findById } from '../accounts/repository';
import { isValidWindow, parseWindowToFromDate, getBalanceOverTime, getCategoryTotals, getIncomeVsExpenseByMonth } from './repository';
import { resolveSavedViewFilters } from '../saved-views/resolve';
import type { TransactionFilters } from '../transactions/repository';

const router = Router({ mergeParams: true });

function parseSavedViewId(query: Record<string, unknown>, accountId: number): TransactionFilters | undefined {
    const { saved_view_id } = query as { saved_view_id?: string };
    if (!saved_view_id) return undefined;
    const id = parseInt(saved_view_id, 10);
    if (!Number.isFinite(id)) return undefined;
    return resolveSavedViewFilters(id, accountId);
}

router.get('/balance', (req, res) => {
    const accountId = parseInt((req.params as any).id, 10);
    const account = findById(accountId);
    if (!account) return void res.status(404).json({ error: 'account not found' });

    const { window } = req.query as { window?: string };
    if (!window || !isValidWindow(window)) {
        return void res.status(400).json({ error: 'invalid or missing window parameter' });
    }

    const fromDate = parseWindowToFromDate(window);
    const data = getBalanceOverTime(accountId, fromDate, parseSavedViewId(req.query as Record<string, unknown>, accountId));
    res.json(data);
});

router.get('/categories', (req, res) => {
    const accountId = parseInt((req.params as any).id, 10);
    const account = findById(accountId);
    if (!account) return void res.status(404).json({ error: 'account not found' });

    const { window } = req.query as { window?: string };
    if (!window || !isValidWindow(window)) {
        return void res.status(400).json({ error: 'invalid or missing window parameter' });
    }

    const fromDate = parseWindowToFromDate(window);
    const data = getCategoryTotals(accountId, fromDate, parseSavedViewId(req.query as Record<string, unknown>, accountId));
    res.json(data);
});

router.get('/income-vs-expense', (req, res) => {
    const accountId = parseInt((req.params as any).id, 10);
    const account = findById(accountId);
    if (!account) return void res.status(404).json({ error: 'account not found' });

    const { window } = req.query as { window?: string };
    if (!window || !isValidWindow(window)) {
        return void res.status(400).json({ error: 'invalid or missing window parameter' });
    }

    const fromDate = parseWindowToFromDate(window);
    const data = getIncomeVsExpenseByMonth(accountId, fromDate, parseSavedViewId(req.query as Record<string, unknown>, accountId));
    res.json(data);
});

export default router;
