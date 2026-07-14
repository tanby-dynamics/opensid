import axios from 'axios';

export interface NetWorthAccount {
    id: number;
    name: string;
    kind: 'asset' | 'liability';
    balance_cents: number;
}

export interface NetWorth {
    as_of: string;
    total_cents: number;
    assets_cents: number;
    liabilities_cents: number;
    accounts: NetWorthAccount[];
}

export interface NetWorthPoint {
    date: string;
    total_cents: number;
}

export async function getNetWorth(): Promise<NetWorth> {
    const { data } = await axios.get<NetWorth>('/api/net-worth');
    return data;
}

export async function getNetWorthHistory(window: string): Promise<NetWorthPoint[]> {
    const { data } = await axios.get<NetWorthPoint[]>('/api/net-worth/history', { params: { window } });
    return data;
}
