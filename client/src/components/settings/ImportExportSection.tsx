import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import axios from 'axios';
import { exportBackup, importBackup } from '../../api/backup';

type Mode = 'merge' | 'wipe';

export default function ImportExportSection() {
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [mode, setMode] = useState<Mode>('merge');
    const [exportLoading, setExportLoading] = useState(false);

    const importMutation = useMutation({
        mutationFn: () => importBackup(selectedFile!, mode),
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            toast.success(
                `Imported ${result.accounts} account${result.accounts !== 1 ? 's' : ''}, ${result.transactions} transaction${result.transactions !== 1 ? 's' : ''}, ${result.attachments} attachment${result.attachments !== 1 ? 's' : ''}.`,
            );
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        },
        onError: (err) => {
            const message =
                axios.isAxiosError(err) && err.response?.data?.error
                    ? (err.response.data as { error: string }).error
                    : 'Import failed.';
            toast.error(message);
        },
    });

    async function handleExport() {
        setExportLoading(true);
        try {
            await exportBackup();
        } catch {
            toast.error('Export failed.');
        } finally {
            setExportLoading(false);
        }
    }

    return (
        <section>
            <h2 className="font-display text-[22px] font-bold text-[var(--teak-dark)] mb-6">
                Import / Export
            </h2>

            {/* Export */}
            <div>
                <span className="text-[13px] font-semibold text-[var(--text-secondary)] font-body mb-1 block">Export</span>
                <p className="text-[13px] text-[var(--text-muted)] font-body mb-4">
                    Download a full backup of all accounts, transactions, and attachments (including deleted records) as a ZIP file.
                </p>
                <button
                    className="opensid-btn opensid-btn-primary"
                    onClick={handleExport}
                    disabled={exportLoading}
                >
                    {exportLoading ? 'Exporting…' : 'Export'}
                </button>
            </div>

            <div className="border-t border-[var(--border)] my-8" />

            {/* Import */}
            <div>
                <span className="text-[13px] font-semibold text-[var(--text-secondary)] font-body mb-1 block">Import</span>
                <p className="text-[13px] text-[var(--text-muted)] font-body mb-4">
                    Restore or merge data from a OpenSid backup ZIP file.
                </p>

                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-[5px]">
                        <label className="opensid-label">Backup file</label>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".zip"
                            className="opensid-input cursor-pointer"
                            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                        />
                    </div>

                    <div className="flex flex-col gap-2.5">
                        <label className="opensid-label">Import mode</label>
                        <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                                type="radio"
                                name="import-mode"
                                value="merge"
                                checked={mode === 'merge'}
                                onChange={() => setMode('merge')}
                                className="mt-0.5"
                            />
                            <span className="text-sm font-body">
                                <strong>Merge</strong> — add imported data alongside existing data. Account names that conflict will be renamed.
                            </span>
                        </label>
                        <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                                type="radio"
                                name="import-mode"
                                value="wipe"
                                checked={mode === 'wipe'}
                                onChange={() => setMode('wipe')}
                                className="mt-0.5"
                            />
                            <span className="text-sm font-body">
                                <strong>Wipe and restore</strong> — delete all existing data and replace with the backup.
                            </span>
                        </label>
                    </div>

                    {mode === 'wipe' && (
                        <div className="bg-[#fff0f0] border border-[var(--red)] rounded-[8px] px-4 py-3 text-[13px] text-[var(--red)] font-body">
                            <strong>Warning:</strong> This will permanently delete all existing accounts, transactions, and attachments before restoring from the backup. This cannot be undone.
                        </div>
                    )}

                    <div>
                        <button
                            className="opensid-btn opensid-btn-primary"
                            disabled={!selectedFile || importMutation.isPending}
                            onClick={() => importMutation.mutate()}
                        >
                            {importMutation.isPending ? 'Importing…' : 'Import'}
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}
