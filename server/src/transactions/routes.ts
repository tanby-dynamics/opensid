import { Router, type Request, type Response } from 'express';
import * as repo from './repository';
import * as tagRepo from '../tags/repository';
import { findById as findAccount } from '../accounts/repository';
import { list as listRules } from '../rules/repository';
import { applyRules } from '../rules/service';

export function parseFilters(query: Record<string, unknown>): repo.TransactionFilters {
    const { keyword, from, to, category, type, amountMin, amountMax, hasAttachment, recurringOnly, tagIds, tagMode, cleared } = query;
    const filters: repo.TransactionFilters = {};
    if (typeof keyword === 'string' && keyword) filters.keyword = keyword;
    if (typeof from === 'string' && from) filters.from = from;
    if (typeof to === 'string' && to) filters.to = to;
    if (typeof category === 'string' && category) filters.category = category;
    if (type === 'income' || type === 'expense') filters.type = type;
    if (typeof amountMin === 'string' && amountMin && !isNaN(Number(amountMin))) {
        filters.amountMin = Number(amountMin);
    }
    if (typeof amountMax === 'string' && amountMax && !isNaN(Number(amountMax))) {
        filters.amountMax = Number(amountMax);
    }
    if (hasAttachment === 'true') filters.hasAttachment = true;
    else if (hasAttachment === 'false') filters.hasAttachment = false;
    if (recurringOnly === 'true') filters.recurringOnly = true;
    if (typeof tagIds === 'string' && tagIds) {
        const ids = tagIds.split(',').map(Number).filter((n) => !isNaN(n) && n > 0);
        if (ids.length > 0) filters.tagIds = ids;
    }
    if (tagMode === 'any' || tagMode === 'all') filters.tagMode = tagMode;
    if (cleared === 'yes' || cleared === 'no') filters.cleared = cleared;
    return filters;
}

export interface SplitRowInput {
    amount?: number;
    category?: string;
    notes?: string;
    tag_ids?: number[];
}

interface ValidatedSplitRow {
    amount_cents: number;
    category: string;
    notes: string | null;
    tag_ids: number[];
}

function formatDollars(cents: number): string {
    return (Math.abs(cents) / 100).toFixed(2);
}

interface SplitParentShape {
    amount_cents: number;
    type: 'income' | 'expense' | 'transfer';
    split_parent_id: number | null;
}

function validateSplits(parent: SplitParentShape, splits: unknown): { error: string; status?: number } | { rows: ValidatedSplitRow[] } {
    if (parent.split_parent_id) {
        return { error: 'This transaction is already a split — split its parent instead', status: 409 };
    }
    if (parent.type === 'transfer') {
        return { error: 'Cannot split a transfer', status: 409 };
    }
    if (!Array.isArray(splits) || splits.length < 2) {
        return { error: 'A split needs at least 2 parts' };
    }

    const rows: ValidatedSplitRow[] = [];
    for (const raw of splits as SplitRowInput[]) {
        if (!raw.category || raw.category.trim() === '') {
            return { error: 'category is required' };
        }
        if (raw.amount === undefined || raw.amount === null || isNaN(Number(raw.amount)) || Number(raw.amount) <= 0) {
            return { error: 'Amount must be greater than zero' };
        }
        rows.push({
            amount_cents: repo.computeAmountCents(Number(raw.amount), parent.type),
            category: raw.category.trim(),
            notes: raw.notes?.trim() || null,
            tag_ids: Array.isArray(raw.tag_ids) ? raw.tag_ids : [],
        });
    }

    const sum = rows.reduce((acc, r) => acc + r.amount_cents, 0);
    if (sum !== parent.amount_cents) {
        const off = formatDollars(sum - parent.amount_cents);
        const target = formatDollars(parent.amount_cents);
        return { error: `Splits must sum to $${target} (off by $${off})` };
    }

    return { rows };
}

function applyValidatedSplits(parentId: number, rows: ValidatedSplitRow[]): repo.Transaction[] {
    const children = repo.applySplits(
        parentId,
        rows.map((r) => ({ amount_cents: r.amount_cents, category: r.category, notes: r.notes })),
    );
    children.forEach((child, i) => {
        if (rows[i].tag_ids.length > 0) {
            tagRepo.setTagsForTransaction(child.id, rows[i].tag_ids);
        }
    });
    return rows.some((r) => r.tag_ids.length > 0) ? repo.findChildren(parentId) : children;
}

const router = Router({ mergeParams: true });

router.get<{ accountId: string }>('/', (req, res) => {
    const accountId = parseInt(req.params.accountId, 10);
    if (!findAccount(accountId)) {
        res.status(404).json({ error: 'account not found' });
        return;
    }

    const filters = parseFilters(req.query);
    res.json(repo.findByAccount(accountId, Object.keys(filters).length > 0 ? filters : undefined));
});

router.post<{ accountId: string }>('/', (req, res) => {
    const accountId = parseInt(req.params.accountId, 10);
    if (!findAccount(accountId)) {
        res.status(404).json({ error: 'account not found' });
        return;
    }

    const { category, description, amount, type, date, notes, recurrence, recurrence_end_date, tag_ids, splits } = req.body as {
        category?: string;
        description?: string;
        amount?: number;
        type?: string;
        date?: string;
        notes?: string;
        recurrence?: string;
        recurrence_end_date?: string;
        tag_ids?: number[];
        splits?: unknown;
    };

    if (!category || category.trim() === '') {
        res.status(400).json({ error: 'category is required' });
        return;
    }
    if (amount === undefined || amount === null || isNaN(Number(amount)) || Number(amount) <= 0) {
        res.status(400).json({ error: 'amount must be a positive number' });
        return;
    }
    if (type !== 'income' && type !== 'expense') {
        res.status(400).json({ error: 'type must be income or expense' });
        return;
    }
    if (!date || date.trim() === '') {
        res.status(400).json({ error: 'date is required' });
        return;
    }

    let validatedSplitRows: ValidatedSplitRow[] | undefined;
    if (splits !== undefined) {
        const result = validateSplits(
            { amount_cents: repo.computeAmountCents(Number(amount), type as 'income' | 'expense'), type: type as 'income' | 'expense', split_parent_id: null },
            splits,
        );
        if ('error' in result) {
            res.status(result.status ?? 400).json({ error: result.error });
            return;
        }
        validatedSplitRows = result.rows;
    }

    const VALID_RECURRENCES = ['daily', 'weekly', 'fortnightly', 'monthly', 'yearly'];
    if (recurrence != null && !VALID_RECURRENCES.includes(recurrence)) {
        res.status(400).json({ error: 'invalid recurrence value' });
        return;
    }
    if (recurrence_end_date) {
        if (recurrence_end_date <= date.trim()) {
            res.status(400).json({ error: 'End date must be after the transaction date' });
            return;
        }
        const today = new Date().toISOString().slice(0, 10);
        if (recurrence_end_date <= today) {
            res.status(400).json({ error: 'End date must be in the future' });
            return;
        }
    }

    const categoryTrimmed = category.trim();
    const transaction = repo.create({
        account_id: accountId,
        category: categoryTrimmed,
        description: description?.trim() || categoryTrimmed,
        amount: Number(amount),
        type,
        date: date.trim(),
        notes: notes?.trim() || undefined,
        recurrence: recurrence as repo.RecurrenceFrequency | undefined,
        recurrence_end_date: recurrence_end_date || undefined,
    });

    // Apply rules for tags and notes prefix (category already set by user — not overridden).
    const ruleResult = applyRules(
        { description: transaction.description, amount_cents: transaction.amount_cents, type: transaction.type, account_id: accountId },
        listRules(),
    );
    const effectiveTagIds = Array.isArray(tag_ids) && tag_ids.length > 0
        ? [...new Set([...tag_ids, ...ruleResult.tagIds])]
        : ruleResult.tagIds;
    if (effectiveTagIds.length > 0) {
        tagRepo.setTagsForTransaction(transaction.id, effectiveTagIds);
    }
    if (ruleResult.notesPrefix) {
        const existing = transaction.notes ?? '';
        if (!existing.startsWith(ruleResult.notesPrefix)) {
            repo.update(transaction.id, { notes: (ruleResult.notesPrefix + (existing ? ' ' + existing : '')).trim() });
        }
    }

    if (validatedSplitRows) {
        applyValidatedSplits(transaction.id, validatedSplitRows);
    }

    res.status(201).json(repo.findById(transaction.id));
});

router.get<{ accountId: string; id: string }>('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const transaction = repo.findById(id);
    if (!transaction || transaction.account_id !== parseInt(req.params.accountId, 10)) {
        res.status(404).json({ error: 'transaction not found' });
        return;
    }
    res.json(transaction);
});

router.get<{ accountId: string; id: string }>('/:id/split', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const transaction = repo.findById(id);
    if (!transaction || transaction.account_id !== parseInt(req.params.accountId, 10)) {
        res.status(404).json({ error: 'transaction not found' });
        return;
    }
    res.json({ children: repo.findChildren(id) });
});

function handleApplySplit(req: Request<{ accountId: string; id: string }>, res: Response) {
    const accountId = parseInt(req.params.accountId, 10);
    const id = parseInt(req.params.id, 10);
    const transaction = repo.findById(id);
    if (!transaction || transaction.account_id !== accountId) {
        res.status(404).json({ error: 'transaction not found' });
        return;
    }

    const { splits } = req.body as { splits?: unknown };
    const result = validateSplits(transaction, splits);
    if ('error' in result) {
        res.status(result.status ?? 400).json({ error: result.error });
        return;
    }

    applyValidatedSplits(id, result.rows);
    res.json({ parent: repo.findById(id), children: repo.findChildren(id) });
}

router.post<{ accountId: string; id: string }>('/:id/split', handleApplySplit);
router.put<{ accountId: string; id: string }>('/:id/split', handleApplySplit);

router.delete<{ accountId: string; id: string }>('/:id/split', (req, res) => {
    const accountId = parseInt(req.params.accountId, 10);
    const id = parseInt(req.params.id, 10);
    const transaction = repo.findById(id);
    if (!transaction || transaction.account_id !== accountId) {
        res.status(404).json({ error: 'transaction not found' });
        return;
    }
    if (transaction.split_count === 0) {
        res.status(404).json({ error: 'this transaction has no split to remove' });
        return;
    }

    const parent = repo.unsplit(id);
    res.json(parent);
});

router.put<{ accountId: string; id: string }>('/:id', (req, res) => {
    const accountId = parseInt(req.params.accountId, 10);
    const id = parseInt(req.params.id, 10);

    const existing = repo.findById(id);
    if (!existing || existing.account_id !== accountId) {
        res.status(404).json({ error: 'transaction not found' });
        return;
    }

    if (existing.transfer_group_id) {
        res.status(409).json({ error: 'Cannot edit a transfer transaction directly. Use PUT /api/transfers/:groupId instead.' });
        return;
    }

    const { category, description, amount, type, date, notes, account_id, recurrence, recurrence_end_date, scope, tag_ids } = req.body as {
        category?: string | null;
        description?: string;
        amount?: number;
        type?: string;
        date?: string;
        notes?: string | null;
        account_id?: number;
        recurrence?: string | null;
        recurrence_end_date?: string | null;
        scope?: string;
        tag_ids?: number[];
    };

    if (category !== undefined && (category === null || category.trim() === '')) {
        res.status(400).json({ error: 'category cannot be empty' });
        return;
    }
    if (amount !== undefined && (isNaN(Number(amount)) || Number(amount) <= 0)) {
        res.status(400).json({ error: 'amount must be a positive number' });
        return;
    }
    if (type !== undefined && type !== 'income' && type !== 'expense') {
        res.status(400).json({ error: 'type must be income or expense' });
        return;
    }
    if (date !== undefined && date.trim() === '') {
        res.status(400).json({ error: 'date cannot be empty' });
        return;
    }

    const categoryTrimmed = typeof category === 'string' ? category.trim() : undefined;
    const effectiveDescription = description !== undefined
        ? (description.trim() || (categoryTrimmed ?? existing.category ?? existing.description))
        : undefined;

    const updateInput: repo.UpdateTransactionInput = {
        account_id: account_id !== undefined ? Number(account_id) : undefined,
        category: categoryTrimmed !== undefined ? (categoryTrimmed || null) : undefined,
        description: effectiveDescription,
        amount: amount !== undefined ? Number(amount) : undefined,
        type: type as 'income' | 'expense' | undefined,
        date: date?.trim(),
        notes: notes !== undefined ? (notes?.trim() || null) : undefined,
    };
    if ('recurrence' in req.body) updateInput.recurrence = (recurrence ?? null) as repo.RecurrenceFrequency | null;
    if ('recurrence_end_date' in req.body) updateInput.recurrence_end_date = recurrence_end_date ?? null;

    let updated = repo.update(id, updateInput);

    if (!updated) {
        res.status(404).json({ error: 'transaction not found' });
        return;
    }

    if ('tag_ids' in req.body && Array.isArray(tag_ids)) {
        tagRepo.setTagsForTransaction(id, tag_ids);
        updated = repo.findById(id)!;
    }

    // "This and all future" scope: update the template and soft-delete future generated instances
    if (scope === 'future') {
        const templateId = existing.recurrence_source_id ?? existing.id;
        // Update the template with the same field changes
        const templateInput: repo.UpdateTransactionInput = { ...updateInput };
        delete templateInput.date; // don't move the template's date
        repo.update(templateId, templateInput);
        // Soft-delete all generated transactions after the selected one's date
        repo.softDeleteFutureOccurrences(templateId, existing.date);
    }

    res.json(updated);
});

router.put<{ accountId: string; id: string }>('/:id/cleared', (req, res) => {
    const accountId = parseInt(req.params.accountId, 10);
    const id = parseInt(req.params.id, 10);
    const existing = repo.findById(id);
    if (!existing || existing.account_id !== accountId) {
        res.status(404).json({ error: 'transaction not found' });
        return;
    }
    const { cleared } = req.body as { cleared?: boolean };
    if (cleared === undefined || typeof cleared !== 'boolean') {
        res.status(400).json({ error: 'cleared must be a boolean' });
        return;
    }
    if (cleared) {
        repo.clear(id);
    } else {
        repo.unclear(id);
    }
    res.json(repo.findById(id));
});

router.put<{ accountId: string; id: string }>('/:id/tags', (req, res) => {
    const accountId = parseInt(req.params.accountId, 10);
    const id = parseInt(req.params.id, 10);
    const existing = repo.findById(id);
    if (!existing || existing.account_id !== accountId) {
        res.status(404).json({ error: 'transaction not found' });
        return;
    }
    const { tag_ids } = req.body as { tag_ids?: unknown };
    if (!Array.isArray(tag_ids) || !tag_ids.every((x) => typeof x === 'number')) {
        res.status(400).json({ error: 'tag_ids must be an array of numbers' });
        return;
    }
    tagRepo.setTagsForTransaction(id, tag_ids as number[]);
    res.json(repo.findById(id));
});

router.delete<{ accountId: string }>('/bulk', (req, res) => {
    const accountId = parseInt(req.params.accountId, 10);
    if (!findAccount(accountId)) {
        res.status(404).json({ error: 'account not found' });
        return;
    }

    const { ids } = req.body as { ids?: unknown };
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'number')) {
        res.status(400).json({ error: 'ids must be a non-empty array of numbers' });
        return;
    }

    const ok = repo.bulkSoftDelete(ids as number[], accountId);
    if (!ok) {
        res.status(400).json({ error: 'one or more transactions not found or do not belong to this account' });
        return;
    }
    res.status(204).send();
});

router.delete<{ accountId: string; id: string }>('/:id', (req, res) => {
    const accountId = parseInt(req.params.accountId, 10);
    const id = parseInt(req.params.id, 10);

    const existing = repo.findById(id);
    if (!existing || existing.account_id !== accountId) {
        res.status(404).json({ error: 'transaction not found' });
        return;
    }

    if (existing.transfer_group_id) {
        res.status(409).json({ error: 'Cannot delete one side of a transfer. Use DELETE /api/transfers/:groupId to delete the pair.' });
        return;
    }

    const { scope } = req.body as { scope?: string };

    if (scope === 'future') {
        const templateId = existing.recurrence_source_id ?? existing.id;
        repo.softDeleteFutureOccurrences(templateId, existing.date);
        if (existing.recurrence_source_id) {
            // It's a generated transaction — update template end date to day before this one
            const [y, m, d] = existing.date.split('-').map(Number);
            const prev = new Date(y, m - 1, d - 1);
            const prevStr = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
            repo.updateTemplateEndDate(templateId, prevStr);
        } else {
            // It IS the template — soft-delete the template itself
            repo.softDelete(id);
        }
    } else {
        repo.softDelete(id);
    }

    res.status(204).send();
});

export default router;
