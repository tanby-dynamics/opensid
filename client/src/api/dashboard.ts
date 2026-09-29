import axios from 'axios';
import type { DashboardTransactionsTile } from '../types/dashboard';

export async function getDashboard(): Promise<DashboardTransactionsTile[]> {
    const res = await axios.get<{ tiles: DashboardTransactionsTile[] }>('/api/dashboard');
    return res.data.tiles;
}
