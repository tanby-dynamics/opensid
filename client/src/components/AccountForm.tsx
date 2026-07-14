import { useState, useEffect } from 'react';
import type { AccountKind } from '../types/account';

export interface AccountFormValues {
    name: string;
    kind: AccountKind;
    excludeFromNetWorth: boolean;
}

interface Props {
    initialName?: string;
    initialKind?: AccountKind;
    initialExcludeFromNetWorth?: boolean;
    onSubmit: (values: AccountFormValues) => void;
    onCancel: () => void;
    title: string;
    serverError?: string;
}

export default function AccountForm({
    initialName = '',
    initialKind = 'asset',
    initialExcludeFromNetWorth = false,
    onSubmit,
    onCancel,
    title,
    serverError,
}: Props) {
    const [name, setName] = useState(initialName);
    const [kind, setKind] = useState<AccountKind>(initialKind);
    const [excludeFromNetWorth, setExcludeFromNetWorth] = useState(initialExcludeFromNetWorth);
    const [error, setError] = useState('');

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [onCancel]);

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) { setError('Name is required.'); return; }
        onSubmit({ name: name.trim(), kind, excludeFromNetWorth });
    }

    return (
        <div className="sid-modal-overlay anim-fade" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
            <div className="sid-modal anim-slide-up">
                <div className="sid-modal-trim" />
                <div className="sid-modal-body">
                    <h2 className="sid-modal-title">{title}</h2>
                    <form onSubmit={handleSubmit}>
                        <div className="flex flex-col gap-[5px]">
                            <label className="sid-label">Account name</label>
                            <input
                                type="text"
                                className="sid-input"
                                placeholder="e.g. Office expenses"
                                value={name}
                                onChange={(e) => { setName(e.target.value); setError(''); }}
                                autoFocus
                            />
                            {(error || serverError) && <span className="text-xs text-[var(--red)]">{error || serverError}</span>}
                        </div>
                        <div className="flex flex-col gap-[5px] mt-3">
                            <label className="sid-label" htmlFor="account-kind">Kind</label>
                            <select
                                id="account-kind"
                                className="sid-input"
                                value={kind}
                                onChange={(e) => setKind(e.target.value as AccountKind)}
                            >
                                <option value="asset">Asset</option>
                                <option value="liability">Liability</option>
                            </select>
                        </div>
                        <label className="flex items-center gap-2 mt-3 text-[14px] cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={excludeFromNetWorth}
                                onChange={(e) => setExcludeFromNetWorth(e.target.checked)}
                            />
                            Exclude from net worth
                        </label>
                        <div className="flex justify-end gap-2.5 mt-5">
                            <button type="button" className="sid-btn sid-btn-ghost" onClick={onCancel}>Cancel</button>
                            <button type="submit" className="sid-btn sid-btn-primary">Save</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
