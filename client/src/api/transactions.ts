import axios from 'axios';
import type { Transaction } from '../types/transaction';

function base(accountId: number): string {
    return `/api/accounts/${accountId}/transactions`;
}

export interface TransactionFilters {
    keyword?: string;
    from?: string;
    to?: string;
    category?: string;
    type?: 'income' | 'expense' | '';
    amountMin?: string;
    amountMax?: string;
    hasAttachment?: 'yes' | 'no' | '';
    recurringOnly?: boolean;
    tagIds?: number[];
    tagMode?: 'any' | 'all';
    cleared?: 'yes' | 'no' | '';
}

function toQueryParams(filters?: TransactionFilters): Record<string, string> {
    const params: Record<string, string> = {};
    if (!filters) return params;
    if (filters.keyword) params.keyword = filters.keyword;
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    if (filters.category) params.category = filters.category;
    if (filters.type) params.type = filters.type;
    if (filters.amountMin) params.amountMin = filters.amountMin;
    if (filters.amountMax) params.amountMax = filters.amountMax;
    if (filters.hasAttachment === 'yes') params.hasAttachment = 'true';
    else if (filters.hasAttachment === 'no') params.hasAttachment = 'false';
    if (filters.recurringOnly) params.recurringOnly = 'true';
    if (filters.tagIds && filters.tagIds.length > 0) params.tagIds = filters.tagIds.join(',');
    if (filters.tagMode) params.tagMode = filters.tagMode;
    if (filters.cleared === 'yes') params.cleared = 'yes';
    else if (filters.cleared === 'no') params.cleared = 'no';
    return params;
}

export async function listTransactions(
    accountId: number,
    filters?: TransactionFilters,
): Promise<Transaction[]> {
    const { data } = await axios.get<Transaction[]>(base(accountId), { params: toQueryParams(filters) });
    return data;
}

export interface TransactionWithAccount extends Transaction {
    account_name: string;
}

export async function searchAllTransactions(
    filters?: TransactionFilters,
): Promise<TransactionWithAccount[]> {
    const { data } = await axios.get<TransactionWithAccount[]>('/api/transactions/search', {
        params: toQueryParams(filters),
    });
    return data;
}

export async function getTransaction(accountId: number, id: number): Promise<Transaction> {
    const { data } = await axios.get<Transaction>(`${base(accountId)}/${id}`);
    return data;
}

export interface SplitRowPayload {
    amount: number;
    category: string;
    notes?: string | null;
    tag_ids?: number[];
}

export interface TransactionPayload {
    category: string;
    description?: string;
    amount: number;
    type: 'income' | 'expense';
    date: string;
    notes?: string | null;
    account_id?: number;
    recurrence?: string | null;
    recurrence_end_date?: string | null;
    tag_ids?: number[];
    splits?: SplitRowPayload[];
}

export async function createTransaction(
    accountId: number,
    payload: TransactionPayload,
): Promise<Transaction> {
    const { data } = await axios.post<Transaction>(base(accountId), payload);
    return data;
}

export async function updateTransaction(
    accountId: number,
    id: number,
    payload: Partial<TransactionPayload> & { scope?: 'one' | 'future' },
): Promise<Transaction> {
    const { data } = await axios.put<Transaction>(`${base(accountId)}/${id}`, payload);
    return data;
}

export async function getSplitChildren(accountId: number, id: number): Promise<Transaction[]> {
    const { data } = await axios.get<{ children: Transaction[] }>(`${base(accountId)}/${id}/split`);
    return data.children;
}

export async function unsplitTransaction(accountId: number, id: number): Promise<Transaction> {
    const { data } = await axios.delete<Transaction>(`${base(accountId)}/${id}/split`);
    return data;
}

export async function clearTransaction(accountId: number, id: number, cleared: boolean): Promise<Transaction> {
    const { data } = await axios.put<Transaction>(`${base(accountId)}/${id}/cleared`, { cleared });
    return data;
}

export async function deleteTransaction(
    accountId: number,
    id: number,
    scope?: 'one' | 'future',
): Promise<void> {
    await axios.delete(`${base(accountId)}/${id}`, scope ? { data: { scope } } : undefined);
}

export async function bulkDeleteTransactions(accountId: number, ids: number[]): Promise<void> {
    await axios.delete(`${base(accountId)}/bulk`, { data: { ids } });
}

export async function bulkExportTransactions(accountId: number, ids: number[]): Promise<void> {
    const response = await axios.post(`/api/accounts/${accountId}/export/bulk`, { ids }, { responseType: 'blob' });
    const disposition = response.headers['content-disposition'] as string | undefined;
    const match = disposition?.match(/filename="([^"]+)"/);
    const filename = match?.[1] ?? `export-${new Date().toISOString().slice(0, 10)}.csv`;
    const url = URL.createObjectURL(new Blob([response.data as BlobPart], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export async function importTransactions(
    accountId: number,
    file: File,
    dateFormat?: 'MDY' | 'DMY',
): Promise<{ imported: number }> {
    const form = new FormData();
    form.append('file', file);
    if (dateFormat) form.append('dateFormat', dateFormat);
    const { data } = await axios.post<{ imported: number }>(`${base(accountId)}/import`, form);
    return data;
}

export type PreviewAction = 'import' | 'skip' | 'update_existing';

export interface PreviewRow {
    row_index: number;
    date: string;
    description: string;
    category: string | null;
    amount_cents: number;
    type: 'income' | 'expense' | 'transfer';
    notes: string | null;
    transfer_group_id: string | null;
    suggested_category: string | null;
    suggested_category_confidence: number;
    duplicate_of: number | null;
    duplicate_within_batch: boolean;
    action: PreviewAction;
}

export interface PreviewSummary {
    total: number;
    duplicates: number;
    categorised: number;
}

export interface PreviewPayload {
    rows: PreviewRow[];
    summary: PreviewSummary;
}

export async function previewImport(
    accountId: number,
    file: File,
    dateFormat?: 'MDY' | 'DMY',
): Promise<PreviewPayload> {
    const form = new FormData();
    form.append('file', file);
    if (dateFormat) form.append('dateFormat', dateFormat);
    const { data } = await axios.post<PreviewPayload>(`${base(accountId)}/import/preview`, form);
    return data;
}

export interface CommitResult {
    imported: number;
    skipped: number;
    updated: number;
}

export async function commitImport(accountId: number, rows: PreviewRow[]): Promise<CommitResult> {
    const { data } = await axios.post<CommitResult>(`${base(accountId)}/import/commit`, { rows });
    return data;
}
