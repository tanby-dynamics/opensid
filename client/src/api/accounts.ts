import axios from 'axios';
import type { Account, AccountKind, AccountWithBalance } from '../types/account';

const base = '/api/accounts';

export async function listAccounts(): Promise<Account[]> {
    const { data } = await axios.get<Account[]>(base);
    return data;
}

export async function getAccount(id: number): Promise<Account> {
    const { data } = await axios.get<Account>(`${base}/${id}`);
    return data;
}

export async function createAccount(name: string, kind: AccountKind = 'asset', excludeFromNetWorth = false): Promise<Account> {
    const { data } = await axios.post<Account>(base, { name, kind, exclude_from_net_worth: excludeFromNetWorth });
    return data;
}

export async function updateAccount(id: number, name: string, kind: AccountKind = 'asset', excludeFromNetWorth = false): Promise<Account> {
    const { data } = await axios.put<Account>(`${base}/${id}`, { name, kind, exclude_from_net_worth: excludeFromNetWorth });
    return data;
}

export async function deleteAccount(id: number): Promise<void> {
    await axios.delete(`${base}/${id}`);
}

export async function listAccountsWithBalances(): Promise<AccountWithBalance[]> {
    const { data } = await axios.get<AccountWithBalance[]>(`${base}/balances`);
    return data;
}
