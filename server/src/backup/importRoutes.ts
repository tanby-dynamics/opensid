import { Router } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { importMerge, importWipe } from './repository';
import type { BackupPayload } from './types';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

function isValidPayload(obj: unknown): obj is BackupPayload {
    if (typeof obj !== 'object' || obj === null) return false;
    const p = obj as Record<string, unknown>;
    return (
        typeof p.version === 'number' &&
        Array.isArray(p.accounts) &&
        Array.isArray(p.transactions) &&
        Array.isArray(p.attachments)
    );
}

router.post('/import', upload.single('file'), (req, res) => {
    const file = req.file;
    if (!file) {
        res.status(400).json({ error: 'No file provided' });
        return;
    }

    const isZip =
        file.mimetype === 'application/zip' ||
        file.mimetype === 'application/x-zip-compressed' ||
        file.originalname.toLowerCase().endsWith('.zip');
    if (!isZip) {
        res.status(400).json({ error: 'File must be a ZIP archive (.zip)' });
        return;
    }

    const mode = (req.body as Record<string, string>).mode;
    if (mode !== 'merge' && mode !== 'wipe') {
        res.status(400).json({ error: 'mode must be "merge" or "wipe"' });
        return;
    }

    let zip: AdmZip;
    try {
        zip = new AdmZip(file.buffer);
    } catch {
        res.status(422).json({ error: 'Invalid backup: could not read ZIP file' });
        return;
    }

    const entry = zip.getEntry('backup.json');
    if (!entry) {
        res.status(422).json({ error: 'Invalid backup: missing backup.json' });
        return;
    }

    let payload: unknown;
    try {
        payload = JSON.parse(entry.getData().toString('utf-8'));
    } catch {
        res.status(422).json({ error: 'Invalid backup: could not parse backup.json' });
        return;
    }

    const version = (payload as Record<string, unknown>).version;
    if (typeof version !== 'number' || version < 1 || version > 7) {
        res.status(422).json({ error: 'Invalid backup: unsupported version' });
        return;
    }

    if (!isValidPayload(payload)) {
        res.status(422).json({ error: 'Invalid backup: missing required data' });
        return;
    }

    // Normalise v1 backups that lack the budgets array
    if (!Array.isArray((payload as unknown as Record<string, unknown>).budgets)) {
        (payload as unknown as Record<string, unknown>).budgets = [];
    }

    for (const att of payload.attachments) {
        if (typeof att.data !== 'string') {
            res.status(422).json({ error: `Invalid backup: attachment data is corrupt (attachment id: ${att.id})` });
            return;
        }
        try {
            Buffer.from(att.data, 'base64');
        } catch {
            res.status(422).json({ error: `Invalid backup: attachment data is corrupt (attachment id: ${att.id})` });
            return;
        }
    }

    try {
        const result = mode === 'merge' ? importMerge(payload) : importWipe(payload);
        res.json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: `Import failed: ${message}` });
    }
});

export default router;
