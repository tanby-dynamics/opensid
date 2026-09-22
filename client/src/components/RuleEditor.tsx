import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dryRunRule, type RuleInput } from '../api/rules';
import { listTags } from '../api/tags';
import { getCategories } from '../api/categories';
import { listAccounts } from '../api/accounts';
import type { Rule } from '../api/rules';

interface Props {
    initial?: Rule;
    onSave: (input: RuleInput) => void;
    onCancel: () => void;
    isSaving: boolean;
}

const DEBOUNCE_MS = 600;

export default function RuleEditor({ initial, onSave, onCancel, isSaving }: Props) {
    const [name, setName] = useState(initial?.name ?? '');
    const [priority, setPriority] = useState(String(initial?.priority ?? 100));
    const [enabled, setEnabled] = useState(initial?.enabled !== 0);
    const [accountId, setAccountId] = useState<string>(initial?.account_id ? String(initial.account_id) : '');
    const [matchType, setMatchType] = useState<'substring' | 'regex'>(initial?.match_type ?? 'substring');
    const [descPattern, setDescPattern] = useState(initial?.description_pattern ?? '');
    const [amountMin, setAmountMin] = useState(initial?.amount_min_cents != null ? String(initial.amount_min_cents / 100) : '');
    const [amountMax, setAmountMax] = useState(initial?.amount_max_cents != null ? String(initial.amount_max_cents / 100) : '');
    const [txType, setTxType] = useState<string>(initial?.tx_type ?? '');
    const [setCategory, setSetCategory] = useState(initial?.set_category ?? '');
    const [addTagIds, setAddTagIds] = useState<number[]>(initial?.add_tag_ids ?? []);
    const [notesPrefix, setNotesPrefix] = useState(initial?.notes_prefix ?? '');
    const [matchCount, setMatchCount] = useState<number | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [regexError, setRegexError] = useState<string | null>(null);

    const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: listTags });
    const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: getCategories });
    const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: listAccounts });

    // Validate regex live
    useEffect(() => {
        if (matchType !== 'regex' || !descPattern) {
            setRegexError(null);
            return;
        }
        try {
            new RegExp(descPattern, 'i');
            setRegexError(null);
        } catch (e) {
            setRegexError((e as Error).message);
        }
    }, [matchType, descPattern]);

    // Debounced preview
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    function triggerPreview() {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            if (regexError) return;
            setPreviewError(null);
            try {
                const result = await dryRunRule(buildInput());
                setMatchCount(result.match_count);
            } catch (err: unknown) {
                const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
                setPreviewError(msg ?? 'Preview failed');
                setMatchCount(null);
            }
        }, DEBOUNCE_MS);
    }

    // Trigger preview when conditions change
    useEffect(() => {
        triggerPreview();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [descPattern, matchType, amountMin, amountMax, txType, accountId]);

    function buildInput(): RuleInput {
        return {
            name: name.trim(),
            priority: parseInt(priority, 10) || 100,
            enabled,
            account_id: accountId ? parseInt(accountId, 10) : null,
            match_type: matchType,
            description_pattern: descPattern.trim() || null,
            amount_min_cents: amountMin ? Math.round(parseFloat(amountMin) * 100) : null,
            amount_max_cents: amountMax ? Math.round(parseFloat(amountMax) * 100) : null,
            tx_type: txType ? (txType as 'income' | 'expense' | 'transfer') : null,
            set_category: setCategory.trim() || null,
            add_tag_ids: addTagIds.length > 0 ? addTagIds : null,
            notes_prefix: notesPrefix.trim() || null,
        };
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (regexError) {
            toast.error(`Invalid regex: ${regexError}`);
            return;
        }
        onSave(buildInput());
    }

    function toggleTag(tagId: number) {
        setAddTagIds((prev) =>
            prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
        );
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Name + meta */}
            <div className="flex flex-wrap gap-3">
                <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                    <label className="opensid-label">Rule name *</label>
                    <input
                        type="text"
                        className="opensid-input"
                        maxLength={60}
                        placeholder="e.g. Uber → Transport"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                    />
                </div>
                <div className="flex flex-col gap-1 w-24">
                    <label className="opensid-label">Priority</label>
                    <input
                        type="number"
                        className="opensid-input"
                        min={1}
                        max={9999}
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                    />
                </div>
                <div className="flex flex-col gap-1 justify-end">
                    <label className="opensid-label invisible">Enabled</label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => setEnabled(e.target.checked)}
                            className="w-4 h-4"
                        />
                        Enabled
                    </label>
                </div>
            </div>

            {/* Conditions */}
            <fieldset className="border-none p-0 m-0">
                <legend className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-[0.07em] mb-2">Conditions</legend>
                <div className="flex flex-col gap-3">
                    {/* Description pattern */}
                    <div className="flex flex-wrap gap-2 items-end">
                        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
                            <label className="opensid-label">Description</label>
                            <input
                                type="text"
                                className={`opensid-input ${regexError ? 'border-[var(--red)]' : ''}`}
                                placeholder={matchType === 'regex' ? 'e.g. uber.*trip' : 'e.g. uber'}
                                maxLength={200}
                                value={descPattern}
                                onChange={(e) => setDescPattern(e.target.value)}
                            />
                            {regexError && (
                                <span className="text-[11px] text-[var(--red)]">Invalid regex: {regexError}</span>
                            )}
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="opensid-label">Match type</label>
                            <select
                                className="opensid-input"
                                value={matchType}
                                onChange={(e) => setMatchType(e.target.value as 'substring' | 'regex')}
                            >
                                <option value="substring">Contains</option>
                                <option value="regex">Regex</option>
                            </select>
                        </div>
                    </div>

                    {/* Amount range */}
                    <div className="flex flex-wrap gap-2 items-end">
                        <div className="flex flex-col gap-1">
                            <label className="opensid-label">Min amount ($)</label>
                            <input
                                type="number"
                                className="opensid-input w-28"
                                min={0}
                                step={0.01}
                                placeholder="any"
                                value={amountMin}
                                onChange={(e) => setAmountMin(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="opensid-label">Max amount ($)</label>
                            <input
                                type="number"
                                className="opensid-input w-28"
                                min={0}
                                step={0.01}
                                placeholder="any"
                                value={amountMax}
                                onChange={(e) => setAmountMax(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="opensid-label">Type</label>
                            <select
                                className="opensid-input"
                                value={txType}
                                onChange={(e) => setTxType(e.target.value)}
                            >
                                <option value="">Any</option>
                                <option value="income">Income</option>
                                <option value="expense">Expense</option>
                                <option value="transfer">Transfer</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="opensid-label">Account</label>
                            <select
                                className="opensid-input"
                                value={accountId}
                                onChange={(e) => setAccountId(e.target.value)}
                            >
                                <option value="">All accounts</option>
                                {accounts.map((a) => (
                                    <option key={a.id} value={String(a.id)}>{a.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </fieldset>

            {/* Preview */}
            <div className="text-sm text-[var(--text-muted)] bg-[var(--cream)] rounded-lg px-3 py-2 min-h-[36px] flex items-center">
                {previewError ? (
                    <span className="text-[var(--red)]">{previewError}</span>
                ) : matchCount === null ? (
                    <span>Enter a condition to preview matches…</span>
                ) : (
                    <span>
                        This rule would match{' '}
                        <strong className="text-[var(--teak-dark)]">{matchCount}</strong>{' '}
                        existing transaction{matchCount !== 1 ? 's' : ''}.
                    </span>
                )}
            </div>

            {/* Actions */}
            <fieldset className="border-none p-0 m-0">
                <legend className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-[0.07em] mb-2">Actions</legend>
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap gap-2 items-end">
                        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
                            <label className="opensid-label">Set category</label>
                            <input
                                list="rule-categories"
                                className="opensid-input"
                                placeholder="e.g. Transport"
                                value={setCategory}
                                onChange={(e) => setSetCategory(e.target.value)}
                            />
                            <datalist id="rule-categories">
                                {categories.map((c) => <option key={c} value={c} />)}
                            </datalist>
                        </div>
                        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
                            <label className="opensid-label">Notes prefix</label>
                            <input
                                type="text"
                                className="opensid-input"
                                placeholder="e.g. [auto]"
                                value={notesPrefix}
                                onChange={(e) => setNotesPrefix(e.target.value)}
                            />
                        </div>
                    </div>

                    {tags.length > 0 && (
                        <div className="flex flex-col gap-1">
                            <label className="opensid-label">Add tags</label>
                            <div className="flex flex-wrap gap-1.5">
                                {tags.map((tag) => {
                                    const selected = addTagIds.includes(tag.id);
                                    const style = tag.colour
                                        ? { background: tag.colour + (selected ? '44' : '11'), color: tag.colour, borderColor: tag.colour + '55' }
                                        : undefined;
                                    return (
                                        <button
                                            key={tag.id}
                                            type="button"
                                            onClick={() => toggleTag(tag.id)}
                                            className={`px-2 py-[2px] rounded-full text-[11px] font-bold [border:1.5px_solid_var(--border)] cursor-pointer transition-opacity ${selected ? 'opacity-100' : 'opacity-50'}`}
                                            style={style}
                                        >
                                            {tag.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </fieldset>

            <div className="flex gap-2 pt-1">
                <button type="submit" className="opensid-btn opensid-btn-primary" disabled={isSaving || !name.trim() || !!regexError}>
                    {isSaving ? 'Saving…' : 'Save rule'}
                </button>
                <button type="button" className="opensid-btn opensid-btn-ghost" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </form>
    );
}
