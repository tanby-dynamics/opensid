import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    createSavedView,
    deleteSavedView,
    listSavedViews,
    sanitiseSavedFilters,
    setSavedViewDefault,
    updateSavedView,
    type SavedView,
    type SavedViewScope,
} from '../api/savedViews';
import type { TransactionFilters } from '../api/transactions';
import ConfirmDialog from './ConfirmDialog';

interface Props {
    scope: SavedViewScope;
    accountId?: number;
    currentFilters: TransactionFilters;
    isFiltered: boolean;
    onApply: (filters: TransactionFilters) => void;
    onClear: () => void;
}

type Modal =
    | { type: 'save' }
    | { type: 'rename'; view: SavedView }
    | { type: 'delete'; view: SavedView }
    | null;

function viewsQueryKey(scope: SavedViewScope, accountId?: number): unknown[] {
    return ['saved-views', scope, accountId ?? null];
}

export default function ViewsDropdown({ scope, accountId, currentFilters, isFiltered, onApply, onClear }: Props) {
    const [open, setOpen] = useState(false);
    const [modal, setModal] = useState<Modal>(null);
    const ref = useRef<HTMLDivElement>(null);
    const queryClient = useQueryClient();

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const { data: views = [] } = useQuery({
        queryKey: viewsQueryKey(scope, accountId),
        queryFn: () => listSavedViews({ scope, accountId }),
    });

    const globalViewsForAccount = useQuery({
        queryKey: viewsQueryKey('global'),
        queryFn: () => listSavedViews({ scope: 'global' }),
        enabled: scope === 'account',
    });

    function invalidate() {
        queryClient.invalidateQueries({ queryKey: viewsQueryKey(scope, accountId) });
        if (scope === 'account') queryClient.invalidateQueries({ queryKey: viewsQueryKey('global') });
    }

    const saveMutation = useMutation({
        mutationFn: (name: string) =>
            createSavedView({
                scope,
                account_id: scope === 'account' ? accountId ?? null : null,
                name,
                filters: currentFilters,
            }),
        onSuccess: () => {
            invalidate();
            toast.success('View saved.');
            setModal(null);
        },
        onError: (err: unknown) => {
            const msg =
                typeof err === 'object' && err && 'response' in err
                    ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to save view.')
                    : 'Failed to save view.';
            toast.error(msg);
        },
    });

    const renameMutation = useMutation({
        mutationFn: ({ id, name }: { id: number; name: string }) => updateSavedView(id, { name }),
        onSuccess: () => {
            invalidate();
            toast.success('View renamed.');
            setModal(null);
        },
        onError: (err: unknown) => {
            const msg =
                typeof err === 'object' && err && 'response' in err
                    ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to rename view.')
                    : 'Failed to rename view.';
            toast.error(msg);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => deleteSavedView(id),
        onSuccess: () => {
            invalidate();
            toast.success('View deleted.');
            setModal(null);
        },
        onError: () => toast.error('Failed to delete view.'),
    });

    const defaultMutation = useMutation({
        mutationFn: ({ id, isDefault }: { id: number; isDefault: boolean }) => setSavedViewDefault(id, isDefault),
        onSuccess: () => invalidate(),
        onError: () => toast.error('Failed to update default view.'),
    });

    function applyView(view: SavedView) {
        const filters = sanitiseSavedFilters(view.filters);
        onApply(filters);
        setOpen(false);
    }

    const globalViews = scope === 'account' ? (globalViewsForAccount.data ?? []) : [];

    return (
        <div ref={ref} className="relative">
            <button
                className="opensid-btn opensid-btn-ghost opensid-btn-sm"
                onClick={() => setOpen((o) => !o)}
                aria-label="Saved views"
            >
                Views ▾
            </button>
            {open && (
                <div className="absolute right-0 z-10 mt-1 min-w-[260px] rounded-xl bg-[var(--white)] [border:1.5px_solid_var(--border)] shadow-[var(--shadow-md)] py-1 max-h-[400px] overflow-y-auto">
                    <button
                        className="w-full text-left px-4 py-2 text-sm font-body text-[var(--text)] hover:bg-[var(--cream)] transition-colors"
                        onClick={() => {
                            onClear();
                            setOpen(false);
                        }}
                    >
                        All transactions
                    </button>
                    {views.length > 0 && (
                        <div className="[border-top:1px_solid_var(--border)] my-1" />
                    )}
                    {views.map((v) => (
                        <ViewItem
                            key={v.id}
                            view={v}
                            onApply={() => applyView(v)}
                            onSetDefault={() => defaultMutation.mutate({ id: v.id, isDefault: !v.is_default })}
                            onRename={() => setModal({ type: 'rename', view: v })}
                            onDelete={() => setModal({ type: 'delete', view: v })}
                        />
                    ))}
                    {scope === 'account' && globalViews.length > 0 && (
                        <>
                            <div className="[border-top:1px_solid_var(--border)] my-1" />
                            <div className="px-4 py-1 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em]">
                                Global views
                            </div>
                            {globalViews.map((v) => (
                                <ViewItem
                                    key={v.id}
                                    view={v}
                                    onApply={() => applyView(v)}
                                    onSetDefault={null}
                                    onRename={() => setModal({ type: 'rename', view: v })}
                                    onDelete={() => setModal({ type: 'delete', view: v })}
                                />
                            ))}
                        </>
                    )}
                    <div className="[border-top:1px_solid_var(--border)] my-1" />
                    <button
                        className="w-full text-left px-4 py-2 text-sm font-body text-[var(--teak-dark)] hover:bg-[var(--cream)] transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => setModal({ type: 'save' })}
                        disabled={!isFiltered}
                        title={!isFiltered ? 'Set some filters first' : undefined}
                    >
                        + Save current filters…
                    </button>
                </div>
            )}

            {modal?.type === 'save' && (
                <NamePrompt
                    title="Save current filters as a view"
                    submitLabel="Save"
                    onSubmit={(name) => saveMutation.mutate(name)}
                    onCancel={() => setModal(null)}
                    busy={saveMutation.isPending}
                />
            )}
            {modal?.type === 'rename' && (
                <NamePrompt
                    title="Rename view"
                    submitLabel="Rename"
                    initial={modal.view.name}
                    onSubmit={(name) => renameMutation.mutate({ id: modal.view.id, name })}
                    onCancel={() => setModal(null)}
                    busy={renameMutation.isPending}
                />
            )}
            {modal?.type === 'delete' && (
                <ConfirmDialog
                    message={`Delete saved view "${modal.view.name}"?`}
                    onConfirm={() => deleteMutation.mutate(modal.view.id)}
                    onCancel={() => setModal(null)}
                />
            )}
        </div>
    );
}

function ViewItem({
    view,
    onApply,
    onSetDefault,
    onRename,
    onDelete,
}: {
    view: SavedView;
    onApply: () => void;
    onSetDefault: (() => void) | null;
    onRename: () => void;
    onDelete: () => void;
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="flex items-center justify-between px-4 py-2 hover:bg-[var(--cream)] transition-colors group">
            <button
                className="flex-1 text-left text-sm font-body text-[var(--text)] truncate flex items-center gap-2"
                onClick={onApply}
            >
                <span className="truncate">{view.name}</span>
                {view.is_default && (
                    <span className="shrink-0 text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em] [border:1px_solid_var(--border)] rounded-full px-[5px] py-[1px]">
                        default
                    </span>
                )}
            </button>
            <div ref={menuRef} className="relative">
                <button
                    aria-label={`More options for ${view.name}`}
                    className="text-[var(--text-muted)] hover:text-[var(--text)] px-1 text-base leading-none"
                    onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen((o) => !o);
                    }}
                >
                    ⋮
                </button>
                {menuOpen && (
                    <div className="absolute right-0 z-20 mt-1 min-w-[160px] rounded-xl bg-[var(--white)] [border:1.5px_solid_var(--border)] shadow-[var(--shadow-md)] py-1">
                        {onSetDefault && (
                            <button
                                className="w-full text-left px-4 py-2 text-sm font-body text-[var(--text)] hover:bg-[var(--cream)] transition-colors"
                                onClick={() => {
                                    setMenuOpen(false);
                                    onSetDefault();
                                }}
                            >
                                {view.is_default ? 'Unset as default' : 'Set as default'}
                            </button>
                        )}
                        <button
                            className="w-full text-left px-4 py-2 text-sm font-body text-[var(--text)] hover:bg-[var(--cream)] transition-colors"
                            onClick={() => {
                                setMenuOpen(false);
                                onRename();
                            }}
                        >
                            Rename
                        </button>
                        <button
                            className="w-full text-left px-4 py-2 text-sm font-body text-[var(--red)] hover:bg-[var(--cream)] transition-colors"
                            onClick={() => {
                                setMenuOpen(false);
                                onDelete();
                            }}
                        >
                            Delete
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function NamePrompt({
    title,
    submitLabel,
    initial = '',
    onSubmit,
    onCancel,
    busy,
}: {
    title: string;
    submitLabel: string;
    initial?: string;
    onSubmit: (name: string) => void;
    onCancel: () => void;
    busy: boolean;
}) {
    const [name, setName] = useState(initial);
    const trimmed = name.trim();
    const canSubmit = trimmed.length > 0 && trimmed.length <= 60 && !busy;

    return (
        <div
            className="opensid-modal-overlay anim-fade"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onCancel();
            }}
        >
            <div className="opensid-modal anim-slide-up">
                <div className="opensid-modal-trim" />
                <div className="opensid-modal-body">
                    <h2 className="font-display text-lg font-bold text-[var(--teak-dark)] mb-3">{title}</h2>
                    <input
                        type="text"
                        className="opensid-input w-full"
                        placeholder="View name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                        maxLength={60}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && canSubmit) onSubmit(trimmed);
                            if (e.key === 'Escape') onCancel();
                        }}
                    />
                    <div className="flex justify-end gap-2 mt-5">
                        <button className="opensid-btn opensid-btn-ghost" onClick={onCancel} disabled={busy}>
                            Cancel
                        </button>
                        <button
                            className="opensid-btn opensid-btn-primary"
                            onClick={() => onSubmit(trimmed)}
                            disabled={!canSubmit}
                        >
                            {submitLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
