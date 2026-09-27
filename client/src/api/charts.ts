import axios from 'axios';

export interface BalancePoint {
    date: string;
    balance_cents: number;
}

export interface CategoryTotal {
    category: string;
    total_cents: number;
}

export async function getBalanceChart(accountId: number, window: string, savedViewId?: number | null): Promise<BalancePoint[]> {
    const { data } = await axios.get<BalancePoint[]>(`/api/accounts/${accountId}/chart/balance`, {
        params: { window, saved_view_id: savedViewId ?? undefined },
    });
    return data;
}

export async function getCategoryChart(accountId: number, window: string, savedViewId?: number | null): Promise<CategoryTotal[]> {
    const { data } = await axios.get<CategoryTotal[]>(`/api/accounts/${accountId}/chart/categories`, {
        params: { window, saved_view_id: savedViewId ?? undefined },
    });
    return data;
}

export interface IncomeVsExpenseDataPoint {
    month: string;
    income_cents: number;
    expense_cents: number;
}

export async function getIncomeVsExpenseChart(accountId: number, window: string, savedViewId?: number | null): Promise<IncomeVsExpenseDataPoint[]> {
    const { data } = await axios.get<IncomeVsExpenseDataPoint[]>(`/api/accounts/${accountId}/chart/income-vs-expense`, {
        params: { window, saved_view_id: savedViewId ?? undefined },
    });
    return data;
}
