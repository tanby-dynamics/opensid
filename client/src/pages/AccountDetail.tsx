import { useState, useRef, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useParams, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getAccount, listAccountsWithBalances } from '../api/accounts';
import {
    listTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    clearTransaction,
    bulkDeleteTransactions,
    bulkExportTransactions,
    importTransactions,
    previewImport,
    commitImport,
    unsplitTransaction,
    type TransactionPayload,
    type TransactionFilters,
    type PreviewPayload,
    type PreviewRow,
} from '../api/transactions';
import { getLastReconciliation, createReconciliation, type Reconciliation } from '../api/reconciliations';
import ReconcileSetupDialog from '../components/ReconcileSetupDialog';
import ReconcileBar from '../components/ReconcileBar';
import { createTransfer, updateTransfer, deleteTransfer, getTransfer, type TransferPayload, type TransferPair } from '../api/transfers';
import { getCategories } from '../api/categories';
import { listTags, bulkTag } from '../api/tags';
import { downloadImportTemplate } from '../utils/importTemplate';
import { uploadAttachments } from '../api/attachments';
import TransactionRow from '../components/TransactionRow';
import BulkActionBar from '../components/BulkActionBar';
import ViewsDropdown from '../components/ViewsDropdown';
import { listSavedViews, sanitiseSavedFilters } from '../api/savedViews';
import TransactionForm from '../components/TransactionForm';
import TransferForm from '../components/TransferForm';
import ConfirmDialog from '../components/ConfirmDialog';
import RecurrenceScopeDialog from '../components/RecurrenceScopeDialog';
import DateFormatPickerDialog from '../components/DateFormatPickerDialog';
import ImportPreviewDialog from '../components/ImportPreviewDialog';
import type { Transaction } from '../types/transaction';
import { formatCents } from '../utils/format';
import { Page } from '../components/Page';
import PageLink from '../components/PageLink';

type Modal =
    | { type: 'create' }
    | { type: 'add-transfer' }
    | { type: 'edit-scope'; transaction: Transaction }
    | { type: 'edit'; transaction: Transaction; scope?: 'one' | 'future' }
    | { type: 'edit-transfer'; transaction: Transaction }
    | { type: 'delete-scope'; transaction: Transaction }
    | { type: 'delete'; transaction: Transaction }
    | { type: 'delete-transfer'; transaction: Transaction }
    | { type: 'bulk-delete' }
    | { type: 'date-format-picker'; file: File; mode: 'quick' | 'smart' }
    | { type: 'import-errors'; errors: { row: number; error: string }[] }
    | { type: 'smart-import-preview'; preview: PreviewPayload }
    | { type: 'reconcile-setup' }
    | null;

interface AccountDetailLocationState {
    from?: 'all-accounts';
}

function ActionsDropdown({
    onDownloadTemplate,
    onImportCsv,
    onSmartImportCsv,
    onExportCsv,
    isImporting,
}: {
    onDownloadTemplate: () => void;
    onImportCsv: () => void;
    onSmartImportCsv: () => void;
    onExportCsv: () => void;
    isImporting: boolean;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    function pick(fn: () => void) {
        setOpen(false);
        fn();
    }

    return (
        <div ref={ref} className="relative">
            <button
                className="sid-btn sid-btn-ghost sid-btn-sm"
                onClick={() => setOpen((o) => !o)}
                disabled={isImporting}
            >
                {isImporting ? 'Importing…' : 'Actions ▾'}
            </button>
            {open && (
                <div className="absolute right-0 z-10 mt-1 min-w-[170px] rounded-xl bg-[var(--white)] [border:1.5px_solid_var(--border)] shadow-[var(--shadow-md)] py-1">
                    <button
                        className="w-full text-left px-4 py-2 text-sm font-body text-[var(--text)] hover:bg-[var(--cream)] transition-colors"
                        onClick={() => pick(onDownloadTemplate)}
                    >
                        Download template
                    </button>
                    <button
                        className="w-full text-left px-4 py-2 text-sm font-body text-[var(--text)] hover:bg-[var(--cream)] transition-colors"
                        onClick={() => pick(onImportCsv)}
                    >
                        Import CSV
                    </button>
                    <button
                        className="w-full text-left px-4 py-2 text-sm font-body text-[var(--text)] hover:bg-[var(--cream)] transition-colors"
                        onClick={() => pick(onSmartImportCsv)}
                    >
                        Smart import…
                    </button>
                    <button
                        className="w-full text-left px-4 py-2 text-sm font-body text-[var(--text)] hover:bg-[var(--cream)] transition-colors"
                        onClick={() => pick(onExportCsv)}
                    >
                        Export CSV
                    </button>
                </div>
            )}
        </div>
    );
}

const TX_GRID = '32px 28px 130px 120px 1fr 90px 120px 72px';

export default function AccountDetail() {
    const { id } = useParams<{ id: string }>();
    const accountId = parseInt(id!, 10);
    const location = useLocation();
    const locationState = location.state as AccountDetailLocationState | null;
    const fromAllAccounts = locationState?.from === 'all-accounts';
    const queryClient = useQueryClient();
    const [modal, setModal] = useState<Modal>(null);
    const [editingTransferPair, setEditingTransferPair] = useState<TransferPair | null>(null);
    const [createFormKey, setCreateFormKey] = useState(0);
    const [isImporting, setIsImporting] = useState(false);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [isCommitting, setIsCommitting] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const importInputRef = useRef<HTMLInputElement>(null);
    const smartImportInputRef = useRef<HTMLInputElement>(null);

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
    const [filterCleared, setFilterCleared] = useState<'yes' | 'no' | ''>('');
    const [activeDefaultViewName, setActiveDefaultViewName] = useState<string | null>(null);
    const defaultAppliedRef = useRef(false);
    const [reconcileSetup, setReconcileSetup] = useState<{ statementDate: string; statementBalanceCents: number } | null>(null);
    const [isFinishingReconcile, setIsFinishingReconcile] = useState(false);

    const expandTxId = (() => {
        const v = new URLSearchParams(location.search).get('expand');
        const n = v ? parseInt(v, 10) : NaN;
        return Number.isFinite(n) ? n : null;
    })();

    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const selectAllRef = useRef<HTMLInputElement>(null);

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
        cleared: filterCleared || undefined,
    };
    const effectiveFilters: TransactionFilters = reconcileSetup
        ? { ...activeFilters, to: reconcileSetup.statementDate }
        : activeFilters;
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
        setFilterCleared('');
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
        setFilterCleared(filters.cleared ?? '');
        setActiveDefaultViewName(defaultName);
    }

    const { data: account, isLoading: accountLoading } = useQuery({
        queryKey: ['accounts', accountId],
        queryFn: () => getAccount(accountId),
    });

    const { data: allAccounts = [] } = useQuery({
        queryKey: ['accounts-balances'],
        queryFn: listAccountsWithBalances,
    });

    const { data: savedViewsForAccount } = useQuery({
        queryKey: ['saved-views', 'account', accountId],
        queryFn: () => listSavedViews({ scope: 'account', accountId }),
    });

    // Apply the default saved view once, on first load — but only if the user hasn't
    // already set filters (e.g. by arriving with ?expand=… or pressing back).
    useEffect(() => {
        if (defaultAppliedRef.current) return;
        if (!savedViewsForAccount) return;
        const def = savedViewsForAccount.find((v) => v.is_default);
        defaultAppliedRef.current = true;
        if (!def) return;
        if (keyword || filterFrom || filterTo || filterCategory || filterType || amountMin || amountMax || filterHasAttachment || filterRecurringOnly || filterTagIds.length > 0) return;
        // One-shot default-view application after the saved views load.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        applySavedViewFilters(sanitiseSavedFilters(def.filters), def.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [savedViewsForAccount]);

    const { data: lastReconciliation = null } = useQuery<Reconciliation | null>({
        queryKey: ['reconciliations-last', accountId],
        queryFn: () => getLastReconciliation(accountId),
    });

    const { data: transactions = [], isLoading: txLoading } = useQuery({
        queryKey: ['transactions', accountId, effectiveFilters],
        queryFn: () => listTransactions(accountId, (isFiltered || reconcileSetup) ? effectiveFilters : undefined),
    });

    const { data: categories = [] } = useQuery({
        queryKey: ['categories'],
        queryFn: getCategories,
    });

    const { data: allTags = [] } = useQuery({
        queryKey: ['tags'],
        queryFn: listTags,
    });

    const balance = transactions.reduce((sum, t) => sum + t.amount_cents, 0);

    // Derive the visible selection from current transactions — stale ids in `selectedIds`
    // (e.g. from filter changes) are simply ignored at read time rather than reconciled in an effect.
    const visibleSelectedIds = useMemo(() => {
        const visible = new Set(transactions.map((t) => t.id));
        return new Set([...selectedIds].filter((id) => visible.has(id)));
    }, [selectedIds, transactions]);

    const allSelected = visibleSelectedIds.size === transactions.length && transactions.length > 0;
    const someSelected = visibleSelectedIds.size > 0 && !allSelected;

    const singleSelectedSplitTx = visibleSelectedIds.size === 1
        ? transactions.find((t) => visibleSelectedIds.has(t.id) && t.split_count > 0)
        : undefined;

    useEffect(() => {
        if (selectAllRef.current) {
            selectAllRef.current.indeterminate = someSelected;
        }
    }, [someSelected]);

    function handleSelectRow(id: number) {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function handleSelectAll() {
        if (allSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(transactions.map((t) => t.id)));
        }
    }

    function handleClearSelection() {
        setSelectedIds(new Set());
    }

    const clearedBalance = transactions.filter((t) => t.cleared_at !== null).reduce((sum, t) => sum + t.amount_cents, 0);

    const clearMutation = useMutation({
        mutationFn: ({ txId, cleared }: { txId: number; cleared: boolean }) =>
            clearTransaction(accountId, txId, cleared),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transactions', accountId] });
        },
        onError: () => toast.error('Failed to update cleared status.'),
    });

    const createMutation = useMutation({
        mutationFn: (data: TransactionPayload) => createTransaction(accountId, data),
        onError: () => toast.error('Failed to add transaction.'),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id: txId, data }: { id: number; data: TransactionPayload & { scope?: 'one' | 'future' } }) =>
            updateTransaction(accountId, txId, data),
        onError: () => toast.error('Failed to update transaction.'),
    });

    const deleteMutation = useMutation({
        mutationFn: ({ txId, scope }: { txId: number; scope?: 'one' | 'future' }) =>
            deleteTransaction(accountId, txId, scope),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transactions', accountId] });
            setModal(null);
            toast.success('Transaction deleted.');
        },
        onError: () => toast.error('Failed to delete transaction.'),
    });

    const bulkDeleteMutation = useMutation({
        mutationFn: (ids: number[]) => bulkDeleteTransactions(accountId, ids),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transactions', accountId] });
            setSelectedIds(new Set());
            setModal(null);
            toast.success('Transactions deleted.');
        },
        onError: () => toast.error('Failed to delete transactions.'),
    });

    const unsplitMutation = useMutation({
        mutationFn: (txId: number) => unsplitTransaction(accountId, txId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transactions', accountId] });
            setSelectedIds(new Set());
            toast.success('Transaction unsplit.');
        },
        onError: () => toast.error('Failed to unsplit transaction.'),
    });

    const createTransferMutation = useMutation({
        mutationFn: (payload: TransferPayload) => createTransfer(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transactions', accountId] });
            queryClient.invalidateQueries({ queryKey: ['accounts-balances'] });
            setModal(null);
            toast.success('Transfer created.');
        },
        onError: () => toast.error('Failed to create transfer.'),
    });

    const updateTransferMutation = useMutation({
        mutationFn: ({ groupId, payload }: { groupId: string; payload: Partial<TransferPayload> }) =>
            updateTransfer(groupId, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transactions', accountId] });
            queryClient.invalidateQueries({ queryKey: ['accounts-balances'] });
            setModal(null);
            toast.success('Transfer updated.');
        },
        onError: () => toast.error('Failed to update transfer.'),
    });

    const deleteTransferMutation = useMutation({
        mutationFn: (groupId: string) => deleteTransfer(groupId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transactions', accountId] });
            queryClient.invalidateQueries({ queryKey: ['accounts-balances'] });
            setModal(null);
            toast.success('Transfer deleted.');
        },
        onError: () => toast.error('Failed to delete transfer.'),
    });

    async function handleFinishReconciliation() {
        if (!reconcileSetup) return;
        setIsFinishingReconcile(true);
        try {
            await createReconciliation(accountId, {
                statement_date: reconcileSetup.statementDate,
                statement_balance_cents: reconcileSetup.statementBalanceCents,
            });
            queryClient.invalidateQueries({ queryKey: ['reconciliations-last', accountId] });
            queryClient.invalidateQueries({ queryKey: ['reconciliations', accountId] });
            setReconcileSetup(null);
            toast.success('Reconciliation complete.');
        } catch {
            toast.error('Failed to save reconciliation.');
        } finally {
            setIsFinishingReconcile(false);
        }
    }

    async function handleBulkTag(add: number[]) {
        try {
            await bulkTag([...visibleSelectedIds], add);
            queryClient.invalidateQueries({ queryKey: ['transactions', accountId] });
            toast.success('Tags applied.');
        } catch {
            toast.error('Failed to apply tags.');
        }
    }

    async function handleCreate(data: TransactionPayload, pendingFiles: File[], addAnother: boolean) {
        const tx = await createMutation.mutateAsync(data);
        queryClient.invalidateQueries({ queryKey: ['transactions', accountId] });
        if (pendingFiles.length > 0) {
            try {
                await uploadAttachments(tx.id, pendingFiles);
            } catch {
                setModal(null);
                toast.warning('Transaction saved, but some attachments failed to upload.');
                return;
            }
        }
        if (addAnother) {
            setCreateFormKey((k) => k + 1);
        } else {
            setModal(null);
        }
        toast.success('Transaction added.');
    }

    async function handleUpdate(txId: number, data: TransactionPayload, pendingFiles: File[], scope?: 'one' | 'future') {
        await updateMutation.mutateAsync({ id: txId, data: { ...data, scope } });
        queryClient.invalidateQueries({ queryKey: ['transactions', accountId] });
        if (pendingFiles.length > 0) {
            try {
                await uploadAttachments(txId, pendingFiles);
                queryClient.invalidateQueries({ queryKey: ['attachments', txId] });
            } catch {
                setModal(null);
                toast.warning('Transaction saved, but some attachments failed to upload.');
                return;
            }
        }
        setModal(null);
        toast.success('Transaction updated.');
    }

    function handleExportCsv() {
        const params = new URLSearchParams();
        if (activeFilters.keyword) params.set('keyword', activeFilters.keyword);
        if (activeFilters.from) params.set('from', activeFilters.from);
        if (activeFilters.to) params.set('to', activeFilters.to);
        if (activeFilters.category) params.set('category', activeFilters.category);
        if (activeFilters.type) params.set('type', activeFilters.type);
        if (activeFilters.amountMin) params.set('amountMin', activeFilters.amountMin);
        if (activeFilters.amountMax) params.set('amountMax', activeFilters.amountMax);
        if (activeFilters.hasAttachment === 'yes') params.set('hasAttachment', 'true');
        else if (activeFilters.hasAttachment === 'no') params.set('hasAttachment', 'false');
        if (activeFilters.recurringOnly) params.set('recurringOnly', 'true');
        const qs = params.toString();
        const a = document.createElement('a');
        a.href = `/api/accounts/${accountId}/export${qs ? `?${qs}` : ''}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    async function handleBulkExport() {
        try {
            await bulkExportTransactions(accountId, [...visibleSelectedIds]);
            setSelectedIds(new Set());
        } catch {
            toast.error('Failed to export transactions.');
        }
    }

    async function runImport(file: File, dateFormat?: 'MDY' | 'DMY') {
        setIsImporting(true);
        try {
            const { imported } = await importTransactions(accountId, file, dateFormat);
            queryClient.invalidateQueries({ queryKey: ['transactions', accountId] });
            toast.success(`${imported} ${imported === 1 ? 'transaction' : 'transactions'} imported.`);
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                const data = err.response?.data as Record<string, unknown> | undefined;
                if (data?.code === 'ambiguous_date_format') {
                    setModal({ type: 'date-format-picker', file, mode: 'quick' });
                    return;
                }
                if (Array.isArray(data?.errors)) {
                    setModal({ type: 'import-errors', errors: data.errors as { row: number; error: string }[] });
                    return;
                }
                toast.error((data?.error as string | undefined) ?? 'Failed to import transactions.');
            } else {
                toast.error('Failed to import transactions.');
            }
        } finally {
            setIsImporting(false);
        }
    }

    async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        await runImport(file);
    }

    async function runSmartImportPreview(file: File, dateFormat?: 'MDY' | 'DMY') {
        setIsPreviewLoading(true);
        try {
            const preview = await previewImport(accountId, file, dateFormat);
            setModal({ type: 'smart-import-preview', preview });
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                const data = err.response?.data as Record<string, unknown> | undefined;
                if (data?.code === 'ambiguous_date_format') {
                    setModal({ type: 'date-format-picker', file, mode: 'smart' });
                    return;
                }
                if (Array.isArray(data?.errors)) {
                    setModal({ type: 'import-errors', errors: data.errors as { row: number; error: string }[] });
                    return;
                }
                toast.error((data?.error as string | undefined) ?? 'Failed to preview import.');
            } else {
                toast.error('Failed to preview import.');
            }
        } finally {
            setIsPreviewLoading(false);
        }
    }

    async function handleSmartImport(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        await runSmartImportPreview(file);
    }

    async function handleCommitPreview(rows: PreviewRow[]) {
        setIsCommitting(true);
        try {
            const { imported, skipped, updated } = await commitImport(accountId, rows);
            queryClient.invalidateQueries({ queryKey: ['transactions', accountId] });
            toast.success(`Imported ${imported} · Skipped ${skipped} · Updated ${updated}.`);
            setModal(null);
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                const data = err.response?.data as Record<string, unknown> | undefined;
                if (Array.isArray(data?.errors)) {
                    const errors = data.errors as { row: number; error: string }[];
                    toast.error(errors[0]?.error ?? 'Failed to commit import.');
                    return;
                }
                toast.error((data?.error as string | undefined) ?? 'Failed to commit import.');
            } else {
                toast.error('Failed to commit import.');
            }
        } finally {
            setIsCommitting(false);
        }
    }

    if (accountLoading) {
        return <div className="p-12 text-[var(--text-muted)] font-body">Loading…</div>;
    }

    if (!account) {
        return <div className="p-12 text-[var(--red)] font-body">Account not found.</div>;
    }

    return (
        <Page 
            pageTitle={account.name} 
            balance={balance} 
        >
            <PageLink to={fromAllAccounts ? '/accounts' : '/dashboard'}>
                &larr; {fromAllAccounts ? 'Back to all accounts' : 'Back to dashboard'}
            </PageLink>

            {/* Cleared chip — shown outside reconcile mode */}
            {!reconcileSetup && transactions.some((t) => t.cleared_at !== null) && (
                <div className="flex items-center gap-2 mb-3 text-sm text-[var(--text-secondary)]">
                    <span className="text-[var(--green)] font-semibold">✓ Cleared: {formatCents(clearedBalance)}</span>
                    <span className="text-[var(--text-muted)]">of {formatCents(balance)}</span>
                </div>
            )}

            {/* Action bar */}
            <div className="flex flex-wrap justify-end gap-2 mb-5 sm:mb-7">
                <input
                    ref={importInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleImport}
                />
                <input
                    ref={smartImportInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleSmartImport}
                />
                <ActionsDropdown
                    onDownloadTemplate={downloadImportTemplate}
                    onImportCsv={() => importInputRef.current?.click()}
                    onSmartImportCsv={() => smartImportInputRef.current?.click()}
                    onExportCsv={handleExportCsv}
                    isImporting={isImporting || isPreviewLoading}
                />
                <button
                    className="sid-btn sid-btn-ghost sid-btn-sm"
                    onClick={() => setModal({ type: 'reconcile-setup' })}
                    disabled={reconcileSetup !== null}
                >
                    ⊘ Reconcile
                </button>
                <button className="sid-btn sid-btn-ghost sid-btn-sm" onClick={() => setModal({ type: 'add-transfer' })}>
                    ↔ New transfer
                </button>
                <button className="sid-btn sid-btn-primary sid-btn-sm" onClick={() => setModal({ type: 'create' })}>
                    + New transaction
                </button>
            </div>

            {/* Filter bar */}
            <div className="mb-5 bg-[var(--white)] rounded-2xl [border:1.5px_solid_var(--border)] shadow-[var(--shadow-sm)] overflow-hidden">
                <div className="flex items-center justify-between gap-2 pr-3">
                    <button
                        className="flex-1 flex items-center justify-between text-left px-4 py-3 hover:bg-[var(--cream)] transition-colors min-w-0"
                        onClick={() => setFiltersOpen((o) => !o)}
                    >
                        <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em] flex items-center gap-2">
                            Filters
                            {isFiltered && (
                                <span className="inline-flex items-center justify-center bg-[var(--teak)] text-white rounded-full w-4 h-4 text-[9px] font-bold">
                                    {Object.values(activeFilters).filter(Boolean).length}
                                </span>
                            )}
                            {activeDefaultViewName && (
                                <span className="inline-flex items-center gap-1 [border:1px_solid_var(--border)] rounded-full px-2 py-[1px] text-[10px] font-bold text-[var(--text-muted)] tracking-normal normal-case">
                                    Default: {activeDefaultViewName}
                                    <span
                                        role="button"
                                        aria-label="Clear default view for this session"
                                        className="cursor-pointer hover:text-[var(--text)]"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            clearFilters();
                                        }}
                                    >
                                        ×
                                    </span>
                                </span>
                            )}
                        </span>
                        <svg
                            width="14" height="14" viewBox="0 0 20 20" fill="currentColor"
                            className={`text-[var(--text-muted)] transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`}
                        >
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                    <ViewsDropdown
                        scope="account"
                        accountId={accountId}
                        currentFilters={activeFilters}
                        isFiltered={isFiltered}
                        onApply={(f) => applySavedViewFilters(f)}
                        onClear={clearFilters}
                    />
                </div>

                {filtersOpen && (
                    <div className="px-4 pb-4 pt-1 [border-top:1px_solid_var(--border)]">
                        <div className="flex flex-wrap gap-3 items-end pt-3">
                            <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
                                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Search</label>
                                <input
                                    type="text"
                                    className="sid-input"
                                    placeholder="Description, notes or category…"
                                    value={keyword}
                                    onChange={(e) => setKeyword(e.target.value)}
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">From</label>
                                <input
                                    type="date"
                                    className="sid-input"
                                    value={filterFrom}
                                    onChange={(e) => setFilterFrom(e.target.value)}
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">To</label>
                                <input
                                    type="date"
                                    className="sid-input"
                                    value={filterTo}
                                    onChange={(e) => setFilterTo(e.target.value)}
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Category</label>
                                <select
                                    className="sid-input"
                                    value={filterCategory}
                                    onChange={(e) => setFilterCategory(e.target.value)}
                                >
                                    <option value="">All</option>
                                    {categories.map((c) => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Type</label>
                                <select
                                    className="sid-input"
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
                                    <input
                                        type="number"
                                        className="sid-input w-24"
                                        placeholder="Min"
                                        min="0"
                                        value={amountMin}
                                        onChange={(e) => setAmountMin(e.target.value)}
                                    />
                                    <span className="text-[var(--text-muted)] text-sm">–</span>
                                    <input
                                        type="number"
                                        className="sid-input w-24"
                                        placeholder="Max"
                                        min="0"
                                        value={amountMax}
                                        onChange={(e) => setAmountMax(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Attachment</label>
                                <select
                                    className="sid-input"
                                    value={filterHasAttachment}
                                    onChange={(e) => setFilterHasAttachment(e.target.value as 'yes' | 'no' | '')}
                                >
                                    <option value="">Any</option>
                                    <option value="yes">Has attachment</option>
                                    <option value="no">No attachment</option>
                                </select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Cleared</label>
                                <select
                                    className="sid-input"
                                    value={filterCleared}
                                    onChange={(e) => setFilterCleared(e.target.value as 'yes' | 'no' | '')}
                                >
                                    <option value="">Any</option>
                                    <option value="yes">Cleared</option>
                                    <option value="no">Not cleared</option>
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
                                <button
                                    className="sid-btn sid-btn-ghost sid-btn-sm self-end"
                                    onClick={clearFilters}
                                >
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
                                                onClick={() => {
                                                    setFilterTagIds((prev) =>
                                                        prev.includes(tag.id) ? prev.filter((id) => id !== tag.id) : [...prev, tag.id],
                                                    );
                                                }}
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
                )}
            </div>

            {reconcileSetup && (
                <ReconcileBar
                    statementDate={reconcileSetup.statementDate}
                    statementBalanceCents={reconcileSetup.statementBalanceCents}
                    transactions={transactions}
                    lastReconciliation={lastReconciliation}
                    onFinish={handleFinishReconciliation}
                    onExit={() => setReconcileSetup(null)}
                    isFinishing={isFinishingReconcile}
                />
            )}

            <BulkActionBar
                selectedCount={visibleSelectedIds.size}
                onDelete={() => setModal({ type: 'bulk-delete' })}
                onExport={handleBulkExport}
                onClear={handleClearSelection}
                availableTags={allTags}
                onBulkTag={handleBulkTag}
                canUnsplit={!!singleSelectedSplitTx}
                onUnsplit={() => singleSelectedSplitTx && unsplitMutation.mutate(singleSelectedSplitTx.id)}
            />

            {txLoading && (
                <p className="text-sm text-[var(--text-muted)]">Loading…</p>
            )}

            {!txLoading && transactions.length === 0 && (
                <div className="text-center py-[60px]">
                    {isFiltered ? (
                        <>
                            <p className="text-[var(--text-muted)] text-sm mb-4">No transactions match your filters.</p>
                            <button className="sid-btn sid-btn-ghost sid-btn-sm" onClick={clearFilters}>
                                Clear filters
                            </button>
                        </>
                    ) : (
                        <>
                            <p className="text-[var(--text-muted)] text-sm mb-4">No transactions yet.</p>
                            <button className="sid-btn sid-btn-primary sid-btn-sm" onClick={() => setModal({ type: 'create' })}>
                                Add first transaction
                            </button>
                        </>
                    )}
                </div>
            )}

            {transactions.length > 0 && (
                <div className="bg-[var(--white)] rounded-2xl [border:1.5px_solid_var(--border)] overflow-hidden shadow-[var(--shadow-sm)]">
                    {/* Table header */}
                    <div
                        className="hidden sm:grid px-5 py-[10px] bg-[var(--cream)] [border-bottom:1.5px_solid_var(--border)]"
                        style={{ gridTemplateColumns: TX_GRID }}
                    >
                        <input
                            ref={selectAllRef}
                            type="checkbox"
                            checked={allSelected}
                            onChange={handleSelectAll}
                            aria-label="Select all transactions"
                            className="w-4 h-4 cursor-pointer accent-[var(--teak)] self-center"
                        />
                        <div />
                        {['Date', 'Category', 'Description', 'Type', 'Amount', ''].map((h, i) => (
                            <div key={i} className={`text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em] ${i === 4 ? 'text-right' : 'text-left'}`}>
                                {h}
                            </div>
                        ))}
                    </div>
                    {/* Rows */}
                    {transactions.map((t, idx) => (
                        <TransactionRow
                            key={t.id}
                            transaction={t}
                            isLast={idx === transactions.length - 1}
                            gridTemplate={TX_GRID}
                            initialExpanded={expandTxId === t.id}
                            onToggleCleared={(txId, cleared) => clearMutation.mutate({ txId, cleared })}
                            reconcileMode={reconcileSetup !== null}
                            onEdit={(tx) => {
                                if (tx.transfer_group_id) {
                                    getTransfer(tx.transfer_group_id).then((pair) => {
                                        setEditingTransferPair(pair);
                                        setModal({ type: 'edit-transfer', transaction: tx });
                                    }).catch(() => toast.error('Failed to load transfer.'));
                                } else if (tx.recurrence || tx.recurrence_source_id) {
                                    setModal({ type: 'edit-scope', transaction: tx });
                                } else {
                                    setModal({ type: 'edit', transaction: tx });
                                }
                            }}
                            onDelete={(tx) => {
                                if (tx.transfer_group_id) {
                                    setModal({ type: 'delete-transfer', transaction: tx });
                                } else if (tx.recurrence || tx.recurrence_source_id) {
                                    setModal({ type: 'delete-scope', transaction: tx });
                                } else {
                                    setModal({ type: 'delete', transaction: tx });
                                }
                            }}
                            isSelected={visibleSelectedIds.has(t.id)}
                            onSelect={handleSelectRow}
                        />
                    ))}
                </div>
            )}

            {modal?.type === 'create' && (
                <TransactionForm
                    key={createFormKey}
                    onSubmit={handleCreate}
                    onCancel={() => setModal(null)}
                />
            )}
            {modal?.type === 'add-transfer' && (
                <TransferForm
                    accounts={allAccounts}
                    onSubmit={(payload) => createTransferMutation.mutate(payload)}
                    onCancel={() => setModal(null)}
                />
            )}
            {modal?.type === 'edit-transfer' && modal.transaction.transfer_group_id && editingTransferPair && (
                <TransferForm
                    accounts={allAccounts}
                    initial={{
                        groupId: modal.transaction.transfer_group_id,
                        source: editingTransferPair.source,
                        destination: editingTransferPair.destination,
                    }}
                    onSubmit={(payload) => updateTransferMutation.mutate({ groupId: modal.transaction.transfer_group_id!, payload })}
                    onCancel={() => { setModal(null); setEditingTransferPair(null); }}
                />
            )}
            {modal?.type === 'delete-transfer' && modal.transaction.transfer_group_id && (
                <ConfirmDialog
                    message="Delete this transfer pair? Both the outgoing and incoming transactions will be deleted."
                    confirmLabel="Delete transfer"
                    onConfirm={() => deleteTransferMutation.mutate(modal.transaction.transfer_group_id!)}
                    onCancel={() => setModal(null)}
                />
            )}
            {modal?.type === 'edit-scope' && (
                <RecurrenceScopeDialog
                    action="edit"
                    onJustThis={() => setModal({ type: 'edit', transaction: modal.transaction, scope: 'one' })}
                    onFuture={() => setModal({ type: 'edit', transaction: modal.transaction, scope: 'future' })}
                    onCancel={() => setModal(null)}
                />
            )}
            {modal?.type === 'edit' && (
                <TransactionForm
                    initial={modal.transaction}
                    onSubmit={(data, files) => handleUpdate(modal.transaction.id, data, files, modal.scope)}
                    onCancel={() => setModal(null)}
                />

            )}
            {modal?.type === 'delete-scope' && (
                <RecurrenceScopeDialog
                    action="delete"
                    onJustThis={() => deleteMutation.mutate({ txId: modal.transaction.id, scope: 'one' })}
                    onFuture={() => deleteMutation.mutate({ txId: modal.transaction.id, scope: 'future' })}
                    onCancel={() => setModal(null)}
                />
            )}
            {modal?.type === 'delete' && (
                <ConfirmDialog
                    message={`Delete "${modal.transaction.description}"? This will also delete any attachments.`}
                    onConfirm={() => deleteMutation.mutate({ txId: modal.transaction.id })}
                    onCancel={() => setModal(null)}
                />
            )}
            {modal?.type === 'bulk-delete' && (
                <ConfirmDialog
                    message={`Delete ${visibleSelectedIds.size} transaction${visibleSelectedIds.size !== 1 ? 's' : ''}? This will also delete any attachments.`}
                    onConfirm={() => bulkDeleteMutation.mutate([...visibleSelectedIds])}
                    onCancel={() => setModal(null)}
                />
            )}
            {modal?.type === 'date-format-picker' && (
                <DateFormatPickerDialog
                    onSelect={(format) => {
                        const { file, mode } = modal;
                        setModal(null);
                        if (mode === 'smart') {
                            runSmartImportPreview(file, format);
                        } else {
                            runImport(file, format);
                        }
                    }}
                    onCancel={() => setModal(null)}
                />
            )}
            {modal?.type === 'smart-import-preview' && (
                <ImportPreviewDialog
                    preview={modal.preview}
                    isCommitting={isCommitting}
                    onCommit={handleCommitPreview}
                    onCancel={() => setModal(null)}
                />
            )}
            {modal?.type === 'reconcile-setup' && (
                <ReconcileSetupDialog
                    onSubmit={(statementDate, statementBalanceCents) => {
                        setReconcileSetup({ statementDate, statementBalanceCents });
                        setModal(null);
                    }}
                    onCancel={() => setModal(null)}
                />
            )}
            {modal?.type === 'import-errors' && (
                <div className="sid-modal-overlay anim-fade" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
                    <div className="sid-modal anim-slide-up">
                        <div className="sid-modal-trim" />
                        <div className="sid-modal-body">
                            <h2 className="font-display text-lg font-bold text-[var(--teak-dark)] mb-3">
                                Import failed
                            </h2>
                            <p className="text-sm text-[var(--text-secondary)] mb-4">
                                The following errors were found. No transactions were imported.
                            </p>
                            <ul className="max-h-64 overflow-y-auto text-xs font-body space-y-1 mb-6 pr-1">
                                {modal.errors.map((e, i) => (
                                    <li key={i} className="text-[var(--red)]">{e.error}</li>
                                ))}
                            </ul>
                            <div className="flex justify-end">
                                <button className="sid-btn sid-btn-ghost" onClick={() => setModal(null)}>Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Page>
    );
}
