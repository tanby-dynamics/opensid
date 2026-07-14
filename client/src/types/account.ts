export type AccountKind = 'asset' | 'liability';

export interface Account {
    id: number;
    name: string;
    created_at: string;
    deleted_at: string | null;
    transaction_count: number;
    kind: AccountKind;
    exclude_from_net_worth: number;
}

export interface AccountWithBalance {
    id: number;
    name: string;
    balance_cents: number;
}
