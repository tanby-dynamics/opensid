import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    listRules,
    createRule,
    updateRule,
    deleteRule,
    runRules,
    type Rule,
    type RuleInput,
} from '../../api/rules';
import { listAccounts } from '../../api/accounts';
import { listTags } from '../../api/tags';
import RuleEditor from '../RuleEditor';
import ConfirmDialog from '../ConfirmDialog';

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

function conditionsSummary(rule: Rule): string {
    const parts: string[] = [];
    if (rule.description_pattern) {
        parts.push(`desc ${rule.match_type === 'regex' ? '~' : '∋'} "${rule.description_pattern}"`);
    }
    if (rule.amount_min_cents != null && rule.amount_max_cents != null) {
        parts.push(`$${rule.amount_min_cents / 100}–$${rule.amount_max_cents / 100}`);
    } else if (rule.amount_min_cents != null) {
        parts.push(`≥$${rule.amount_min_cents / 100}`);
    } else if (rule.amount_max_cents != null) {
        parts.push(`≤$${rule.amount_max_cents / 100}`);
    }
    if (rule.tx_type) parts.push(rule.tx_type);
    return parts.join(', ') || '—';
}

function actionsSummary(rule: Rule, tagNames: Map<number, string>): string {
    const parts: string[] = [];
    if (rule.set_category) parts.push(`→ ${rule.set_category}`);
    if (rule.add_tag_ids && rule.add_tag_ids.length > 0) {
        const names = rule.add_tag_ids.map((id) => tagNames.get(id) ?? `#${id}`);
        parts.push(`+tag ${names.join(', ')}`);
    }
    if (rule.notes_prefix) parts.push(`prefix "${rule.notes_prefix}"`);
    return parts.join('; ') || '—';
}

export default function RulesSection() {
    const queryClient = useQueryClient();
    const [editingRule, setEditingRule] = useState<Rule | null | 'new'>(null);
    const [deleteTarget, setDeleteTarget] = useState<Rule | null>(null);
    const [showRunDialog, setShowRunDialog] = useState(false);

    const { data: rules = [], isLoading } = useQuery({ queryKey: ['rules'], queryFn: listRules });
    const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: listAccounts });
    const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: listTags });

    const tagNames = new Map(tags.map((t) => [t.id, t.name]));
    const accountNames = new Map(accounts.map((a) => [a.id, a.name]));

    const createMutation = useMutation({
        mutationFn: createRule,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['rules'] });
            setEditingRule(null);
            toast.success('Rule created.');
        },
        onError: (err: unknown) => {
            const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
            toast.error(msg ?? 'Failed to create rule.');
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, input }: { id: number; input: Partial<RuleInput> }) => updateRule(id, input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['rules'] });
            setEditingRule(null);
            toast.success('Rule updated.');
        },
        onError: (err: unknown) => {
            const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
            toast.error(msg ?? 'Failed to update rule.');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: deleteRule,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['rules'] });
            setDeleteTarget(null);
            toast.success('Rule deleted.');
        },
        onError: () => toast.error('Failed to delete rule.'),
    });

    const toggleMutation = useMutation({
        mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => updateRule(id, { enabled }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rules'] }),
        onError: () => toast.error('Failed to update rule.'),
    });

    function handleSave(input: RuleInput) {
        if (editingRule === 'new') {
            createMutation.mutate(input);
        } else if (editingRule) {
            updateMutation.mutate({ id: editingRule.id, input });
        }
    }

    const isSaving = createMutation.isPending || updateMutation.isPending;

    if (editingRule !== null) {
        return (
            <div className="flex flex-col gap-4">
                <h2 className="font-display text-lg font-bold text-[var(--teak-dark)]">
                    {editingRule === 'new' ? 'New rule' : `Edit rule: ${editingRule.name}`}
                </h2>
                <RuleEditor
                    initial={editingRule === 'new' ? undefined : editingRule}
                    onSave={handleSave}
                    onCancel={() => setEditingRule(null)}
                    isSaving={isSaving}
                />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-display text-lg font-bold text-[var(--teak-dark)]">Rules</h2>
                    <div className="flex gap-2">
                        <button className="opensid-btn opensid-btn-ghost opensid-btn-sm" onClick={() => setShowRunDialog(true)}>
                            Run rules now
                        </button>
                        <button className="opensid-btn opensid-btn-primary opensid-btn-sm" onClick={() => setEditingRule('new')}>
                            + New rule
                        </button>
                    </div>
                </div>

                <p className="text-sm text-[var(--text-muted)] mb-4">
                    Rules automatically set categories, add tags, and prefix notes at import and transaction create time.
                    Lower priority number = runs first.
                </p>

                {isLoading ? (
                    <p className="text-sm text-[var(--text-muted)]">Loading…</p>
                ) : rules.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)]">No rules yet. Create one to auto-categorise transactions.</p>
                ) : (
                    <div className="bg-[var(--white)] rounded-xl [border:1.5px_solid_var(--border)] overflow-hidden">
                        <div
                            className="grid px-4 py-2.5 bg-[var(--cream)] [border-bottom:1px_solid_var(--border)]"
                            style={{ gridTemplateColumns: '40px 1fr 1fr 1fr 70px 70px 72px' }}
                        >
                            {['Pri', 'Name', 'Conditions', 'Actions', 'Matches', 'On', ''].map((h, i) => (
                                <div key={h + i} className={`text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em] ${i >= 4 ? 'text-right' : ''}`}>
                                    {h}
                                </div>
                            ))}
                        </div>
                        {rules.map((rule, idx) => (
                            <div
                                key={rule.id}
                                className="grid px-4 py-3 items-center"
                                style={{
                                    gridTemplateColumns: '40px 1fr 1fr 1fr 70px 70px 72px',
                                    borderBottom: idx < rules.length - 1 ? '1px solid var(--cream-mid)' : 'none',
                                    opacity: rule.enabled ? 1 : 0.5,
                                }}
                            >
                                <span className="text-xs text-[var(--text-muted)]">{rule.priority}</span>
                                <span className="text-sm font-medium truncate pr-2" title={rule.name}>
                                    {rule.name}
                                    {rule.account_id && (
                                        <span className="ml-1 text-[10px] text-[var(--text-muted)]">
                                            ({accountNames.get(rule.account_id) ?? `acc ${rule.account_id}`})
                                        </span>
                                    )}
                                </span>
                                <span className="text-[12px] text-[var(--text-muted)] truncate pr-2" title={conditionsSummary(rule)}>
                                    {conditionsSummary(rule)}
                                </span>
                                <span className="text-[12px] text-[var(--text-muted)] truncate pr-2" title={actionsSummary(rule, tagNames)}>
                                    {actionsSummary(rule, tagNames)}
                                </span>
                                <span className="text-xs text-right text-[var(--text-muted)]">{rule.last_match_count}</span>
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={rule.enabled === 1}
                                        aria-label={rule.enabled ? 'Disable rule' : 'Enable rule'}
                                        onClick={() => toggleMutation.mutate({ id: rule.id, enabled: rule.enabled !== 1 })}
                                        className={`relative w-9 h-5 rounded-full transition-colors border-none cursor-pointer ${rule.enabled ? 'bg-[var(--teak)]' : 'bg-[var(--border)]'}`}
                                    >
                                        <span
                                            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${rule.enabled ? 'translate-x-4' : 'translate-x-0'}`}
                                        />
                                    </button>
                                </div>
                                <div className="flex justify-end gap-1">
                                    <button
                                        className="opensid-icon-btn"
                                        aria-label={`Edit rule ${rule.name}`}
                                        onClick={() => setEditingRule(rule)}
                                    >
                                        <EditIcon />
                                    </button>
                                    <button
                                        className="opensid-icon-btn danger"
                                        aria-label={`Delete rule ${rule.name}`}
                                        onClick={() => setDeleteTarget(rule)}
                                    >
                                        <TrashIcon />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {deleteTarget && (
                <ConfirmDialog
                    message={`Delete rule "${deleteTarget.name}"? It will no longer apply to new imports.`}
                    confirmLabel="Delete"
                    onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}

            {showRunDialog && (
                <RunRulesDialog
                    accounts={accounts}
                    onClose={() => {
                        setShowRunDialog(false);
                        queryClient.invalidateQueries({ queryKey: ['rules'] });
                    }}
                />
            )}
        </div>
    );
}

interface Account { id: number; name: string }

function RunRulesDialog({ accounts, onClose }: { accounts: Account[]; onClose: () => void }) {
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [accountId, setAccountId] = useState('');
    const [dryRun, setDryRun] = useState(true);
    const [result, setResult] = useState<{ affected: number; per_rule: { id: number; name: string; match_count: number }[] } | null>(null);

    const runMutation = useMutation({
        mutationFn: () =>
            runRules({
                from: from || undefined,
                to: to || undefined,
                account_id: accountId ? parseInt(accountId, 10) : undefined,
                dry_run: dryRun,
            }),
        onSuccess: (data) => {
            setResult(data);
            if (!dryRun) {
                toast.success(`Rules applied: ${data.affected} transaction${data.affected !== 1 ? 's' : ''} affected.`);
            }
        },
        onError: () => toast.error('Failed to run rules.'),
    });

    return (
        <div className="opensid-modal-overlay anim-fade" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="opensid-modal anim-slide-up" style={{ maxWidth: 480 }}>
                <div className="opensid-modal-trim" />
                <div className="opensid-modal-body flex flex-col gap-4">
                    <h3 className="font-display text-base font-bold text-[var(--teak-dark)]">Run rules</h3>

                    <div className="flex flex-col gap-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1 min-w-0">
                                <label className="opensid-label">From date</label>
                                <input type="date" className="opensid-input w-full" value={from} onChange={(e) => setFrom(e.target.value)} />
                            </div>
                            <div className="flex flex-col gap-1 min-w-0">
                                <label className="opensid-label">To date</label>
                                <input type="date" className="opensid-input w-full" value={to} onChange={(e) => setTo(e.target.value)} />
                            </div>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="opensid-label">Account</label>
                            <select className="opensid-input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                                <option value="">All accounts</option>
                                {accounts.map((a) => (
                                    <option key={a.id} value={String(a.id)}>{a.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                            type="checkbox"
                            checked={dryRun}
                            onChange={(e) => { setDryRun(e.target.checked); setResult(null); }}
                            className="w-4 h-4"
                        />
                        Dry run (preview only — no changes saved)
                    </label>

                    {result && (
                        <div className="bg-[var(--cream)] rounded-lg p-3 text-sm">
                            <p className="font-semibold mb-2">
                                {dryRun ? 'Would affect' : 'Affected'}{' '}
                                <strong>{result.affected}</strong> transaction{result.affected !== 1 ? 's' : ''}.
                            </p>
                            {result.per_rule.filter((r) => r.match_count > 0).map((r) => (
                                <div key={r.id} className="flex justify-between text-[var(--text-muted)] text-xs py-0.5">
                                    <span>{r.name}</span>
                                    <span>{r.match_count} match{r.match_count !== 1 ? 'es' : ''}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex gap-2">
                        <button
                            className="opensid-btn opensid-btn-primary"
                            onClick={() => runMutation.mutate()}
                            disabled={runMutation.isPending}
                        >
                            {runMutation.isPending ? 'Running…' : dryRun ? 'Preview' : 'Apply rules'}
                        </button>
                        <button className="opensid-btn opensid-btn-ghost" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
