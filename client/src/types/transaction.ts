export type RecurrenceFrequency = 'daily' | 'weekly' | 'fortnightly' | 'monthly' | 'yearly';

export interface TagRef {
    id: number;
    name: string;
    colour: string | null;
}

export interface Transaction {
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
    recurrence: RecurrenceFrequency | null;
    recurrence_end_date: string | null;
    recurrence_source_id: number | null;
    transfer_group_id: string | null;
    cleared_at: string | null;
    split_parent_id: number | null;
    split_count: number;
    tags: TagRef[];
}
