import axios from 'axios';

export interface ImportResult {
    accounts: number;
    transactions: number;
    attachments: number;
}

export async function exportBackup(): Promise<void> {
    const response = await axios.get('/api/backup', { responseType: 'blob' });

    const cd = (response.headers['content-disposition'] as string | undefined) ?? '';
    const match = cd.match(/filename="?([^";\n]+)"?/);
    const filename = match?.[1] ?? 'opensid-backup.zip';

    const url = URL.createObjectURL(response.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export async function importBackup(file: File, mode: 'merge' | 'wipe'): Promise<ImportResult> {
    const form = new FormData();
    form.append('file', file);
    form.append('mode', mode);
    const { data } = await axios.post<ImportResult>('/api/backup/import', form);
    return data;
}
