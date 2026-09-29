import { Router } from 'express';
import db from '../db';
import { findByAccount, getBalance } from '../transactions/repository';
import { resolveSavedViewFilters } from '../saved-views/resolve';

const router = Router();

const RECENT_TRANSACTIONS_LIMIT = 5;

interface ConfiguredTileRow {
    tile_id: number;
    account_id: number;
    saved_view_id: number | null;
}

interface AccountRow {
    id: number;
    name: string;
}

interface DashboardTileResponse {
    tile_id: number;
    account_id: number;
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
    // One entry per "transactions" tile. An account may have several, each with its own saved view.
    const configuredTiles = db
        .prepare(
            `
        SELECT id AS tile_id, account_id, saved_view_id
        FROM dashboard_config
        WHERE tile_type = 'transactions'
        ORDER BY position
    `,
        )
        .all() as ConfiguredTileRow[];

    const tiles: DashboardTileResponse[] = [];
    for (const configured of configuredTiles) {
        const account = db
            .prepare(`SELECT id, name FROM accounts WHERE id = ? AND deleted_at IS NULL`)
            .get(configured.account_id) as AccountRow | undefined;
        if (!account) continue;

        const filters = resolveSavedViewFilters(configured.saved_view_id, account.id);
        const recent = findByAccount(account.id, filters, RECENT_TRANSACTIONS_LIMIT);

        tiles.push({
            tile_id: configured.tile_id,
            account_id: account.id,
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

    res.json({ tiles });
});

export default router;
