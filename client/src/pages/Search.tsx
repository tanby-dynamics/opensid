import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
    searchAllTransactions,
    type TransactionFilters,
    type TransactionWithAccount,
} from '../api/transactions';
import { getCategories } from '../api/categories';
import { listTags } from '../api/tags';
import { Page } from '../components/Page';
import ViewsDropdown from '../components/ViewsDropdown';
import { listSavedViews, sanitiseSavedFilters } from '../api/savedViews';
import { formatCents, formatDate, balanceColor } from '../utils/format';

export default function Search() {
    const [keyword, setKeyword] = useState('');
    const [debouncedKeyword, setDebouncedKeyword] = useState('');
    const [filterFrom, setFilterFrom] = useState('');
    const [filterTo, setFilterTo] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterType, setFilterType] = useState<'income' | 'expense' | ''>('');
    const [amountMin, setAmountMin] = useState('');
    const [amountMax, setAmountMax] = useState('');
    const [filterHasAttachment, setFilterHasAttachment] = useState<'yes' | 'no' | ''>('');
    const [filterRecurringOnly, setFilterRecurringOnly] = useState(false);
    const [filterTagIds, setFilterTagIds] = useState<number[]>([]);
    const [filterTagMode, setFilterTagMode] = useState<'any' | 'all'>('any');
    const [activeDefaultViewName, setActiveDefaultViewName] = useState<string | null>(null);
    const defaultAppliedRef = useRef(false);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedKeyword(keyword), 300);
        return () => clearTimeout(t);
    }, [keyword]);

    const activeFilters: TransactionFilters = {
        keyword: debouncedKeyword || undefined,
        from: filterFrom || undefined,
        to: filterTo || undefined,
        category: filterCategory || undefined,
        type: filterType || undefined,
        amountMin: amountMin || undefined,
        amountMax: amountMax || undefined,
        hasAttachment: filterHasAttachment || undefined,
        recurringOnly: filterRecurringOnly || undefined,
        tagIds: filterTagIds.length > 0 ? filterTagIds : undefined,
        tagMode: filterTagMode !== 'any' ? filterTagMode : undefined,
    };
    const isFiltered = Object.values(activeFilters).some(Boolean);

    function clearFilters() {
        setKeyword('');
        setDebouncedKeyword('');
        setFilterFrom('');
        setFilterTo('');
        setFilterCategory('');
        setFilterType('');
        setAmountMin('');
        setAmountMax('');
        setFilterHasAttachment('');
        setFilterRecurringOnly(false);
        setFilterTagIds([]);
        setFilterTagMode('any');
        setActiveDefaultViewName(null);
    }

    function applySavedViewFilters(filters: TransactionFilters, defaultName: string | null = null) {
        setKeyword(filters.keyword ?? '');
        setDebouncedKeyword(filters.keyword ?? '');
        setFilterFrom(filters.from ?? '');
        setFilterTo(filters.to ?? '');
        setFilterCategory(filters.category ?? '');
        setFilterType(filters.type ?? '');
        setAmountMin(filters.amountMin ?? '');
        setAmountMax(filters.amountMax ?? '');
        setFilterHasAttachment(filters.hasAttachment ?? '');
        setFilterRecurringOnly(filters.recurringOnly ?? false);
        setFilterTagIds(Array.isArray(filters.tagIds) ? filters.tagIds : []);
        setFilterTagMode(filters.tagMode ?? 'any');
        setActiveDefaultViewName(defaultName);
    }

    const { data: categories = [] } = useQuery({
        queryKey: ['categories'],
        queryFn: getCategories,
    });

    const { data: allTags = [] } = useQuery({
        queryKey: ['tags'],
        queryFn: listTags,
    });

    const { data: globalSavedViews } = useQuery({
        queryKey: ['saved-views', 'global', null],
        queryFn: () => listSavedViews({ scope: 'global' }),
    });

    useEffect(() => {
        if (defaultAppliedRef.current) return;
        if (!globalSavedViews) return;
        const def = globalSavedViews.find((v) => v.is_default);
        defaultAppliedRef.current = true;
        if (!def) return;
        // One-shot default-view application after the saved views load — setState here is intentional.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        applySavedViewFilters(sanitiseSavedFilters(def.filters), def.name);
    }, [globalSavedViews]);

    const { data: results = [], isLoading } = useQuery({
        queryKey: ['search-transactions', activeFilters],
        queryFn: () => searchAllTransactions(isFiltered ? activeFilters : undefined),
        enabled: isFiltered,
    });

    const grouped = useMemo(() => {
        const map = new Map<number, { name: string; rows: TransactionWithAccount[] }>();
        for (const t of results) {
            const existing = map.get(t.account_id);
            if (existing) existing.rows.push(t);
            else map.set(t.account_id, { name: t.account_name, rows: [t] });
        }
        return Array.from(map.entries())
            .map(([accountId, { name, rows }]) => ({ accountId, name, rows }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [results]);

    return (
        <Page pageTitle="Search">
            <div className="flex items-center justify-end mb-3 gap-2">
                {activeDefaultViewName && (
                    <span className="inline-flex items-center gap-1 [border:1px_solid_var(--border)] rounded-full px-2 py-[1px] text-[10px] font-bold text-[var(--text-muted)]">
                        Default: {activeDefaultViewName}
                        <button
                            aria-label="Clear default view for this session"
                            className="cursor-pointer hover:text-[var(--text)] bg-transparent border-0 p-0 m-0 leading-none"
                            onClick={clearFilters}
                        >
                            ×
                        </button>
                    </span>
                )}
                <ViewsDropdown
                    scope="global"
                    currentFilters={activeFilters}
                    isFiltered={isFiltered}
                    onApply={(f) => applySavedViewFilters(f)}
                    onClear={clearFilters}
                />
            </div>

            <div className="mb-5 bg-[var(--white)] rounded-2xl [border:1.5px_solid_var(--border)] shadow-[var(--shadow-sm)] overflow-hidden">
                <div className="px-4 pb-4 pt-4">
                    <div className="flex flex-wrap gap-3 items-end">
                        <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Search</label>
                            <input
                                type="text"
                                className="opensid-input"
                                placeholder="Description, notes or category…"
                                value={keyword}
                                onChange={(e) => setKeyword(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">From</label>
                            <input type="date" className="opensid-input" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">To</label>
                            <input type="date" className="opensid-input" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Category</label>
                            <select className="opensid-input" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                                <option value="">All</option>
                                {categories.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Type</label>
                            <select
                                className="opensid-input"
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value as 'income' | 'expense' | '')}
                            >
                                <option value="">All</option>
                                <option value="income">Income</option>
                                <option value="expense">Expense</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Amount</label>
                            <div className="flex items-center gap-1">
                                <input type="number" className="opensid-input w-24" placeholder="Min" min="0" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} />
                                <span className="text-[var(--text-muted)] text-sm">–</span>
                                <input type="number" className="opensid-input w-24" placeholder="Max" min="0" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} />
                            </div>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Attachment</label>
                            <select
                                className="opensid-input"
                                value={filterHasAttachment}
                                onChange={(e) => setFilterHasAttachment(e.target.value as 'yes' | 'no' | '')}
                            >
                                <option value="">Any</option>
                                <option value="yes">Has attachment</option>
                                <option value="no">No attachment</option>
                            </select>
                        </div>
                        <label className="flex items-center gap-2 self-end pb-[6px] text-xs font-body text-[var(--text)] cursor-pointer">
                            <input
                                type="checkbox"
                                checked={filterRecurringOnly}
                                onChange={(e) => setFilterRecurringOnly(e.target.checked)}
                                className="w-4 h-4 cursor-pointer accent-[var(--teak)]"
                            />
                            Recurring only
                        </label>
                        {isFiltered && (
                            <button className="opensid-btn opensid-btn-ghost opensid-btn-sm self-end" onClick={clearFilters}>
                                Clear filters
                            </button>
                        )}
                    </div>
                    {allTags.length > 0 && (
                        <div className="pt-3 [border-top:1px_solid_var(--border)]">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Tags</label>
                                {filterTagIds.length >= 2 && (
                                    <div className="flex items-center gap-1 text-xs font-body text-[var(--text-secondary)]">
                                        <span>Match:</span>
                                        {(['any', 'all'] as const).map((m) => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => setFilterTagMode(m)}
                                                className={`px-2 py-0.5 rounded-full text-xs font-bold border-none cursor-pointer ${filterTagMode === m ? 'bg-[var(--teak)] text-white' : 'bg-[var(--cream)] text-[var(--text-secondary)]'}`}
                                            >
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {allTags.map((tag) => {
                                    const active = filterTagIds.includes(tag.id);
                                    return (
                                        <button
                                            key={tag.id}
                                            type="button"
                                            onClick={() => setFilterTagIds((prev) =>
                                                prev.includes(tag.id) ? prev.filter((id) => id !== tag.id) : [...prev, tag.id],
                                            )}
                                            className={`px-2 py-[2px] rounded-full text-[11px] font-bold [border:1.5px_solid_var(--border)] cursor-pointer transition-all ${active ? 'bg-[var(--teak)] text-white border-[var(--teak)]' : 'bg-[var(--cream)] text-[var(--text-secondary)]'}`}
                                            style={active || !tag.colour ? undefined : { borderColor: tag.colour + '55', color: tag.colour, background: tag.colour + '22' }}
                                        >
                                            {tag.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {!isFiltered && (
                <div className="text-center py-[60px] text-[var(--text-muted)] text-sm">
                    Enter search criteria to find transactions across all accounts.
                </div>
            )}

            {isFiltered && isLoading && (
                <p className="text-sm text-[var(--text-muted)]">Searching…</p>
            )}

            {isFiltered && !isLoading && results.length === 0 && (
                <div className="text-center py-[60px] text-[var(--text-muted)] text-sm">No matches.</div>
            )}

            {isFiltered && !isLoading && grouped.length > 0 && (
                <div className="space-y-5">
                    {grouped.map((g) => (
                        <div key={g.accountId} className="bg-[var(--white)] rounded-2xl [border:1.5px_solid_var(--border)] overflow-hidden shadow-[var(--shadow-sm)]">
                            <div className="px-5 py-[10px] bg-[var(--cream)] [border-bottom:1.5px_solid_var(--border)] flex items-center justify-between">
                                <Link
                                    to={`/accounts/${g.accountId}`}
                                    className="font-display text-sm font-bold text-[var(--teak-dark)] hover:underline"
                                >
                                    {g.name}
                                </Link>
                                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">
                                    {g.rows.length} {g.rows.length === 1 ? 'match' : 'matches'}
                                </span>
                            </div>
                            {g.rows.map((t, idx) => (
                                <Link
                                    key={t.id}
                                    to={`/accounts/${g.accountId}?expand=${t.id}`}
                                    className="block px-5 py-3 hover:bg-[var(--cream)] transition-colors"
                                    style={{ borderBottom: idx === g.rows.length - 1 ? 'none' : '1px solid var(--cream-mid)' }}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="text-xs text-[var(--text-muted)] font-body w-[90px] shrink-0">
                                            {formatDate(t.date)}
                                        </div>
                                        <div className="text-xs text-[var(--text-muted)] font-body w-[110px] shrink-0 truncate">
                                            {t.category ?? '—'}
                                        </div>
                                        <div className="flex-1 text-sm font-body text-[var(--text)] truncate">
                                            {t.description}
                                        </div>
                                        <div
                                            className="text-sm font-display font-bold tabular-nums shrink-0"
                                            style={{ color: balanceColor(t.amount_cents) }}
                                        >
                                            {formatCents(t.amount_cents)}
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </Page>
    );
}
