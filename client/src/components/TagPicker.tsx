import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listTags, createTag } from '../api/tags';
import type { TagRef } from '../types/transaction';

interface Props {
    selectedTags: TagRef[];
    onChange: (tags: TagRef[]) => void;
    allowCreate?: boolean;
    placeholder?: string;
}

function tagStyle(colour: string | null): React.CSSProperties {
    if (!colour) return {};
    return { background: colour + '22', color: colour, borderColor: colour + '55' };
}

export default function TagPicker({ selectedTags, onChange, allowCreate = true, placeholder = 'Add tag…' }: Props) {
    const [input, setInput] = useState('');
    const [open, setOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const queryClient = useQueryClient();

    const { data: allTags = [] } = useQuery({
        queryKey: ['tags'],
        queryFn: listTags,
    });

    const selectedIds = new Set(selectedTags.map((t) => t.id));
    const query = input.trim().toLowerCase();

    const suggestions = allTags.filter(
        (t) => !selectedIds.has(t.id) && (query === '' || t.name.toLowerCase().includes(query)),
    );

    const exactMatch = allTags.find((t) => t.name.toLowerCase() === query);
    const showCreate = allowCreate && query.length > 0 && !exactMatch && query.length <= 40 && !query.includes(',');

    function addTag(tag: TagRef) {
        onChange([...selectedTags, tag]);
        setInput('');
        setOpen(false);
        inputRef.current?.focus();
    }

    function removeTag(id: number) {
        onChange(selectedTags.filter((t) => t.id !== id));
    }

    async function handleCreate() {
        try {
            const tag = await createTag(input.trim());
            queryClient.invalidateQueries({ queryKey: ['tags'] });
            addTag(tag);
        } catch {
            // tag creation failed
        }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (suggestions.length > 0 && !showCreate) {
                addTag(suggestions[0]);
            } else if (showCreate) {
                handleCreate();
            }
        } else if (e.key === 'Backspace' && input === '' && selectedTags.length > 0) {
            removeTag(selectedTags[selectedTags.length - 1].id);
        } else if (e.key === 'Escape') {
            setOpen(false);
        }
    }

    function handleBlur() {
        blurTimer.current = setTimeout(() => setOpen(false), 150);
    }

    function handleSuggestionMouseDown() {
        if (blurTimer.current) clearTimeout(blurTimer.current);
    }

    useEffect(() => () => { if (blurTimer.current) clearTimeout(blurTimer.current); }, []);

    return (
        <div className="flex flex-col gap-[5px]">
            <label className="opensid-label">Tags (optional)</label>
            <div
                className="opensid-input flex flex-wrap gap-1 items-center cursor-text min-h-[38px] py-1"
                onClick={() => inputRef.current?.focus()}
            >
                {selectedTags.map((tag) => (
                    <span
                        key={tag.id}
                        className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[11px] font-bold [border:1px_solid_var(--border)] bg-[var(--cream)]"
                        style={tagStyle(tag.colour)}
                    >
                        {tag.name}
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeTag(tag.id); }}
                            className="leading-none text-[var(--text-muted)] hover:text-[var(--text)] border-none bg-transparent cursor-pointer p-0"
                            aria-label={`Remove tag ${tag.name}`}
                        >
                            ×
                        </button>
                    </span>
                ))}
                <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => { setInput(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    placeholder={selectedTags.length === 0 ? placeholder : ''}
                    className="flex-1 min-w-[80px] border-none outline-none bg-transparent text-[13px] font-body text-[var(--text)] placeholder:text-[var(--text-muted)] py-0"
                    autoComplete="off"
                />
            </div>
            {open && (suggestions.length > 0 || showCreate) && (
                <ul className="opensid-suggestions" onMouseDown={handleSuggestionMouseDown}>
                    {suggestions.map((tag) => (
                        <li key={tag.id}>
                            <button
                                type="button"
                                className="opensid-suggestion-item flex items-center gap-2"
                                onMouseDown={() => addTag(tag)}
                            >
                                <span
                                    className="inline-block w-2 h-2 rounded-full shrink-0"
                                    style={{ background: tag.colour ?? 'var(--border)' }}
                                />
                                {tag.name}
                            </button>
                        </li>
                    ))}
                    {showCreate && (
                        <li>
                            <button
                                type="button"
                                className="opensid-suggestion-item text-[var(--teak)]"
                                onMouseDown={handleCreate}
                            >
                                Create "{input.trim()}"
                            </button>
                        </li>
                    )}
                </ul>
            )}
        </div>
    );
}
