import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { listTags, createTag, updateTag, deleteTag, getSpendByTag, type TagWithUsage, type SpendByTagRow } from '../../api/tags';
import { listAccounts } from '../../api/accounts';
import { formatCents } from '../../utils/format';
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

function TagChip({ tag }: { tag: TagWithUsage }) {
    const style = tag.colour
        ? { background: tag.colour + '22', color: tag.colour, borderColor: tag.colour + '55' }
        : undefined;
    return (
        <span
            className="inline-flex items-center px-2 py-[2px] rounded-full text-[11px] font-bold [border:1px_solid_var(--border)] bg-[var(--cream)]"
            style={style}
        >
            {tag.name}
        </span>
    );
}

interface EditState {
    id: number;
    name: string;
    colour: string;
}

export default function TagsSection() {
    const queryClient = useQueryClient();
    const [editState, setEditState] = useState<EditState | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<TagWithUsage | null>(null);
    const [newName, setNewName] = useState('');
    const [newColour, setNewColour] = useState('');

    const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: listTags });

    const createMutation = useMutation({
        mutationFn: () => createTag(newName.trim(), newColour || undefined),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tags'] });
            setNewName('');
            setNewColour('');
            toast.success('Tag created.');
        },
        onError: (err: unknown) => {
            const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
            toast.error(msg ?? 'Failed to create tag.');
        },
    });

    const updateMutation = useMutation({
        mutationFn: (s: EditState) => updateTag(s.id, { name: s.name.trim(), colour: s.colour || null }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tags'] });
            setEditState(null);
            toast.success('Tag updated.');
        },
        onError: (err: unknown) => {
            const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
            toast.error(msg ?? 'Failed to update tag.');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => deleteTag(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tags'] });
            setDeleteTarget(null);
            toast.success('Tag deleted.');
        },
        onError: () => toast.error('Failed to delete tag.'),
    });

    function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!newName.trim()) return;
        createMutation.mutate();
    }

    return (
        <div className="flex flex-col gap-6">
            <div>
                <h2 className="font-display text-lg font-bold text-[var(--teak-dark)] mb-4">Tags</h2>

                {/* Create form */}
                <form onSubmit={handleCreate} className="flex items-end gap-2 mb-4">
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="opensid-label">New tag name</label>
                        <input
                            type="text"
                            className="opensid-input"
                            placeholder="e.g. work"
                            maxLength={40}
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="opensid-label">Colour (optional)</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                className="w-10 h-9 rounded-[var(--radius-input)] cursor-pointer [border:1.5px_solid_var(--border)]"
                                value={newColour || '#888888'}
                                onChange={(e) => setNewColour(e.target.value)}
                            />
                            {newColour && (
                                <button type="button" className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]" onClick={() => setNewColour('')}>
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>
                    <button type="submit" className="opensid-btn opensid-btn-primary" disabled={!newName.trim() || createMutation.isPending}>
                        Add tag
                    </button>
                </form>

                {/* Tag list */}
                {tags.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)]">No tags yet.</p>
                ) : (
                    <div className="flex flex-col divide-y divide-[var(--border)]">
                        {tags.map((tag) => (
                            <div key={tag.id} className="py-2.5 flex items-center gap-3">
                                {editState?.id === tag.id ? (
                                    <>
                                        <input
                                            type="text"
                                            className="opensid-input flex-1 text-[13px]"
                                            value={editState.name}
                                            maxLength={40}
                                            onChange={(e) => setEditState({ ...editState, name: e.target.value })}
                                            autoFocus
                                        />
                                        <input
                                            type="color"
                                            className="w-9 h-8 rounded cursor-pointer [border:1.5px_solid_var(--border)]"
                                            value={editState.colour || '#888888'}
                                            onChange={(e) => setEditState({ ...editState, colour: e.target.value })}
                                        />
                                        <button
                                            className="opensid-btn opensid-btn-primary opensid-btn-sm"
                                            onClick={() => updateMutation.mutate(editState)}
                                            disabled={!editState.name.trim()}
                                        >
                                            Save
                                        </button>
                                        <button className="opensid-btn opensid-btn-ghost opensid-btn-sm" onClick={() => setEditState(null)}>
                                            Cancel
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <TagChip tag={tag} />
                                        <span className="text-xs text-[var(--text-muted)] ml-1">{tag.usage_count} use{tag.usage_count !== 1 ? 's' : ''}</span>
                                        <div className="ml-auto flex gap-1">
                                            <button
                                                className="opensid-icon-btn"
                                                aria-label={`Edit tag ${tag.name}`}
                                                onClick={() => setEditState({ id: tag.id, name: tag.name, colour: tag.colour ?? '' })}
                                            >
                                                <EditIcon />
                                            </button>
                                            <button
                                                className="opensid-icon-btn danger"
                                                aria-label={`Delete tag ${tag.name}`}
                                                onClick={() => setDeleteTarget(tag)}
                                            >
                                                <TrashIcon />
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <SpendByTagReport />

            {deleteTarget && (
                <ConfirmDialog
                    message={`Delete tag "${deleteTarget.name}"? It will be removed from the tag picker but historical transactions will still show it until re-saved.`}
                    confirmLabel="Delete"
                    onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
        </div>
    );
}

function SpendByTagReport() {
    const today = new Date().toISOString().slice(0, 10);
    const firstOfMonth = today.slice(0, 8) + '01';
    const [from, setFrom] = useState(firstOfMonth);
    const [to, setTo] = useState(today);
    const [accountId, setAccountId] = useState<string>('');

    const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: listAccounts });

    const { data: rows = [], isLoading } = useQuery({
        queryKey: ['spend-by-tag', from, to, accountId],
        queryFn: () => getSpendByTag({ from: from || undefined, to: to || undefined, account_id: accountId ? parseInt(accountId) : undefined }),
    });

    const nonZero = rows.filter((r) => r.total_cents > 0 || r.transaction_count > 0);

    return (
        <div>
            <h2 className="font-display text-lg font-bold text-[var(--teak-dark)] mb-4">Spend by tag</h2>

            <div className="flex flex-wrap gap-3 mb-4">
                <div className="flex flex-col gap-1">
                    <label className="opensid-label">From</label>
                    <input type="date" className="opensid-input" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="opensid-label">To</label>
                    <input type="date" className="opensid-input" value={to} onChange={(e) => setTo(e.target.value)} />
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

            {isLoading ? (
                <p className="text-sm text-[var(--text-muted)]">Loading…</p>
            ) : nonZero.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No expense data for this period.</p>
            ) : (
                <div className="bg-[var(--white)] rounded-xl [border:1.5px_solid_var(--border)] overflow-hidden">
                    <div className="grid px-4 py-2.5 bg-[var(--cream)] [border-bottom:1px_solid_var(--border)]" style={{ gridTemplateColumns: '1fr 100px 120px' }}>
                        {['Tag', 'Transactions', 'Total spent'].map((h, i) => (
                            <div key={h} className={`text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em] ${i > 0 ? 'text-right' : ''}`}>{h}</div>
                        ))}
                    </div>
                    {nonZero.map((row, idx) => (
                        <SpendRow key={row.tag_id ?? 'untagged'} row={row} isLast={idx === nonZero.length - 1} />
                    ))}
                </div>
            )}
        </div>
    );
}

function SpendRow({ row, isLast }: { row: SpendByTagRow; isLast: boolean }) {
    const style = row.colour
        ? { background: row.colour + '22', color: row.colour, borderColor: row.colour + '55' }
        : undefined;
    return (
        <div
            className="grid px-4 py-2.5 items-center"
            style={{
                gridTemplateColumns: '1fr 100px 120px',
                borderBottom: isLast ? 'none' : '1px solid var(--cream-mid)',
            }}
        >
            <span
                className={`inline-block px-2 py-[2px] rounded-full text-[11px] font-bold w-fit ${row.tag_id === null ? 'text-[var(--text-muted)] italic' : '[border:1px_solid_var(--border)] bg-[var(--cream)]'}`}
                style={row.tag_id !== null ? style : undefined}
            >
                {row.name}
            </span>
            <span className="text-[13px] text-[var(--text-muted)] text-right">{row.transaction_count}</span>
            <span className="text-[13px] font-bold text-right text-[var(--red)]">{formatCents(-row.total_cents)}</span>
        </div>
    );
}
