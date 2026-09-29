import { Router } from 'express';
import db from '../db';
import { findByAccount, getBalance } from '../transactions/repository';
import { resolveSavedViewFilters } from '../saved-views/resolve';

const router = Router();

const RECENT_TRANSACTIONS_LIMIT = 5;

interface ConfiguredAccountRow {
    account_id: number;
    position: number;
    saved_view_id: number | null;
}

interface AccountRow {
    id: number;
    name: string;
}

interface DashboardAccountResponse {
    id: number;
    name: string;
    balance_cents: number;
    recent_transactions: Array<{
        id: number;
        description: string | null;
        amount_cents: number | null;
        type: string | null;
        date: string | null;
    }>;
}

router.get('/', (_req, res) => {
    // One "transactions" tile is shown per account — when more than one config row targets the
    // same account, the lowest position wins (see dashboard/routes.test.ts).
    const configuredAccounts = db
        .prepare(
            `
        SELECT account_id, position, saved_view_id
        FROM (
            SELECT account_id, position, saved_view_id,
                   ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY position) AS rn
            FROM dashboard_config
            WHERE tile_type = 'transactions'
        )
        WHERE rn = 1
        ORDER BY position
    `,
        )
        .all() as ConfiguredAccountRow[];

    const accounts: DashboardAccountResponse[] = [];
    for (const configured of configuredAccounts) {
        const account = db
            .prepare(`SELECT id, name FROM accounts WHERE id = ? AND deleted_at IS NULL`)
            .get(configured.account_id) as AccountRow | undefined;
        if (!account) continue;

        const filters = resolveSavedViewFilters(configured.saved_view_id, account.id);
        const recent = findByAccount(account.id, filters, RECENT_TRANSACTIONS_LIMIT);

        accounts.push({
            id: account.id,
            name: account.name,
            balance_cents: getBalance(account.id, filters),
            recent_transactions: recent.map((t) => ({
                id: t.id,
                description: t.description,
                amount_cents: t.amount_cents,
                type: t.type,
                date: t.date,
            })),
        });
    }

    res.json({ accounts });
});

export default router;
