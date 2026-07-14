import { Router } from 'express';
import * as repo from './repository';
import * as accountRepo from '../accounts/repository';
import { CROSS_ACCOUNT_TILE_TYPES, type TileType, type DashboardConfigItem, type UpdateTileFields } from './repository';

const router = Router();

const VALID_TILE_TYPES: TileType[] = ['transactions', 'balance_over_time', 'totals_by_category', 'income_vs_expense', 'budget_progress', 'net_worth', 'net_worth_chart', 'forecast'];
const TILE_TYPE_ERROR = `tile_type must be one of: ${VALID_TILE_TYPES.join(', ')}`;
const FORECAST_WINDOWS = ['14d', '30d', '60d', '90d'];

function isCrossAccountType(tileType: TileType): boolean {
    return CROSS_ACCOUNT_TILE_TYPES.includes(tileType);
}

function isValidWindow(w: string): boolean {
    if (w === 'all') return true;
    if (w === '30d' || w === '3m' || w === '6m' || w === '12m') return true;
    const weeksMatch = w.match(/^(\d+)w$/);
    if (weeksMatch) {
        const n = parseInt(weeksMatch[1], 10);
        return n >= 1 && n <= 52;
    }
    return false;
}

function isValidWindowForType(tileType: TileType, w: string): boolean {
    if (tileType === 'forecast') return FORECAST_WINDOWS.includes(w);
    return isValidWindow(w);
}

function toClientItem(item: DashboardConfigItem) {
    return { ...item, show_balance: item.show_balance === 1, forecast_discretionary: item.forecast_discretionary === 1 };
}

router.get('/', (_req, res) => {
    res.json({ items: repo.getAll().map(toClientItem) });
});

router.post('/cross-account', (req, res) => {
    const { tile_type, time_window } = req.body as { tile_type?: string; time_window?: string };
    if (!tile_type || !VALID_TILE_TYPES.includes(tile_type as TileType) || !isCrossAccountType(tile_type as TileType)) {
        res.status(400).json({ error: `tile_type must be one of: ${CROSS_ACCOUNT_TILE_TYPES.join(', ')}` });
        return;
    }
    const tileType = tile_type as TileType;
    const needsWindow = tileType === 'net_worth_chart';
    if (needsWindow) {
        if (!time_window) {
            res.status(400).json({ error: 'time_window is required for chart tiles' });
            return;
        }
        if (!isValidWindow(time_window)) {
            res.status(400).json({ error: 'invalid time_window value' });
            return;
        }
    }
    const item = repo.add(null, tileType, needsWindow ? time_window : undefined);
    res.status(201).json(toClientItem(item));
});

router.post('/:accountId', (req, res) => {
    const accountId = parseInt(req.params.accountId, 10);
    if (!accountRepo.findById(accountId)) {
        res.status(404).json({ error: 'account not found' });
        return;
    }
    const { tile_type, time_window, forecast_discretionary } = req.body as { tile_type?: string; time_window?: string; forecast_discretionary?: unknown };
    if (!tile_type || !VALID_TILE_TYPES.includes(tile_type as TileType) || isCrossAccountType(tile_type as TileType)) {
        res.status(400).json({ error: TILE_TYPE_ERROR });
        return;
    }
    const tileType = tile_type as TileType;
    // 'transactions' shows live data; 'budget_progress' uses per-budget periods — neither needs a window
    const needsWindow = tileType !== 'transactions' && tileType !== 'budget_progress';
    if (needsWindow) {
        if (!time_window) {
            res.status(400).json({ error: 'time_window is required for chart tiles' });
            return;
        }
        if (!isValidWindowForType(tileType, time_window)) {
            res.status(400).json({ error: 'invalid time_window value' });
            return;
        }
    }
    const item = repo.add(accountId, tileType, needsWindow ? time_window : undefined, forecast_discretionary === true);
    res.status(201).json(toClientItem(item));
});

router.patch('/:id/show-balance', (req, res) => {
    const tileId = parseInt(req.params.id, 10);
    const { show_balance } = req.body as { show_balance?: unknown };
    if (typeof show_balance !== 'boolean') {
        res.status(400).json({ error: 'show_balance must be a boolean' });
        return;
    }
    const updated = repo.updateShowBalance(tileId, show_balance);
    if (!updated) {
        res.status(404).json({ error: 'tile not found' });
        return;
    }
    res.json(toClientItem(updated));
});

router.patch('/:id', (req, res) => {
    const tileId = parseInt(req.params.id, 10);
    const { account_id, tile_type, time_window, show_balance, forecast_discretionary } = req.body as {
        account_id?: unknown;
        tile_type?: unknown;
        time_window?: unknown;
        show_balance?: unknown;
        forecast_discretionary?: unknown;
    };

    if (!tile_type || !VALID_TILE_TYPES.includes(tile_type as TileType)) {
        res.status(400).json({ error: TILE_TYPE_ERROR });
        return;
    }
    const tileType = tile_type as TileType;
    const crossAccount = isCrossAccountType(tileType);

    if (crossAccount) {
        if (account_id !== null && account_id !== undefined) {
            res.status(400).json({ error: 'account_id must be null for cross-account tile types' });
            return;
        }
    } else {
        if (typeof account_id !== 'number') {
            res.status(400).json({ error: 'account_id must be a number' });
            return;
        }
        if (!accountRepo.findById(account_id)) {
            res.status(404).json({ error: 'account not found' });
            return;
        }
    }

    const needsWindow = crossAccount ? tileType === 'net_worth_chart' : tileType !== 'transactions' && tileType !== 'budget_progress';
    if (needsWindow) {
        if (!time_window || typeof time_window !== 'string') {
            res.status(400).json({ error: 'time_window is required for chart tiles' });
            return;
        }
        if (!isValidWindowForType(tileType, time_window)) {
            res.status(400).json({ error: 'invalid time_window value' });
            return;
        }
    }
    if (typeof show_balance !== 'boolean') {
        res.status(400).json({ error: 'show_balance must be a boolean' });
        return;
    }

    const fields: UpdateTileFields = {
        account_id: crossAccount ? null : (account_id as number),
        tile_type: tileType,
        time_window: needsWindow && typeof time_window === 'string' ? time_window : null,
        show_balance,
        forecast_discretionary: forecast_discretionary === true,
    };
    const updated = repo.updateTile(tileId, fields);
    if (!updated) {
        res.status(404).json({ error: 'tile not found' });
        return;
    }
    res.json(toClientItem(updated));
});

router.delete('/:id', (req, res) => {
    const tileId = parseInt(req.params.id, 10);
    const removed = repo.remove(tileId);
    if (!removed) {
        res.status(404).json({ error: 'tile not found in dashboard config' });
        return;
    }
    res.status(204).send();
});

router.put('/order', (req, res) => {
    const { tile_ids } = req.body as { tile_ids?: number[] };
    if (!Array.isArray(tile_ids)) {
        res.status(400).json({ error: 'tile_ids must be an array' });
        return;
    }
    const current = repo.getAll().map((item) => item.id);
    const currentSet = new Set(current);
    const valid = tile_ids.every((id) => currentSet.has(id));
    if (!valid || tile_ids.length !== current.length) {
        res.status(400).json({ error: 'tile_ids must match current dashboard config' });
        return;
    }
    repo.reorder(tile_ids);
    res.json({ items: repo.getAll().map(toClientItem) });
});

export default router;
