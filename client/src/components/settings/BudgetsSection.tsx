import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import axios from 'axios';
import {
    getBudgets,
    createBudget,
    updateBudget,
    deleteBudget,
    type Budget,
    type BudgetPayload,
} from '../../api/budgets';
import { listAccounts } from '../../api/accounts';
import { getCategories } from '../../api/categories';
import ConfirmDialog from '../ConfirmDialog';
import { formatCents } from '../../utils/format';

const inputCls = 'opensid-input';

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

function isDuplicate(err: unknown): boolean {
    return axios.isAxiosError(err) && err.response?.status === 409;
}

interface FormState {
    category: string;
    amount: string;
    period: 'monthly' | 'weekly';
    warning_threshold: string;
    danger_threshold: string;
}

const defaultForm: FormState = {
    category: '',
    amount: '',
    period: 'monthly',
    warning_threshold: '80',
    danger_threshold: '100',
};

type Modal = { type: 'edit'; budget: Budget } | { type: 'delete'; budget: Budget } | null;

export default function BudgetsSection() {
    const queryClient = useQueryClient();
    const [selectedAccountId, setSelectedAccountId] = useState('');
    const [form, setForm] = useState<FormState>(defaultForm);
    const [formError, setFormError] = useState('');
    const [modal, setModal] = useState<Modal>(null);
    const [editForm, setEditForm] = useState<FormState>(defaultForm);
    const [editError, setEditError] = useState('');

    const accountId = selectedAccountId ? parseInt(selectedAccountId, 10) : null;

    const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: listAccounts });
    const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: getCategories });
    const { data: budgets = [], isLoading } = useQuery({
        queryKey: ['budgets', accountId],
        queryFn: () => getBudgets(accountId!),
        enabled: accountId !== null,
    });

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['budgets', accountId] });

    const createMutation = useMutation({
        mutationFn: (payload: BudgetPayload) => createBudget(accountId!, payload),
        onSuccess: () => {
            invalidate();
            queryClient.invalidateQueries({ queryKey: ['dashboard-config'] });
            setForm(defaultForm);
            setFormError('');
            toast.success('Budget added.');
        },
        onError: (err) => {
            if (isDuplicate(err)) {
                setFormError('A budget for this category already exists');
            } else {
                toast.error('Failed to add budget.');
            }
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: number; payload: Partial<BudgetPayload> }) =>
            updateBudget(accountId!, id, payload),
        onSuccess: () => {
            invalidate();
            setModal(null);
            setEditError('');
            toast.success('Budget updated.');
        },
        onError: (err) => {
            if (isDuplicate(err)) {
                setEditError('A budget for this category already exists');
            } else {
                toast.error('Failed to update budget.');
            }
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => deleteBudget(accountId!, id),
        onSuccess: () => {
            invalidate();
            setModal(null);
            toast.success('Budget deleted.');
        },
        onError: () => toast.error('Failed to delete budget.'),
    });

    function parseForm(f: FormState): BudgetPayload | string {
        if (!f.category.trim()) return 'Category is required';
        const amount = parseFloat(f.amount);
        if (isNaN(amount) || amount <= 0) return 'Limit must be greater than zero';
        const wt = parseInt(f.warning_threshold, 10);
        const dt = parseInt(f.danger_threshold, 10);
        if (isNaN(wt) || wt < 1 || wt > 99) return 'Warning threshold must be between 1 and 99';
        if (isNaN(dt) || dt <= wt || dt > 200) return 'Danger threshold must be greater than the warning threshold';
        return { category: f.category.trim(), amount, period: f.period, warning_threshold: wt, danger_threshold: dt };
    }

    function handleAdd() {
        const result = parseForm(form);
        if (typeof result === 'string') { setFormError(result); return; }
        setFormError('');
        createMutation.mutate(result);
    }

    function openEdit(budget: Budget) {
        setEditForm({
            category: budget.category,
            amount: (budget.amount_cents / 100).toFixed(2),
            period: budget.period,
            warning_threshold: String(budget.warning_threshold),
            danger_threshold: String(budget.danger_threshold),
        });
        setEditError('');
        setModal({ type: 'edit', budget });
    }

    function handleEditSave() {
        if (modal?.type !== 'edit') return;
        const result = parseForm(editForm);
        if (typeof result === 'string') { setEditError(result); return; }
        setEditError('');
        updateMutation.mutate({ id: modal.budget.id, payload: result });
    }

    function periodLabel(p: 'monthly' | 'weekly') {
        return p === 'monthly' ? 'month' : 'week';
    }

    return (
        <section>
            <div className="flex items-center justify-between mb-6">
                <h2 className="font-display text-[22px] font-bold text-[var(--teak-dark)] m-0">Budgets</h2>
            </div>

            <p className="text-[13px] text-[var(--text-muted)] mb-5">
                Set spending limits per category. Each budget tracks spend for the current period.
            </p>

            <div className="mb-6">
                <select
                    aria-label="Account"
                    className={inputCls}
                    value={selectedAccountId}
                    onChange={(e) => { setSelectedAccountId(e.target.value); setForm(defaultForm); setFormError(''); }}
                >
                    <option value="" disabled>Select account…</option>
                    {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>
            </div>

            {accountId !== null && (
                <>
                    {isLoading && <p className="text-sm text-[var(--text-muted)]">Loading…</p>}

                    {!isLoading && budgets.length > 0 && (
                        <table className="w-full border-collapse mb-6">
                            <thead>
                                <tr className="[border-bottom:1.5px_solid_var(--border)]">
                                    {['Category', 'Limit', 'Period', 'Warn %', 'Danger %', ''].map((h, i) => (
                                        <th key={i} className={`text-left px-3 pt-2 pb-[10px] text-[11px] font-bold tracking-[0.06em] text-[var(--text-muted)] uppercase font-body ${i === 5 ? 'w-[72px]' : ''}`}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {budgets.map((b) => (
                                    <tr key={b.id} className="border-b border-[var(--cream-mid)]">
                                        <td className="p-3 text-sm font-semibold text-[var(--text-primary)] font-body">{b.category}</td>
                                        <td className="p-3 text-sm text-[var(--text-secondary)] font-body">{formatCents(b.amount_cents)}</td>
                                        <td className="p-3 text-sm text-[var(--text-secondary)] font-body capitalize">{b.period}</td>
                                        <td className="p-3 text-sm text-[var(--text-secondary)] font-body">{b.warning_threshold}%</td>
                                        <td className="p-3 text-sm text-[var(--text-secondary)] font-body">{b.danger_threshold}%</td>
                                        <td className="p-3 pl-0">
                                            <div className="flex gap-0.5 justify-end">
                                                <button aria-label={`Edit ${b.category} budget`} className="opensid-icon-btn" onClick={() => openEdit(b)} title="Edit">
                                                    <EditIcon />
                                                </button>
                                                <button aria-label={`Delete ${b.category} budget`} className="opensid-icon-btn danger" onClick={() => setModal({ type: 'delete', budget: b })} title="Delete">
                                                    <TrashIcon />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {!isLoading && budgets.length === 0 && (
                        <p className="text-sm text-[var(--text-muted)] mb-5 italic">No budgets yet for this account.</p>
                    )}

                    <div className="bg-[var(--white)] rounded-2xl [border:1.5px_solid_var(--border)] p-5 shadow-[var(--shadow-sm)]">
                        <h3 className="text-[13px] font-bold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-4">Add budget</h3>
                        <div className="flex flex-wrap gap-3 items-end">
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Category</label>
                                <input
                                    list="budget-categories"
                                    className={`${inputCls} w-44`}
                                    placeholder="e.g. Groceries"
                                    value={form.category}
                                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                                />
                                <datalist id="budget-categories">
                                    {categories.map((c) => <option key={c} value={c} />)}
                                </datalist>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Limit ($)</label>
                                <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    className={`${inputCls} w-28`}
                                    placeholder="500.00"
                                    value={form.amount}
                                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Period</label>
                                <select
                                    className={inputCls}
                                    value={form.period}
                                    onChange={(e) => setForm((f) => ({ ...f, period: e.target.value as 'monthly' | 'weekly' }))}
                                >
                                    <option value="monthly">Monthly</option>
                                    <option value="weekly">Weekly</option>
                                </select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Warn %</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="99"
                                    className={`${inputCls} w-20`}
                                    value={form.warning_threshold}
                                    onChange={(e) => setForm((f) => ({ ...f, warning_threshold: e.target.value }))}
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Danger %</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="200"
                                    className={`${inputCls} w-20`}
                                    value={form.danger_threshold}
                                    onChange={(e) => setForm((f) => ({ ...f, danger_threshold: e.target.value }))}
                                />
                            </div>
                            <button
                                className="opensid-btn opensid-btn-primary opensid-btn-sm self-end"
                                onClick={handleAdd}
                                disabled={createMutation.isPending}
                            >
                                {createMutation.isPending ? 'Adding…' : '+ Add budget'}
                            </button>
                        </div>
                        {formError && (
                            <p className="mt-3 text-[13px] text-[var(--red)]">{formError}</p>
                        )}
                    </div>
                </>
            )}

            {modal?.type === 'edit' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
                    <div className="bg-[var(--white)] rounded-2xl [border:1.5px_solid_var(--border)] shadow-[var(--shadow-md)] p-6 w-full max-w-md mx-4">
                        <h3 className="font-display text-lg font-bold text-[var(--teak-dark)] mb-4">
                            Edit budget — {modal.budget.category}
                        </h3>
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Limit ($)</label>
                                <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    className={inputCls}
                                    value={editForm.amount}
                                    onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Period</label>
                                <select
                                    className={inputCls}
                                    value={editForm.period}
                                    onChange={(e) => setEditForm((f) => ({ ...f, period: e.target.value as 'monthly' | 'weekly' }))}
                                >
                                    <option value="monthly">Monthly</option>
                                    <option value="weekly">Weekly</option>
                                </select>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex flex-col gap-1 flex-1">
                                    <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Warning %</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="99"
                                        className={inputCls}
                                        value={editForm.warning_threshold}
                                        onChange={(e) => setEditForm((f) => ({ ...f, warning_threshold: e.target.value }))}
                                    />
                                </div>
                                <div className="flex flex-col gap-1 flex-1">
                                    <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">Danger %</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="200"
                                        className={inputCls}
                                        value={editForm.danger_threshold}
                                        onChange={(e) => setEditForm((f) => ({ ...f, danger_threshold: e.target.value }))}
                                    />
                                </div>
                            </div>
                        </div>
                        {editError && <p className="mt-3 text-[13px] text-[var(--red)]">{editError}</p>}
                        <div className="flex justify-end gap-2 mt-5">
                            <button className="opensid-btn opensid-btn-ghost opensid-btn-sm" onClick={() => setModal(null)}>Cancel</button>
                            <button className="opensid-btn opensid-btn-primary opensid-btn-sm" onClick={handleEditSave} disabled={updateMutation.isPending}>
                                {updateMutation.isPending ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {modal?.type === 'delete' && (
                <ConfirmDialog
                    message={`Delete the "${modal.budget.category}" budget ($${(modal.budget.amount_cents / 100).toFixed(2)}/${periodLabel(modal.budget.period)})?`}
                    onConfirm={() => deleteMutation.mutate(modal.budget.id)}
                    onCancel={() => setModal(null)}
                />
            )}
        </section>
    );
}
