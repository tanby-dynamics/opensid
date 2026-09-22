interface Props {
    action: 'edit' | 'delete';
    onJustThis: () => void;
    onFuture: () => void;
    onCancel: () => void;
}

export default function RecurrenceScopeDialog({ action, onJustThis, onFuture, onCancel }: Props) {
    const verb = action === 'delete' ? 'Delete' : 'Edit';

    return (
        <div className="opensid-modal-overlay anim-fade" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
            <div className="opensid-modal anim-slide-up" style={{ maxWidth: '380px' }}>
                <div className="opensid-modal-trim" />
                <div className="opensid-modal-body">
                    <h2 className="opensid-modal-title">{verb} recurring transaction</h2>
                    <p className="text-sm text-[var(--text-secondary)] mb-5">
                        This is part of a recurring series. What would you like to {action === 'delete' ? 'delete' : 'edit'}?
                    </p>
                    <div className="flex flex-col gap-2">
                        <button
                            type="button"
                            className="opensid-btn opensid-btn-secondary w-full text-left"
                            onClick={onJustThis}
                        >
                            Just this one
                        </button>
                        <button
                            type="button"
                            className="opensid-btn opensid-btn-secondary w-full text-left"
                            onClick={onFuture}
                        >
                            This and all future occurrences
                        </button>
                        <button
                            type="button"
                            className="opensid-btn opensid-btn-ghost w-full"
                            onClick={onCancel}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
