import { Router } from 'express';
import { findById } from '../accounts/repository';
import { computeForecast } from './service';

const router = Router({ mergeParams: true });

const VALID_DAYS = [14, 30, 60, 90];

router.get('/', (req, res) => {
    const accountId = parseInt((req.params as { id: string }).id, 10);
    const account = findById(accountId);
    if (!account) {
        res.status(404).json({ error: 'Account not found' });
        return;
    }

    const { days, include_discretionary } = req.query as { days?: string; include_discretionary?: string };
    const daysNum = days ? parseInt(days, 10) : 30;
    if (!VALID_DAYS.includes(daysNum)) {
        res.status(400).json({ error: 'Invalid window' });
        return;
    }

    const includeDiscretionary = include_discretionary === 'true';
    const payload = computeForecast({ accountId, days: daysNum, includeDiscretionary });
    res.json(payload);
});

export default router;
