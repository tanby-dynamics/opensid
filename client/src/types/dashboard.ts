export interface DashboardTransaction {
    id: number;
    description: string;
    amount_cents: number;
    type: 'income' | 'expense';
    date: string;
}

export interface DashboardTransactionsTile {
    tile_id: number;
    account_id: number;
    name: string;
    balance_cents: number;
    recent_transactions: DashboardTransaction[];
}
