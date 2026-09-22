import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Transaction } from '../types/transaction';
import type { Attachment } from '../types/attachment';
import { formatCents, formatDate, formatDateTime, balanceColor } from '../utils/format';
import { listAttachments, downloadUrl } from '../api/attachments';
import { getSplitChildren } from '../api/transactions';

interface Props {
    transaction: Transaction;
    isLast: boolean;
    gridTemplate: string;
    onEdit: (t: Transaction) => void;
    onDelete: (t: Transaction) => void;
    isSelected?: boolean;
    onSelect?: (id: number) => void;
    initialExpanded?: boolean;
    onToggleCleared?: (id: number, cleared: boolean) => void;
    reconcileMode?: boolean;
}

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

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TransactionRow({ transaction, isLast, gridTemplate, onEdit, onDelete, isSelected = false, onSelect, initialExpanded = false, onToggleCleared, reconcileMode = false }: Props) {
    const [expanded, setExpanded] = useState(initialExpanded);
    const isIncome = transaction.type === 'income';

    const { data: attachments = [] } = useQuery<Attachment[]>({
        queryKey: ['attachments', transaction.id],
        queryFn: () => listAttachments(transaction.id),
        enabled: expanded,
    });

    const isSplit = transaction.split_count > 0;

    const { data: splitChildren = [] } = useQuery<Transaction[]>({
        queryKey: ['split-children', transaction.id],
        queryFn: () => getSplitChildren(transaction.account_id, transaction.id),
        enabled: expanded && isSplit,
    });

    const isTransfer = transaction.type === 'transfer';
    const isTemplate = !!transaction.recurrence && !transaction.recurrence_source_id;
    const isGenerated = !!transaction.recurrence_source_id;
    const isCleared = transaction.cleared_at !== null;

    const typeBadge = isTransfer ? (
        <span className="flex items-center gap-1">
            <span className="inline-block px-2 py-[3px] rounded-full text-[11px] font-bold bg-[var(--cream-mid)] text-[var(--text-muted)]">
                ↔ transfer
            </span>
            {(isTemplate || isGenerated) && (
                <span title={isGenerated ? 'Auto-generated' : 'Recurring template'} className="text-[var(--text-muted)] text-[13px] leading-none">↻</span>
            )}
        </span>
    ) : (
        <span className="flex items-center gap-1">
            <span className={`inline-block px-2 py-[3px] rounded-full text-[11px] font-bold ${isIncome ? 'bg-[var(--green-light)] text-[var(--green)]' : 'bg-[var(--red-light)] text-[var(--red)]'}`}>
                {transaction.type}
            </span>
            {(isTemplate || isGenerated) && (
                <span title={isGenerated ? 'Auto-generated' : 'Recurring template'} className="text-[var(--text-muted)] text-[13px] leading-none">↻</span>
            )}
        </span>
    );

    const splitChip = isSplit ? (
        <span className="inline-block px-2 py-[3px] rounded-full text-[11px] font-bold bg-[var(--cream-mid)] text-[var(--text-muted)]">
            Split into {transaction.split_count}
        </span>
    ) : null;

    const clearedToggle = (
        <button
            type="button"
            aria-label={isCleared ? 'Unmark as cleared' : 'Mark as cleared'}
            onClick={(e) => { e.stopPropagation(); onToggleCleared?.(transaction.id, !isCleared); }}
            className={`flex items-center justify-center w-5 h-5 rounded-full border-[1.5px] flex-shrink-0 transition-all text-[11px] font-bold ${
                isCleared
                    ? 'bg-[var(--green)] border-[var(--green)] text-white'
                    : reconcileMode
                        ? 'border-[var(--cream-dark)] text-[var(--cream-dark)] hover:border-[var(--green)] hover:text-[var(--green)]'
                        : 'border-[var(--border)] text-[var(--border)] hover:border-[var(--green)] hover:text-[var(--green)]'
            }`}
            style={{ lineHeight: 1 }}
        >
            ✓
        </button>
    );

    return (
        <div style={{ borderBottom: isLast ? 'none' : '1px solid var(--cream-mid)', background: isSelected ? 'var(--cream)' : undefined }}>
            {/* Clickable row */}
            <div
                className="group cursor-pointer hover:bg-[var(--cream)] transition-colors duration-[120ms]"
                style={{ borderBottom: expanded ? '1px solid var(--cream-mid)' : 'none' }}
                onClick={() => setExpanded((e) => !e)}
            >
                {/* Mobile layout */}
                <div className="sm:hidden px-4 py-3 flex flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                            {clearedToggle}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-[13px] text-[var(--text-primary)] font-semibold leading-snug">
                                {transaction.description}
                            </div>
                            <div className="text-xs text-[var(--text-muted)] mt-0.5 flex flex-wrap items-center gap-1">
                                <span>{formatDate(transaction.date)}</span>
                                {transaction.category && (
                                    <>
                                        <span>·</span>
                                        <span>{transaction.category}</span>
                                    </>
                                )}
                                {splitChip && <>{splitChip}</>}
                            </div>
                            {transaction.tags && transaction.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {transaction.tags.map((tag) => (
                                        <span
                                            key={tag.id}
                                            className="inline-block px-2 py-[1px] rounded-full text-[10px] font-bold [border:1px_solid_var(--border)] bg-[var(--cream)]"
                                            style={tag.colour ? { background: tag.colour + '22', color: tag.colour, borderColor: tag.colour + '55' } : undefined}
                                        >
                                            {tag.name}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="shrink-0 text-right">
                            <div className="text-[13px] font-bold" style={{ color: balanceColor(transaction.amount_cents) }}>
                                {formatCents(transaction.amount_cents)}
                            </div>
                            <div className="mt-0.5">{typeBadge}</div>
                        </div>
                    </div>
                    {expanded && (
                    <div className="flex justify-end gap-0.5">
                        <button
                            aria-label={`Edit ${transaction.description}`}
                            onClick={(e) => { e.stopPropagation(); onEdit(transaction); }}
                            className="sid-icon-btn"
                        >
                            <EditIcon />
                        </button>
                        <button
                            aria-label={`Delete ${transaction.description}`}
                            onClick={(e) => { e.stopPropagation(); onDelete(transaction); }}
                            className="sid-icon-btn danger"
                        >
                            <TrashIcon />
                        </button>
                    </div>
                    )}
                </div>

                {/* Desktop layout */}
                <div
                    className="hidden sm:grid items-center px-5 py-[13px]"
                    style={{ gridTemplateColumns: gridTemplate }}
                >
                    {onSelect && (
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => { e.stopPropagation(); onSelect(transaction.id); }}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select ${transaction.description}`}
                            className="w-4 h-4 cursor-pointer accent-[var(--teak)]"
                        />
                    )}
                    <div className="flex items-center">
                        {clearedToggle}
                    </div>
                    <span className="text-[13px] text-[var(--text-muted)]">{formatDate(transaction.date)}</span>
                    <span className="text-xs text-[var(--text-muted)]">{transaction.category ?? ''}</span>
                    <span className="text-[13px] text-[var(--text-primary)] font-semibold">
                        {transaction.description}
                        {splitChip && <span className="ml-2 inline-block">{splitChip}</span>}
                        {transaction.tags && transaction.tags.length > 0 && (
                            <span className="ml-2 inline-flex flex-wrap gap-1">
                                {transaction.tags.map((tag) => (
                                    <span
                                        key={tag.id}
                                        className="inline-block px-1.5 py-[1px] rounded-full text-[10px] font-bold [border:1px_solid_var(--border)] bg-[var(--cream)]"
                                        style={tag.colour ? { background: tag.colour + '22', color: tag.colour, borderColor: tag.colour + '55' } : undefined}
                                    >
                                        {tag.name}
                                    </span>
                                ))}
                            </span>
                        )}
                    </span>
                    <span>{typeBadge}</span>
                    <span className="text-[13px] font-bold text-right" style={{ color: balanceColor(transaction.amount_cents) }}>
                        {formatCents(transaction.amount_cents)}
                    </span>
                    <div className={`flex justify-end gap-0.5 transition-opacity duration-150 ${expanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        <button
                            aria-label={`Edit ${transaction.description}`}
                            onClick={(e) => { e.stopPropagation(); onEdit(transaction); }}
                            className="sid-icon-btn"
                        >
                            <EditIcon />
                        </button>
                        <button
                            aria-label={`Delete ${transaction.description}`}
                            onClick={(e) => { e.stopPropagation(); onDelete(transaction); }}
                            className="sid-icon-btn danger"
                        >
                            <TrashIcon />
                        </button>
                    </div>
                </div>
            </div>

            {/* Expanded detail panel */}
            {expanded && (
                <div className="px-4 sm:px-5 py-4 bg-[var(--cream)] flex flex-col gap-3">
                    {isTransfer && transaction.transfer_group_id && (
                        <p className="text-xs text-[var(--text-muted)]">
                            Transfer pair: <span className="font-mono">{transaction.transfer_group_id}</span>
                            {transaction.amount_cents < 0 ? ' (outgoing)' : ' (incoming)'}
                        </p>
                    )}
                    {isGenerated && (
                        <p className="text-xs text-[var(--text-muted)] italic">Auto-generated from recurring transaction</p>
                    )}
                    {isTemplate && (
                        <p className="text-xs text-[var(--text-muted)] italic">
                            Recurring {transaction.recurrence}{transaction.recurrence_end_date ? ` until ${transaction.recurrence_end_date}` : ''}
                        </p>
                    )}
                    {isCleared && transaction.cleared_at && (
                        <p className="text-xs text-[var(--green)]">✓ Cleared {formatDateTime(transaction.cleared_at)}</p>
                    )}
                    {isSplit && (
                        <div>
                            <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em] mb-1">
                                Split into {transaction.split_count} parts
                            </div>
                            <ul className="flex flex-col gap-1.5">
                                {splitChildren.map((child) => (
                                    <li key={child.id} className="flex items-center justify-between text-[13px] gap-3">
                                        <span className="text-[var(--text-primary)] font-semibold">
                                            {child.category}
                                            {child.notes && <span className="ml-2 font-normal text-[var(--text-muted)]">{child.notes}</span>}
                                        </span>
                                        <span className="font-bold shrink-0" style={{ color: balanceColor(child.amount_cents) }}>
                                            {formatCents(child.amount_cents)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {transaction.tags && transaction.tags.length > 0 && (
                        <div>
                            <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em] mb-1">Tags</div>
                            <div className="flex flex-wrap gap-1">
                                {transaction.tags.map((tag) => (
                                    <span
                                        key={tag.id}
                                        className="inline-block px-2 py-[2px] rounded-full text-[11px] font-bold [border:1px_solid_var(--border)] bg-[var(--cream)]"
                                        style={tag.colour ? { background: tag.colour + '22', color: tag.colour, borderColor: tag.colour + '55' } : undefined}
                                    >
                                        {tag.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    {transaction.notes && (
                        <div>
                            <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em] mb-1">Notes</div>
                            <p className="text-[13px] text-[var(--text-secondary)] leading-[1.5] whitespace-pre-wrap">{transaction.notes}</p>
                        </div>
                    )}

                    <div>
                        <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em] mb-1">Attachments</div>
                        {attachments.length === 0 ? (
                            <p className="text-[13px] text-[var(--text-muted)] italic">None</p>
                        ) : (
                            <ul className="flex flex-col gap-1">
                                {attachments.map((a) => (
                                    <li key={a.id} className="flex items-center gap-2 text-[13px]">
                                        <a
                                            href={downloadUrl(a.id)}
                                            target="_blank"
                                            rel="noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="text-[var(--teak)] font-semibold no-underline"
                                        >
                                            {a.filename}
                                        </a>
                                        <span className="text-[var(--text-muted)] text-xs">{formatBytes(a.size_bytes)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {transaction.created_at && (
                        <div>
                            <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.07em] mb-1">Created</div>
                            <p className="text-[13px] text-[var(--text-secondary)]">{formatDateTime(transaction.created_at)}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
