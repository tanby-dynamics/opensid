export interface BackupAccount {
    id: number;
    name: string;
    created_at: string;
    deleted_at: string | null;
    kind: 'asset' | 'liability';
    exclude_from_net_worth: number;
}

export interface BackupTransaction {
    id: number;
    account_id: number;
    category: string | null;
    description: string;
    amount_cents: number;
    type: 'income' | 'expense' | 'transfer';
    date: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    recurrence: string | null;
    recurrence_end_date: string | null;
    recurrence_source_id: number | null;
    transfer_group_id: string | null;
    cleared_at: string | null;
}

export interface BackupAttachment {
    id: number;
    transaction_id: number;
    filename: string;
    mime_type: string;
    size_bytes: number;
    data: string; // base64-encoded
    created_at: string;
    deleted_at: string | null;
}

export interface BackupBudget {
    id: number;
    account_id: number;
    category: string;
    amount_cents: number;
    period: 'monthly' | 'weekly';
    warning_threshold: number;
    danger_threshold: number;
    created_at: string;
    deleted_at: string | null;
}

export interface BackupSavedView {
    id: number;
    scope: 'account' | 'global';
    account_id: number | null;
    name: string;
    filters: string; // JSON-encoded
    is_default: number;
    position: number;
    created_at: string;
    deleted_at: string | null;
}

export interface BackupTag {
    id: number;
    name: string;
    colour: string | null;
    created_at: string;
    deleted_at: string | null;
}

export interface BackupTransactionTag {
    transaction_id: number;
    tag_id: number;
}

export interface BackupRule {
    id: number;
    name: string;
    priority: number;
    enabled: number;
    account_id: number | null;
    match_type: 'substring' | 'regex';
    description_pattern: string | null;
    amount_min_cents: number | null;
    amount_max_cents: number | null;
    tx_type: 'income' | 'expense' | 'transfer' | null;
    set_category: string | null;
    add_tag_ids: string | null;
    notes_prefix: string | null;
    last_run_at: string | null;
    last_match_count: number;
    created_at: string;
    deleted_at: string | null;
}

export interface BackupReconciliation {
    id: number;
    account_id: number;
    statement_date: string;
    statement_balance_cents: number;
    completed_at: string;
    notes: string | null;
}

export interface BackupPayload {
    version: number;
    exported_at: string;
    accounts: BackupAccount[];
    transactions: BackupTransaction[];
    attachments: BackupAttachment[];
    budgets: BackupBudget[];
    saved_views?: BackupSavedView[];
    tags?: BackupTag[];
    transaction_tags?: BackupTransactionTag[];
    reconciliations?: BackupReconciliation[];
    rules?: BackupRule[];
}

export interface ImportResult {
    accounts: number;
    transactions: number;
    attachments: number;
    budgets: number;
    saved_views: number;
    tags: number;
    rules: number;
}
