import { Router } from 'express';
import { getNetWorth, getNetWorthHistory } from './repository';
import { isValidWindow, parseWindowToFromDate } from '../chart/repository';

const router = Router();

router.get('/', (req, res) => {
    const { on_date } = req.query as { on_date?: string };
    if (on_date && !/^\d{4}-\d{2}-\d{2}$/.test(on_date)) {
        res.status(400).json({ error: 'on_date must be YYYY-MM-DD' });
        return;
    }
    res.json(getNetWorth(on_date));
});

router.get('/history', (req, res) => {
    const { window } = req.query as { window?: string };
    if (!window || !isValidWindow(window)) {
        res.status(400).json({ error: 'invalid or missing window parameter' });
        return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const fromDate = parseWindowToFromDate(window);
    res.json(getNetWorthHistory(fromDate, today));
});

export default router;
