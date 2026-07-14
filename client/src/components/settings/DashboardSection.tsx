import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
    arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    getDashboardConfig,
    addToDashboard,
    addCrossAccountTile,
    removeFromDashboard,
    reorderDashboard,
    updateTile,
    updateShowBalance,
    CROSS_ACCOUNT_TILE_TYPES,
    type TileType,
    type DashboardConfigItem,
} from '../../api/dashboardConfig';
import { listAccounts } from '../../api/accounts';
import { formatChartWindow } from '../../utils/chartWindow';

const TILE_TYPE_LABELS: Record<TileType, string> = {
    transactions: 'Transactions',
    balance_over_time: 'Balance over time',
    totals_by_category: 'Totals by category',
    income_vs_expense: 'Income vs Expense',
    budget_progress: 'Budget Progress',
    net_worth: 'Net Worth',
    net_worth_chart: 'Net Worth Over Time',
};

const WINDOW_OPTIONS = [
    { value: '30d', label: 'Last 30 days' },
    { value: '3m', label: 'Last 3 months' },
    { value: '12m', label: 'Last 12 months' },
    { value: 'all', label: 'All time' },
    { value: 'custom_weeks', label: 'Last X weeks' },
];

const INCOME_VS_EXPENSE_WINDOW_OPTIONS = [
    { value: '3m', label: 'Last 3 months' },
    { value: '6m', label: 'Last 6 months' },
    { value: '12m', label: 'Last 12 months' },
    { value: 'all', label: 'All time' },
];

function tileLabel(item: DashboardConfigItem, accountName: string): string {
    if (item.account_id === null) {
        const base = TILE_TYPE_LABELS[item.tile_type];
        if (item.time_window) return `${base} — ${formatChartWindow(item.time_window)}`;
        return base;
    }
    if (item.tile_type === 'transactions') return accountName;
    const base = `${accountName} — ${TILE_TYPE_LABELS[item.tile_type]}`;
    if (item.time_window) return `${base} — ${formatChartWindow(item.time_window)}`;
    return base;
}

function isValidWeeks(value: string): boolean {
    const n = parseInt(value, 10);
    return /^\d+$/.test(value) && n >= 1 && n <= 52;
}

function windowToOption(timeWindow: string | null): { option: string; weeks: string } {
    if (!timeWindow) return { option: '', weeks: '' };
    const weeksMatch = timeWindow.match(/^(\d+)w$/);
    if (weeksMatch) return { option: 'custom_weeks', weeks: weeksMatch[1] };
    return { option: timeWindow, weeks: '' };
}

const ChevronUpIcon = () => (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
    </svg>
);

const ChevronDownIcon = () => (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
);

const XIcon = () => (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
);

const EditIcon = () => (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
        <path d="M13.586 3.586a2 2 0 112.828 2.828l-9 9A2 2 0 016 16H4a1 1 0 01-1-1v-2a2 2 0 01.586-1.414l9-9z" />
    </svg>
);

const GripDotsIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <circle cx="5" cy="3.5" r="1.5" />
        <circle cx="11" cy="3.5" r="1.5" />
        <circle cx="5" cy="8" r="1.5" />
        <circle cx="11" cy="8" r="1.5" />
        <circle cx="5" cy="12.5" r="1.5" />
        <circle cx="11" cy="12.5" r="1.5" />
    </svg>
);

const inputCls = 'font-body text-[14px] border-[1.5px] border-[var(--border)] rounded-[var(--radius-input)] px-3 py-[9px] bg-[var(--white)] text-[var(--text-primary)]';

interface EditModalProps {
    tile: DashboardConfigItem;
    accounts: { id: number; name: string }[];
    onSave: () => void;
    onCancel: () => void;
}

function EditTileModal({ tile, accounts, onSave, onCancel }: EditModalProps) {
    const [accountId, setAccountId] = useState(tile.account_id === null ? '' : String(tile.account_id));
    const [tileType, setTileType] = useState<TileType>(tile.tile_type);
    const [windowOption, setWindowOption] = useState(() => windowToOption(tile.time_window).option);
    const [weeks, setWeeks] = useState(() => windowToOption(tile.time_window).weeks);
    const [showBalance, setShowBalance] = useState(tile.show_balance);
    const [error, setError] = useState('');

    const isCrossAccountType = CROSS_ACCOUNT_TILE_TYPES.includes(tileType);
    const isChartType = tileType === 'balance_over_time' || tileType === 'totals_by_category' || tileType === 'net_worth_chart';
    const isIncomeVsExpense = tileType === 'income_vs_expense';
    const needsWindow = isChartType || isIncomeVsExpense;
    const supportsBalance = tileType === 'transactions' || tileType === 'balance_over_time';

    const handleCancel = useCallback(onCancel, [onCancel]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleCancel(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [handleCancel]);

    const mutation = useMutation({
        mutationFn: () => {
            let timeWindow: string | undefined;
            if (needsWindow) {
                if (windowOption === 'custom_weeks') {
                    timeWindow = `${weeks}w`;
                } else {
                    timeWindow = windowOption || undefined;
                }
            }
            return updateTile(tile.id, {
                account_id: isCrossAccountType ? null : parseInt(accountId, 10),
                tile_type: tileType,
                time_window: timeWindow,
                show_balance: supportsBalance ? showBalance : false,
            });
        },
        onSuccess: onSave,
        onError: () => toast.error('Failed to update tile.'),
    });

    function handleSave() {
        setError('');
        if (!isCrossAccountType && !accountId) { setError('Account is required.'); return; }
        if (needsWindow && !windowOption) { setError('Time window is required for this tile type.'); return; }
        if (needsWindow && windowOption === 'custom_weeks' && !isValidWeeks(weeks)) {
            setError('Enter a number of weeks between 1 and 52.');
            return;
        }
        mutation.mutate();
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
            onMouseDown={(e) => { if (e.target === e.currentTarget) handleCancel(); }}
        >
            <div className="bg-[var(--white)] rounded-2xl [border:1.5px_solid_var(--border)] shadow-[var(--shadow-md)] p-6 w-full max-w-md">
                <h3 className="font-display text-[18px] font-bold text-[var(--teak-dark)] mb-5">Edit tile</h3>

                <div className="flex flex-col gap-3">
                    {!isCrossAccountType && (
                        <div className="flex flex-col gap-1">
                            <label className="text-[12px] font-bold tracking-[0.06em] text-[var(--text-muted)] uppercase font-body">Account</label>
                            <select
                                className={inputCls}
                                value={accountId}
                                onChange={(e) => setAccountId(e.target.value)}
                            >
                                {accounts.map((a) => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="flex flex-col gap-1">
                        <label className="text-[12px] font-bold tracking-[0.06em] text-[var(--text-muted)] uppercase font-body">Tile type</label>
                        <select
                            className={inputCls}
                            value={tileType}
                            onChange={(e) => {
                                setTileType(e.target.value as TileType);
                                setWindowOption('');
                                setWeeks('');
                            }}
                        >
                            <option value="transactions">Transactions</option>
                            <option value="balance_over_time">Balance over time</option>
                            <option value="totals_by_category">Totals by category</option>
                            <option value="income_vs_expense">Income vs Expense</option>
                            <option value="budget_progress">Budget Progress</option>
                            <option value="net_worth">Net Worth</option>
                            <option value="net_worth_chart">Net Worth Over Time</option>
                        </select>
                    </div>

                    {isChartType && (
                        <div className="flex flex-col gap-1">
                            <label className="text-[12px] font-bold tracking-[0.06em] text-[var(--text-muted)] uppercase font-body">Time window</label>
                            <select
                                className={inputCls}
                                value={windowOption}
                                onChange={(e) => { setWindowOption(e.target.value); setWeeks(''); }}
                            >
                                <option value="" disabled>Time window…</option>
                                {WINDOW_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {isIncomeVsExpense && (
                        <div className="flex flex-col gap-1">
                            <label className="text-[12px] font-bold tracking-[0.06em] text-[var(--text-muted)] uppercase font-body">Time window</label>
                            <select
                                className={inputCls}
                                value={windowOption}
                                onChange={(e) => setWindowOption(e.target.value)}
                            >
                                <option value="" disabled>Time window…</option>
                                {INCOME_VS_EXPENSE_WINDOW_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {isChartType && windowOption === 'custom_weeks' && (
                        <input
                            type="number"
                            aria-label="Number of weeks"
                            className={`${inputCls} w-24`}
                            placeholder="Weeks"
                            min={1}
                            max={52}
                            value={weeks}
                            onChange={(e) => setWeeks(e.target.value)}
                        />
                    )}

                    {supportsBalance && (
                        <label className="flex items-center gap-2 text-[14px] font-body text-[var(--text-primary)] cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={showBalance}
                                onChange={(e) => setShowBalance(e.target.checked)}
                            />
                            Show account balance
                        </label>
                    )}
                </div>

                {error && (
                    <p className="text-[13px] text-[var(--danger)] mt-3">{error}</p>
                )}

                <div className="flex justify-end gap-2.5 mt-5">
                    <button className="sid-btn sid-btn-ghost sid-btn-sm" onClick={handleCancel}>
                        Cancel
                    </button>
                    <button
                        className="sid-btn sid-btn-primary sid-btn-sm"
                        onClick={handleSave}
                        disabled={mutation.isPending}
                    >
                        {mutation.isPending ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

interface SortableRowProps {
    item: DashboardConfigItem;
    index: number;
    totalCount: number;
    label: string;
    showGrip: boolean;
    onEdit: () => void;
    onMove: (direction: 'up' | 'down') => void;
    onRemove: () => void;
    onShowBalanceChange: (showBalance: boolean) => void;
}

function SortableRow({ item, index, totalCount, label, showGrip, onEdit, onMove, onRemove, onShowBalanceChange }: SortableRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0 : undefined,
    };

    return (
        <tr ref={setNodeRef} style={style} className="border-b border-[var(--cream-mid)]">
            <td className="p-3 w-8">
                {showGrip && (
                    <span
                        className="cursor-grab text-[var(--text-muted)] hover:text-[var(--text-primary)] touch-none select-none flex items-center"
                        aria-label="Drag to reorder"
                        {...listeners}
                        {...attributes}
                    >
                        <GripDotsIcon />
                    </span>
                )}
            </td>
            <td className="p-3 text-sm font-semibold text-[var(--text-primary)] font-body">
                <span>{label}</span>
                {(item.tile_type === 'transactions' || item.tile_type === 'balance_over_time') && (
                    <label className="ml-3 inline-flex items-center gap-1.5 text-xs font-normal text-[var(--text-muted)] cursor-pointer">
                        <input
                            type="checkbox"
                            aria-label="Show balance"
                            checked={item.show_balance}
                            onChange={(e) => onShowBalanceChange(e.target.checked)}
                        />
                        Show balance
                    </label>
                )}
            </td>
            <td className="p-3 pl-0">
                <div className="flex gap-0.5 justify-end">
                    <button
                        aria-label={`Edit ${label}`}
                        className="sid-icon-btn"
                        onClick={onEdit}
                        title="Edit"
                    >
                        <EditIcon />
                    </button>
                    <button
                        aria-label={`Move ${label} up`}
                        className="sid-icon-btn"
                        onClick={() => onMove('up')}
                        disabled={index === 0}
                        title="Move up"
                    >
                        <ChevronUpIcon />
                    </button>
                    <button
                        aria-label={`Move ${label} down`}
                        className="sid-icon-btn"
                        onClick={() => onMove('down')}
                        disabled={index === totalCount - 1}
                        title="Move down"
                    >
                        <ChevronDownIcon />
                    </button>
                    <button
                        aria-label={`Remove ${label} from dashboard`}
                        className="sid-icon-btn danger"
                        onClick={onRemove}
                        title="Remove from dashboard"
                    >
                        <XIcon />
                    </button>
                </div>
            </td>
        </tr>
    );
}

export default function DashboardSection() {
    const queryClient = useQueryClient();

    const [addAccountId, setAddAccountId] = useState('');
    const [addTileType, setAddTileType] = useState<TileType | ''>('');
    const [addWindowOption, setAddWindowOption] = useState('');
    const [addWeeks, setAddWeeks] = useState('');
    const [editingTile, setEditingTile] = useState<DashboardConfigItem | null>(null);
    const [localConfig, setLocalConfig] = useState<DashboardConfigItem[]>([]);
    const [activeId, setActiveId] = useState<number | null>(null);

    const { data: config = [], isLoading: configLoading } = useQuery({
        queryKey: ['dashboard-config'],
        queryFn: getDashboardConfig,
    });

    useEffect(() => {
        setLocalConfig(config);
    }, [config]);

    const { data: allAccounts = [] } = useQuery({
        queryKey: ['accounts'],
        queryFn: listAccounts,
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard-config'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    };

    const reorderMutation = useMutation({
        mutationFn: (ids: number[]) => reorderDashboard(ids),
        onSuccess: invalidate,
        onError: () => {
            toast.error('Failed to reorder dashboard.');
            setLocalConfig(config);
        },
    });

    const removeMutation = useMutation({
        mutationFn: (tileId: number) => removeFromDashboard(tileId),
        onSuccess: invalidate,
        onError: () => toast.error('Failed to remove tile from dashboard.'),
    });

    const addMutation = useMutation({
        mutationFn: ({ accountId, tileType, timeWindow }: { accountId: number; tileType: TileType; timeWindow?: string }) =>
            addToDashboard(accountId, tileType, timeWindow),
        onSuccess: () => {
            invalidate();
            setAddAccountId('');
            setAddTileType('');
            setAddWindowOption('');
            setAddWeeks('');
        },
        onError: () => toast.error('Failed to add tile to dashboard.'),
    });

    const addCrossAccountMutation = useMutation({
        mutationFn: ({ tileType, timeWindow }: { tileType: TileType; timeWindow?: string }) =>
            addCrossAccountTile(tileType, timeWindow),
        onSuccess: () => {
            invalidate();
            setAddAccountId('');
            setAddTileType('');
            setAddWindowOption('');
            setAddWeeks('');
        },
        onError: () => toast.error('Failed to add tile to dashboard.'),
    });

    const showBalanceMutation = useMutation({
        mutationFn: ({ tileId, showBalance }: { tileId: number; showBalance: boolean }) =>
            updateShowBalance(tileId, showBalance),
        onSuccess: invalidate,
        onError: () => toast.error('Failed to update show balance.'),
    });

    function move(index: number, direction: 'up' | 'down') {
        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        const newConfig = arrayMove(localConfig, index, swapIndex);
        setLocalConfig(newConfig);
        reorderMutation.mutate(newConfig.map((item) => item.id));
    }

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 200, tolerance: 5 },
        }),
    );

    function handleDragStart(event: DragStartEvent) {
        setActiveId(event.active.id as number);
    }

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        setActiveId(null);
        if (!over || active.id === over.id) return;
        const oldIndex = localConfig.findIndex((i) => i.id === active.id);
        const newIndex = localConfig.findIndex((i) => i.id === over.id);
        if (oldIndex === newIndex) return;
        const newConfig = arrayMove(localConfig, oldIndex, newIndex);
        setLocalConfig(newConfig);
        reorderMutation.mutate(newConfig.map((i) => i.id));
    }

    function handleDragCancel() {
        setActiveId(null);
    }

    function resolvedTimeWindow(): string | undefined {
        if (addWindowOption === 'custom_weeks') {
            return isValidWeeks(addWeeks) ? `${addWeeks}w` : undefined;
        }
        return addWindowOption || undefined;
    }

    const isCrossAccountType = addTileType !== '' && CROSS_ACCOUNT_TILE_TYPES.includes(addTileType);
    const isChartType = addTileType === 'balance_over_time' || addTileType === 'totals_by_category' || addTileType === 'net_worth_chart';
    const isIncomeVsExpenseType = addTileType === 'income_vs_expense';
    const needsWindow = isChartType || isIncomeVsExpenseType;
    const timeWindow = resolvedTimeWindow();
    const canAdd =
        addTileType !== '' &&
        (isCrossAccountType || addAccountId !== '') &&
        (!needsWindow || (addWindowOption !== '' && (addWindowOption !== 'custom_weeks' || isValidWeeks(addWeeks))));

    function handleAdd() {
        if (!canAdd || !addTileType) return;
        if (isCrossAccountType) {
            addCrossAccountMutation.mutate({
                tileType: addTileType,
                timeWindow: needsWindow ? timeWindow : undefined,
            });
            return;
        }
        addMutation.mutate({
            accountId: parseInt(addAccountId, 10),
            tileType: addTileType,
            timeWindow: needsWindow ? timeWindow : undefined,
        });
    }

    const activeItem = activeId != null ? localConfig.find((i) => i.id === activeId) : null;
    const showGrip = localConfig.length > 1;

    return (
        <section>
            <div className="flex items-center justify-between mb-6">
                <h2 className="font-display text-[22px] font-bold text-[var(--teak-dark)] m-0">
                    Dashboard
                </h2>
            </div>

            <p className="text-[13px] text-[var(--text-muted)] mb-5">
                Choose which tiles appear on the dashboard and in what order.
            </p>

            {configLoading && (
                <p className="text-[var(--text-muted)] text-sm">Loading…</p>
            )}

            {!configLoading && config.length === 0 && (
                <div className="text-center py-[60px]">
                    <p className="text-[var(--text-muted)] text-[15px] mb-5">
                        No tiles are configured for the dashboard.
                    </p>
                </div>
            )}

            {!configLoading && config.length > 0 && (
                <DndContext
                    sensors={sensors}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragCancel={handleDragCancel}
                >
                    <SortableContext
                        items={localConfig.map((i) => i.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <table className="w-full border-collapse mb-4">
                            <thead>
                                <tr className="[border-bottom:1.5px_solid_var(--border)]">
                                    <th className="w-8" />
                                    <th className="text-left px-3 pt-2 pb-[10px] text-[11px] font-bold tracking-[0.06em] text-[var(--text-muted)] uppercase font-body">
                                        Tile
                                    </th>
                                    <th className="w-[120px]" />
                                </tr>
                            </thead>
                            <tbody>
                                {localConfig.map((item, index) => {
                                    const account = allAccounts.find((a) => a.id === item.account_id);
                                    const name = account?.name ?? `Account ${item.account_id}`;
                                    const label = tileLabel(item, name);
                                    return (
                                        <SortableRow
                                            key={item.id}
                                            item={item}
                                            index={index}
                                            totalCount={localConfig.length}
                                            label={label}
                                            showGrip={showGrip}
                                            onEdit={() => setEditingTile(item)}
                                            onMove={(direction) => move(index, direction)}
                                            onRemove={() => removeMutation.mutate(item.id)}
                                            onShowBalanceChange={(showBalance) =>
                                                showBalanceMutation.mutate({ tileId: item.id, showBalance })
                                            }
                                        />
                                    );
                                })}
                            </tbody>
                        </table>
                    </SortableContext>

                    <DragOverlay>
                        {activeItem && (() => {
                            const account = allAccounts.find((a) => a.id === activeItem.account_id);
                            const name = account?.name ?? `Account ${activeItem.account_id}`;
                            const label = tileLabel(activeItem, name);
                            return (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <tbody>
                                        <tr className="bg-[var(--white)] border-b border-[var(--cream-mid)]"
                                            style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.12)', opacity: 0.95 }}>
                                            <td className="p-3 w-8">
                                                <span className="cursor-grabbing text-[var(--text-muted)] flex items-center">
                                                    <GripDotsIcon />
                                                </span>
                                            </td>
                                            <td className="p-3 text-sm font-semibold text-[var(--text-primary)] font-body">
                                                {label}
                                            </td>
                                            <td className="p-3 pl-0 w-[120px]" />
                                        </tr>
                                    </tbody>
                                </table>
                            );
                        })()}
                    </DragOverlay>
                </DndContext>
            )}

            {!configLoading && allAccounts.length > 0 && (
                <div className="flex flex-wrap items-end gap-3 mt-2">
                    {!isCrossAccountType && (
                        <select
                            aria-label="Account"
                            className={inputCls}
                            value={addAccountId}
                            onChange={(e) => setAddAccountId(e.target.value)}
                        >
                            <option value="" disabled>Account…</option>
                            {allAccounts.map((a) => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                        </select>
                    )}

                    <select
                        aria-label="Tile type"
                        className={inputCls}
                        value={addTileType}
                        onChange={(e) => {
                            setAddTileType(e.target.value as TileType | '');
                            setAddAccountId('');
                            setAddWindowOption('');
                            setAddWeeks('');
                        }}
                    >
                        <option value="" disabled>Tile type…</option>
                        <option value="transactions">Transactions</option>
                        <option value="balance_over_time">Balance over time</option>
                        <option value="totals_by_category">Totals by category</option>
                        <option value="income_vs_expense">Income vs Expense</option>
                        <option value="budget_progress">Budget Progress</option>
                        <option value="net_worth">Net Worth</option>
                        <option value="net_worth_chart">Net Worth Over Time</option>
                    </select>

                    {isChartType && (
                        <select
                            aria-label="Time window"
                            className={inputCls}
                            value={addWindowOption}
                            onChange={(e) => {
                                setAddWindowOption(e.target.value);
                                setAddWeeks('');
                            }}
                        >
                            <option value="" disabled>Time window…</option>
                            {WINDOW_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    )}

                    {isIncomeVsExpenseType && (
                        <select
                            aria-label="Time window"
                            className={inputCls}
                            value={addWindowOption}
                            onChange={(e) => setAddWindowOption(e.target.value)}
                        >
                            <option value="" disabled>Time window…</option>
                            {INCOME_VS_EXPENSE_WINDOW_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    )}

                    {isChartType && addWindowOption === 'custom_weeks' && (
                        <input
                            type="number"
                            aria-label="Number of weeks"
                            className={`${inputCls} w-24`}
                            placeholder="Weeks"
                            min={1}
                            max={52}
                            value={addWeeks}
                            onChange={(e) => setAddWeeks(e.target.value)}
                        />
                    )}

                    <button
                        className="sid-btn sid-btn-ghost sid-btn-sm"
                        onClick={handleAdd}
                        disabled={!canAdd || addMutation.isPending}
                    >
                        {addMutation.isPending ? 'Adding…' : '+ Add tile'}
                    </button>
                </div>
            )}

            {editingTile && (
                <EditTileModal
                    tile={editingTile}
                    accounts={allAccounts}
                    onSave={() => { invalidate(); setEditingTile(null); }}
                    onCancel={() => setEditingTile(null)}
                />
            )}
        </section>
    );
}
