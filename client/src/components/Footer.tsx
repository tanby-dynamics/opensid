export default function Footer() {
    return (
        <footer className="fixed bottom-0 left-0 right-0 py-4 text-center text-[12px] font-body text-[var(--text-muted)] bg-[var(--cream)] border-t border-[var(--border)] z-[50]">
            <div className="flex items-center justify-center gap-4">
                <a
                    href="https://opensid.tanbydynamics.co"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[var(--text-secondary)] transition-colors"
                >
                    opensid.tanbydynamics.co
                </a>
                <span className="text-[var(--cream-dark)]">·</span>
                <a
                    href="https://github.com/tanby-dynamics/opensid"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[var(--text-secondary)] transition-colors"
                >
                    GitHub
                </a>
                <span className="text-[var(--cream-dark)]">·</span>
                <span>{__APP_VERSION__}</span>
            </div>
        </footer>
    );
}
