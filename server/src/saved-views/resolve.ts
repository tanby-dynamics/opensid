import { findById } from './repository';
import type { TransactionFilters } from '../transactions/repository';

// Resolves a tile's saved_view_id to the filters it should apply. Returns undefined
// (unfiltered) when the view no longer exists — see docs/adr/0001.
export function resolveSavedViewFilters(savedViewId: number | null | undefined): TransactionFilters | undefined {
    if (savedViewId == null) return undefined;
    const view = findById(savedViewId);
    if (!view) return undefined;
    return view.filters as TransactionFilters;
}
