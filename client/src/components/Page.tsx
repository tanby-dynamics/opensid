import { Link } from "react-router-dom";
import { WaveIcon } from "./WaveIcon";
import { GearIcon } from "./GearIcon";
import { balanceColor, formatCents } from "../utils/format";

export function Page({ 
    children,
    pageTitle,
    balance = undefined
}: { 
    children: React.ReactNode,
    pageTitle?: string,
    balance?: number | undefined
}) {
    return (
        <div className="flex-1">
            {/* Nav */}
            <header className="bg-[var(--white)] [border-bottom:1.5px_solid_var(--border)] shadow-[0_1px_0_var(--cream-dark)] sticky top-0 z-[100]">
                <div className="max-w-[1100px] mx-auto px-4 sm:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                        <h1 className="font-display text-[22px] sm:text-[26px] font-bold text-[var(--teak-dark)] tracking-[-0.02em] leading-none shrink-0">
                            <a href="/">OpenSid</a>
                        </h1>
                        <WaveIcon />
                        {pageTitle && (
                            <h2 className="font-display text-lg sm:text-xl font-bold text-[var(--teak-dark)] m-0 truncate">
                                {pageTitle}
                            </h2>
                        )}
                    </div>
                    <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                        {balance !== undefined && (
                            <span 
                                className="font-display text-base sm:text-xl font-bold" 
                                style={{ color: balanceColor(balance) }}
                            >
                                {formatCents(balance)}
                            </span>
                        )}
                        <Link to="/search" aria-label="Search" className="opensid-icon-btn">
                            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M9 3a6 6 0 104.472 10.03l3.249 3.248a1 1 0 001.414-1.414l-3.249-3.248A6 6 0 009 3zM5 9a4 4 0 118 0 4 4 0 01-8 0z" clipRule="evenodd" />
                            </svg>
                        </Link>
                        <Link to="/settings" aria-label="Settings" className="opensid-icon-btn">
                            <GearIcon />
                        </Link>
                    </div>
                </div>
                <div className="opensid-header-stripe" />
            </header>
            <main className="max-w-[1100px] mx-auto px-4 sm:px-8 pt-5 sm:pt-[36px] pb-20">
                {children}
            </main>
        </div>
    );
}