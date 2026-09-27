import axios from 'axios';
import type { TransactionFilters } from './transactions';

export type SavedViewScope = 'account' | 'global';

export interface SavedView {
    id: number;
    scope: SavedViewScope;
    account_id: number | null;
    name: string;
    filters: Record<string, unknown>;
    is_default: boolean;
    position: number;
    created_at: string;
    deleted_at: string | null;
}

export interface ListSavedViewsOpts {
    scope?: SavedViewScope;
    accountId?: number;
}

export async function listSavedViews(opts: ListSavedViewsOpts = {}): Promise<SavedView[]> {
    const params: Record<string, string> = {};
    if (opts.scope) params.scope = opts.scope;
    if (opts.accountId !== undefined) params.account_id = String(opts.accountId);
    const { data } = await axios.get<SavedView[]>('/api/saved-views', { params });
    return data;
}

export async function createSavedView(input: {
    scope: SavedViewScope;
    account_id: number | null;
    name: string;
    filters: TransactionFilters;
    is_default?: boolean;
}): Promise<SavedView> {
    const { data } = await axios.post<SavedView>('/api/saved-views', input);
    return data;
}

export async function updateSavedView(
    id: number,
    input: { name?: string; filters?: TransactionFilters },
): Promise<SavedView> {
    const { data } = await axios.put<SavedView>(`/api/saved-views/${id}`, input);
    return data;
}

export async function setSavedViewDefault(id: number, isDefault: boolean): Promise<SavedView> {
    const { data } = await axios.put<SavedView>(`/api/saved-views/${id}/default`, { is_default: isDefault });
    return data;
}

export async function deleteSavedView(id: number): Promise<void> {
    await axios.delete(`/api/saved-views/${id}`);
}

const KNOWN_FILTER_KEYS = new Set([
    'keyword',
    'from',
    'to',
    'category',
    'type',
    'amountMin',
    'amountMax',
    'hasAttachment',
    'recurringOnly',
    'tagIds',
    'tagMode',
    'cleared',
]);

// Strip unknown keys so a client that's older than the saved view doesn't apply garbage.
// Unknown keys are silently ignored rather than rejected — forward-compat.
export function sanitiseSavedFilters(raw: Record<string, unknown>): TransactionFilters {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
        if (KNOWN_FILTER_KEYS.has(k)) out[k] = v;
    }
    return out as TransactionFilters;
}
