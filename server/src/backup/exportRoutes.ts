import { Router } from 'express';
import AdmZip from 'adm-zip';
import { exportAll } from './repository';

const router = Router();

function formatTimestamp(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

router.get('/', (_req, res) => {
    const payload = exportAll();
    const json = JSON.stringify(payload, null, 2);

    const zip = new AdmZip();
    zip.addFile('backup.json', Buffer.from(json, 'utf-8'));
    const zipBuffer = zip.toBuffer();

    const filename = `opensid-backup-${formatTimestamp(new Date())}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(zipBuffer);
});

export default router;
