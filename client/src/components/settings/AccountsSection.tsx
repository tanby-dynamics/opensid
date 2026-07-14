import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import axios from 'axios';
import AccountForm, { type AccountFormValues } from '../AccountForm';
import ConfirmDialog from '../ConfirmDialog';
import { listAccounts, createAccount, updateAccount, deleteAccount } from '../../api/accounts';
import type { Account } from '../../types/account';

type Modal =
    | { type: 'create'; serverError?: string }
    | { type: 'edit'; account: Account; serverError?: string }
    | { type: 'delete'; account: Account }
    | null;

const EditIcon = () => (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
        <path d="M13.586 3.586a2 2 0 112.828 2.828l-9 9A2 2 0 016 16H4a1 1 0 01-1-1v-2a2 2 0 01.586-1.414l9-9z" />
    </svg>
);

const TrashIcon = () => (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
);

function isNameTaken(err: unknown): boolean {
    return axios.isAxiosError(err) && err.response?.status === 409;
}

export default function AccountsSection() {
    const queryClient = useQueryClient();
    const [modal, setModal] = useState<Modal>(null);

    const { data: accounts = [], isLoading } = useQuery({
        queryKey: ['accounts'],
        queryFn: listAccounts,
    });

    const createMutation = useMutation({
        mutationFn: (values: AccountFormValues) => createAccount(values.name, values.kind, values.excludeFromNetWorth),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            setModal(null);
            toast.success('Account created.');
        },
        onError: (err) => {
            if (isNameTaken(err)) {
                setModal((m) => m?.type === 'create' ? { ...m, serverError: 'An account with this name already exists.' } : m);
            } else {
                toast.error('Failed to create account.');
            }
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, values }: { id: number; values: AccountFormValues }) =>
            updateAccount(id, values.name, values.kind, values.excludeFromNetWorth),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            setModal(null);
            toast.success('Account renamed.');
        },
        onError: (err) => {
            if (isNameTaken(err)) {
                setModal((m) => m?.type === 'edit' ? { ...m, serverError: 'An account with this name already exists.' } : m);
            } else {
                toast.error('Failed to rename account.');
            }
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => deleteAccount(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            setModal(null);
            toast.success('Account deleted.');
        },
        onError: () => toast.error('Failed to delete account.'),
    });

    return (
        <section>
            <div className="flex items-center justify-between mb-6">
                <h2 className="font-display text-[22px] font-bold text-[var(--teak-dark)] m-0">
                    Accounts
                </h2>
                <button className="sid-btn sid-btn-primary" onClick={() => setModal({ type: 'create' })}>
                    + New account
                </button>
            </div>

            {isLoading && (
                <p className="text-[var(--text-muted)] text-sm">Loading…</p>
            )}

            {!isLoading && accounts.length === 0 && (
                <div className="text-center py-[60px]">
                    <p className="text-[var(--text-muted)] text-[15px] mb-5">No accounts yet.</p>
                    <button className="sid-btn sid-btn-primary" onClick={() => setModal({ type: 'create' })}>
                        + New account
                    </button>
                </div>
            )}

            {!isLoading && accounts.length > 0 && (
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="[border-bottom:1.5px_solid_var(--border)]">
                            <th className="text-left px-3 pt-2 pb-[10px] text-[11px] font-bold tracking-[0.06em] text-[var(--text-muted)] uppercase font-body">
                                Name
                            </th>
                            <th className="text-left px-3 pt-2 pb-[10px] text-[11px] font-bold tracking-[0.06em] text-[var(--text-muted)] uppercase font-body">
                                Kind
                            </th>
                            <th className="text-right px-3 pt-2 pb-[10px] text-[11px] font-bold tracking-[0.06em] text-[var(--text-muted)] uppercase font-body">
                                Transactions
                            </th>
                            <th className="w-[72px]" />
                        </tr>
                    </thead>
                    <tbody>
                        {accounts.map((account) => (
                            <tr key={account.id} className="border-b border-[var(--cream-mid)]">
                                <td className="p-3 text-sm font-semibold text-[var(--text-primary)] font-body">
                                    {account.name}
                                </td>
                                <td className="p-3 text-sm text-[var(--text-secondary)] font-body capitalize">
                                    {account.kind}
                                </td>
                                <td className="p-3 text-sm text-[var(--text-secondary)] text-right font-body">
                                    {account.transaction_count}
                                </td>
                                <td className="p-3 pl-0">
                                    <div className="flex gap-0.5 justify-end">
                                        <button
                                            aria-label={`Edit ${account.name}`}
                                            className="sid-icon-btn"
                                            onClick={() => setModal({ type: 'edit', account })}
                                            title='Edit account name'
                                        >
                                            <EditIcon />
                                        </button>
                                        <button
                                            aria-label={`Delete ${account.name}`}
                                            className="sid-icon-btn danger"
                                            onClick={() => setModal({ type: 'delete', account })}
                                            title='Delete account'
                                        >
                                            <TrashIcon />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {modal?.type === 'create' && (
                <AccountForm
                    title="New account"
                    serverError={modal.serverError}
                    onSubmit={(values) => createMutation.mutate(values)}
                    onCancel={() => setModal(null)}
                />
            )}
            {modal?.type === 'edit' && (
                <AccountForm
                    title="Rename account"
                    initialName={modal.account.name}
                    initialKind={modal.account.kind}
                    initialExcludeFromNetWorth={modal.account.exclude_from_net_worth === 1}
                    serverError={modal.serverError}
                    onSubmit={(values) => updateMutation.mutate({ id: modal.account.id, values })}
                    onCancel={() => setModal(null)}
                />
            )}
            {modal?.type === 'delete' && (
                <ConfirmDialog
                    message={`Delete "${modal.account.name}"? This will also delete all transactions and attachments.`}
                    onConfirm={() => deleteMutation.mutate(modal.account.id)}
                    onCancel={() => setModal(null)}
                />
            )}
        </section>
    );
}
