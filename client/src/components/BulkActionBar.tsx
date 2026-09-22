import { useState, useRef, useEffect } from 'react';
import type { TagRef } from '../types/transaction';

interface Props {
    selectedCount: number;
    onDelete: () => void;
    onExport: () => void;
    onClear: () => void;
    availableTags?: TagRef[];
    onBulkTag?: (add: number[]) => void;
    canUnsplit?: boolean;
    onUnsplit?: () => void;
}

export default function BulkActionBar({ selectedCount, onDelete, onExport, onClear, availableTags = [], onBulkTag, canUnsplit = false, onUnsplit }: Props) {
    const [tagOpen, setTagOpen] = useState(false);
    const [tagSearch, setTagSearch] = useState('');
    const [pendingTagIds, setPendingTagIds] = useState<Set<number>>(new Set());
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setTagOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    function openTagDropdown() {
        setPendingTagIds(new Set());
        setTagSearch('');
        setTagOpen(true);
    }

    function applyTags() {
        onBulkTag?.([...pendingTagIds]);
        setTagOpen(false);
        setPendingTagIds(new Set());
    }

    const filtered = availableTags.filter((t) =>
        tagSearch === '' || t.name.toLowerCase().includes(tagSearch.toLowerCase()),
    );

    if (selectedCount === 0) return null;

    return (
        <div className="flex items-center gap-3 px-4 py-2.5 mb-3 bg-[var(--cream)] rounded-xl [border:1.5px_solid_var(--border)] shadow-[var(--shadow-sm)]">
            <span className="text-[13px] font-semibold text-[var(--text-secondary)] font-body flex-1">
                {selectedCount} selected
            </span>
            {onBulkTag && (
                <div ref={dropdownRef} className="relative">
                    <button className="opensid-btn opensid-btn-ghost opensid-btn-sm" onClick={openTagDropdown}>
                        Tag selected
                    </button>
                    {tagOpen && (
                        <div className="absolute right-0 z-20 mt-1 w-[220px] rounded-xl bg-[var(--white)] [border:1.5px_solid_var(--border)] shadow-[var(--shadow-md)] p-2 flex flex-col gap-2">
                            <input
                                type="text"
                                className="opensid-input text-[13px]"
                                placeholder="Search tags…"
                                value={tagSearch}
                                onChange={(e) => setTagSearch(e.target.value)}
                                autoFocus
                            />
                            <ul className="max-h-40 overflow-y-auto flex flex-col gap-0.5">
                                {filtered.length === 0 && (
                                    <li className="text-[13px] text-[var(--text-muted)] px-2 py-1">No tags found</li>
                                )}
                                {filtered.map((tag) => (
                                    <li key={tag.id}>
                                        <label className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-[var(--cream)] cursor-pointer text-[13px] font-body">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 accent-[var(--teak)]"
                                                checked={pendingTagIds.has(tag.id)}
                                                onChange={(e) => {
                                                    const next = new Set(pendingTagIds);
                                                    if (e.target.checked) next.add(tag.id);
                                                    else next.delete(tag.id);
                                                    setPendingTagIds(next);
                                                }}
                                            />
                                            {tag.colour && (
                                                <span
                                                    className="inline-block w-2 h-2 rounded-full shrink-0"
                                                    style={{ background: tag.colour }}
                                                />
                                            )}
                                            {tag.name}
                                        </label>
                                    </li>
                                ))}
                            </ul>
                            <button
                                className="opensid-btn opensid-btn-primary opensid-btn-sm"
                                disabled={pendingTagIds.size === 0}
                                onClick={applyTags}
                            >
                                Apply
                            </button>
                        </div>
                    )}
                </div>
            )}
            {canUnsplit && onUnsplit && (
                <button className="opensid-btn opensid-btn-ghost opensid-btn-sm" onClick={onUnsplit}>
                    Unsplit
                </button>
            )}
            <button className="opensid-btn opensid-btn-ghost opensid-btn-sm" onClick={onExport}>
                Export selected
            </button>
            <button className="opensid-btn opensid-btn-danger opensid-btn-sm" onClick={onDelete}>
                Delete selected
            </button>
            <button
                aria-label="Clear selection"
                className="opensid-icon-btn"
                onClick={onClear}
                title="Clear selection"
            >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
            </button>
        </div>
    );
}
