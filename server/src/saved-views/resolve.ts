import { findById, type SavedView } from './repository';
import type { TransactionFilters } from '../transactions/repository';

// A view is usable on a tile/query for a given account when it's global, or scoped to that
// same account. An account-scoped view never applies to a different account's data.
export function isSavedViewCompatibleWithAccount(view: SavedView, accountId: number | null): boolean {
    return view.scope === 'global' || view.account_id === accountId;
}

// Resolves a saved_view_id to the filters it should apply for a given account. Returns
// undefined (unfiltered) when the view no longer exists (see docs/adr/0001) or isn't
// compatible with that account — callers must not trust a caller-supplied saved_view_id
// without this check, since it may reference a view scoped to a different account.
export function resolveSavedViewFilters(savedViewId: number | null | undefined, accountId: number | null): TransactionFilters | undefined {
    if (savedViewId == null) return undefined;
    const view = findById(savedViewId);
    if (!view) return undefined;
    if (!isSavedViewCompatibleWithAccount(view, accountId)) return undefined;
    return view.filters as TransactionFilters;
}
