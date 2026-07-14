import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import AccountTile from '../components/AccountTile';
import BalanceChartTile from '../components/BalanceChartTile';
import CategoryChartTile from '../components/CategoryChartTile';
import IncomeVsExpenseChartTile from '../components/IncomeVsExpenseChartTile';
import BudgetProgressTile from '../components/BudgetProgressTile';
import NetWorthTile from '../components/NetWorthTile';
import NetWorthChartTile from '../components/NetWorthChartTile';
import AccountForm, { type AccountFormValues } from '../components/AccountForm';
import SkeletonCard from '../components/SkeletonCard';
import TransactionForm from '../components/TransactionForm';
import TransferForm from '../components/TransferForm';
import { getDashboard } from '../api/dashboard';
import { getDashboardConfig } from '../api/dashboardConfig';
import { createAccount, listAccountsWithBalances } from '../api/accounts';
import { createTransaction, type TransactionPayload } from '../api/transactions';
import { createTransfer, type TransferPayload } from '../api/transfers';
import { uploadAttachments } from '../api/attachments';
import { Page } from '../components/Page';
import PageLink from '../components/PageLink';
import type { DashboardAccount } from '../types/dashboard';

type Modal =
    | { type: 'create' }
    | { type: 'add-transaction'; account: DashboardAccount }
    | { type: 'add-transaction-global' }
    | { type: 'add-transfer' }
    | null;

export default function Dashboard() {
    const queryClient = useQueryClient();
    const [modal, setModal] = useState<Modal>(null);
    const [lastGlobalAccountId, setLastGlobalAccountId] = useState<number | undefined>(undefined);
    const [addTransactionFormKey, setAddTransactionFormKey] = useState(0);
    const [addTransactionGlobalFormKey, setAddTransactionGlobalFormKey] = useState(0);

    const { data: tileConfig = [], isLoading: configLoading } = useQuery({
        queryKey: ['dashboard-config'],
        queryFn: getDashboardConfig,
    });

    const { data: dashboardAccounts = [] } = useQuery({
        queryKey: ['dashboard'],
        queryFn: getDashboard,
    });

    const { data: allAccountsWithBalances = [] } = useQuery({
        queryKey: ['accounts-balances'],
        queryFn: listAccountsWithBalances,
    });

    const accountMap = new Map(dashboardAccounts.map((a) => [a.id, a]));

    const createMutation = useMutation({
        mutationFn: (values: AccountFormValues) => createAccount(values.name, values.kind, values.excludeFromNetWorth),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['accounts-balances'] });
            setModal(null);
            toast.success('Account created.');
        },
        onError: () => toast.error('Failed to create account.'),
    });

    const addTransactionMutation = useMutation({
        mutationFn: ({ accountId, data }: { accountId: number; data: TransactionPayload }) =>
            createTransaction(accountId, data),
        onError: () => toast.error('Failed to add transaction.'),
    });

    const addTransferMutation = useMutation({
        mutationFn: (payload: TransferPayload) => createTransfer(payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['accounts-balances'] });
            setModal(null);
            toast.success('Transfer created.');
        },
        onError: () => toast.error('Failed to create transfer.'),
    });

    async function handleAddTransaction(data: TransactionPayload, pendingFiles: File[], addAnother: boolean) {
        if (modal?.type !== 'add-transaction') return;
        const tx = await addTransactionMutation.mutateAsync({ accountId: modal.account.id, data });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['accounts-balances'] });
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
            setAddTransactionFormKey((k) => k + 1);
        } else {
            setModal(null);
        }
        toast.success('Transaction added.');
    }

    async function handleAddTransactionGlobal(data: Parameters<typeof handleAddTransaction>[0] & { account_id?: number }, pendingFiles: File[], addAnother: boolean) {
        if (modal?.type !== 'add-transaction-global' || !data.account_id) return;
        const accountId = data.account_id;
        const tx = await addTransactionMutation.mutateAsync({ accountId, data });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['accounts-balances'] });
        if (pendingFiles.length > 0) {
            try {
                await uploadAttachments(tx.id, pendingFiles);
            } catch {
                setLastGlobalAccountId(accountId);
                setModal(null);
                toast.warning('Transaction saved, but some attachments failed to upload.');
                return;
            }
        }
        setLastGlobalAccountId(accountId);
        if (addAnother) {
            setAddTransactionGlobalFormKey((k) => k + 1);
        } else {
            setModal(null);
        }
        toast.success('Transaction added.');
    }

    const noAccountsInSystem = !configLoading && allAccountsWithBalances.length === 0;
    const tilesExistButNoneConfigured = !configLoading && allAccountsWithBalances.length > 0 && tileConfig.length === 0;

    return (
        <Page pageTitle="Dashboard">
            {configLoading && (
                <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(310px,1fr))] gap-5">
                    {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
                </div>
            )}

            {noAccountsInSystem && (
                <div className="text-center py-[80px]">
                    <p className="text-[var(--text-muted)] text-[15px] mb-5">
                        No accounts yet. Get started by adding one.
                    </p>
                    <button className="sid-btn sid-btn-primary" onClick={() => setModal({ type: 'create' })}>
                        Create your first account
                    </button>
                </div>
            )}

            {tilesExistButNoneConfigured && (
                <div className="text-center py-[80px]">
                    <p className="text-[var(--text-muted)] text-[15px] mb-5">
                        No tiles are configured for the dashboard.
                    </p>
                    <Link to="/settings?section=dashboard" className="sid-btn sid-btn-primary">
                        Configure dashboard
                    </Link>
                </div>
            )}

            {!configLoading && tileConfig.length > 0 && (
                <>
                    <div className="flex justify-between items-center mb-2">
                        <PageLink to="/accounts">All accounts → </PageLink>
                        <div className="flex gap-2">
                            <button className="sid-btn sid-btn-ghost sid-btn-sm" onClick={() => setModal({ type: 'add-transfer' })}>
                                ↔ New transfer
                            </button>
                            <button className="sid-btn sid-btn-primary sid-btn-sm" onClick={() => setModal({ type: 'add-transaction-global' })}>
                                New transaction
                            </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(310px,1fr))] gap-5">
                        {tileConfig.map((tile) => {
                            if (tile.tile_type === 'net_worth') {
                                return <NetWorthTile key={tile.id} />;
                            }
                            if (tile.tile_type === 'net_worth_chart') {
                                return <NetWorthChartTile key={tile.id} window={tile.time_window ?? '30d'} />;
                            }
                            if (tile.account_id === null) return null;

                            if (tile.tile_type === 'transactions') {
                                const account = accountMap.get(tile.account_id);
                                if (!account) return null;
                                return (
                                    <AccountTile
                                        key={tile.id}
                                        account={account}
                                        showBalance={tile.show_balance}
                                        onAddTransaction={(a) => setModal({ type: 'add-transaction', account: a })}
                                    />
                                );
                            }
                            if (tile.tile_type === 'balance_over_time') {
                                const account = allAccountsWithBalances.find((a) => a.id === tile.account_id);
                                return (
                                    <BalanceChartTile
                                        key={tile.id}
                                        accountId={tile.account_id}
                                        accountName={account?.name ?? `Account ${tile.account_id}`}
                                        window={tile.time_window ?? '30d'}
                                        showBalance={tile.show_balance}
                                        balanceCents={tile.balance_cents}
                                    />
                                );
                            }
                            if (tile.tile_type === 'totals_by_category') {
                                const account = allAccountsWithBalances.find((a) => a.id === tile.account_id);
                                return (
                                    <CategoryChartTile
                                        key={tile.id}
                                        accountId={tile.account_id}
                                        accountName={account?.name ?? `Account ${tile.account_id}`}
                                        window={tile.time_window ?? '30d'}
                                    />
                                );
                            }
                            if (tile.tile_type === 'budget_progress') {
                                const account = allAccountsWithBalances.find((a) => a.id === tile.account_id);
                                return (
                                    <BudgetProgressTile
                                        key={tile.id}
                                        accountId={tile.account_id}
                                        accountName={account?.name ?? `Account ${tile.account_id}`}
                                    />
                                );
                            }
                            if (tile.tile_type === 'income_vs_expense') {
                                const account = allAccountsWithBalances.find((a) => a.id === tile.account_id);
                                return (
                                    <IncomeVsExpenseChartTile
                                        key={tile.id}
                                        accountId={tile.account_id}
                                        accountName={account?.name ?? `Account ${tile.account_id}`}
                                        window={tile.time_window ?? '3m'}
                                    />
                                );
                            }
                            return null;
                        })}
                    </div>
                </>
            )}

            {modal?.type === 'create' && (
                <AccountForm
                    title="New account"
                    onSubmit={(values) => createMutation.mutate(values)}
                    onCancel={() => setModal(null)}
                />
            )}
            {modal?.type === 'add-transaction' && (
                <TransactionForm
                    key={addTransactionFormKey}
                    onSubmit={handleAddTransaction}
                    onCancel={() => setModal(null)}
                />
            )}
            {modal?.type === 'add-transaction-global' && (
                <TransactionForm
                    key={addTransactionGlobalFormKey}
                    accounts={allAccountsWithBalances}
                    initialAccountId={lastGlobalAccountId}
                    onSubmit={handleAddTransactionGlobal}
                    onCancel={() => setModal(null)}
                />
            )}
            {modal?.type === 'add-transfer' && (
                <TransferForm
                    accounts={allAccountsWithBalances}
                    onSubmit={(payload) => addTransferMutation.mutate(payload)}
                    onCancel={() => setModal(null)}
                />
            )}
        </Page>
    );
}
