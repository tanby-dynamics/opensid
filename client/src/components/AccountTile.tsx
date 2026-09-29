import { Link } from 'react-router-dom';
import type { DashboardTransactionsTile } from '../types/dashboard';
import { formatCents, formatDate, balanceColor } from '../utils/format';
import { Tile } from './Tile';

interface Props {
    account: DashboardTransactionsTile;
    title?: string;
    showBalance: boolean;
    onAddTransaction: (account: DashboardTransactionsTile) => void;
}

export default function AccountTile({ account, title, showBalance, onAddTransaction }: Props) {
    return (
        <Tile accountName={title ?? account.name} accountId={account.account_id}>
            {/* Balance */}
            {showBalance && (
                <div
                    className="font-display text-[28px] font-bold mb-[14px] tracking-[-0.02em]"
                    style={{ color: balanceColor(account.balance_cents) }}
                >
                    {formatCents(account.balance_cents)}
                </div>
            )}

            {/* Recent transactions */}
            {account.recent_transactions.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] italic flex-1">
                    No transactions yet
                </p>
            ) : (
                <ul className="flex-1 flex flex-col gap-[5px] mb-[14px]">
                    {account.recent_transactions.slice(0, 5).map((tx) => (
                        <li key={tx.id} className="flex items-center gap-2 text-xs">
                            <span className="text-[var(--text-muted)] shrink-0 w-20">{formatDate(tx.date)}</span>
                            <span className="flex-1 text-[var(--text-secondary)] overflow-hidden text-ellipsis whitespace-nowrap">{tx.description}</span>
                            <span className="font-semibold shrink-0" style={{ color: balanceColor(tx.amount_cents) }}>{formatCents(tx.amount_cents)}</span>
                        </li>
                    ))}
                </ul>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-2.5 border-t border-[var(--cream-mid)]">
                <Link
                    to={`/accounts/${account.account_id}`}
                    className="bg-transparent border-none cursor-pointer text-xs font-bold text-[var(--teak)] font-body flex items-center gap-1 no-underline"
                >
                    View all &rarr;
                </Link>
                <button
                    onClick={() => onAddTransaction(account)}
                    className="bg-transparent border-none cursor-pointer text-xs font-bold text-[var(--teak)] font-body"
                >
                    + Add transaction
                </button>
            </div>
        </Tile>
    );
}
