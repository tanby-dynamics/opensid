import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import './db';
import { generateDueOccurrences } from './recurrence/service';
import accountRoutes from './accounts/routes';
import transactionRoutes from './transactions/routes';
import transactionSearchRoutes, { bulkTagRouter } from './transactions/searchRoutes';
import tagRoutes from './tags/routes';
import reportRoutes from './reports/routes';
import { txAttachmentRouter, attachmentRouter } from './attachments/routes';
import dashboardRoutes from './dashboard/routes';
import dashboardConfigRoutes from './dashboard-config/routes';
import exportRoutes from './export/routes';
import importRoutes from './import/routes';
import categoriesRoutes from './categories/routes';
import backupExportRoutes from './backup/exportRoutes';
import backupImportRoutes from './backup/importRoutes';
import chartRoutes from './chart/routes';
import budgetRoutes from './budgets/routes';
import savedViewRoutes from './saved-views/routes';
import transferRoutes from './transfers/routes';
import reconciliationRoutes from './reconciliations/routes';
import rulesRoutes from './rules/routes';
import netWorthRoutes from './net-worth/routes';

const app = express();
const PORT = 3000;

app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
});

app.use('/api/rules', rulesRoutes);
app.use('/api/net-worth', netWorthRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/transactions/bulk-tag', bulkTagRouter);
app.use('/api/transactions/search', transactionSearchRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/saved-views', savedViewRoutes);
app.use('/api/backup', backupExportRoutes);
app.use('/api/backup', backupImportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/dashboard-config', dashboardConfigRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/accounts/:id/export', exportRoutes);
app.use('/api/accounts/:id/chart', chartRoutes);
app.use('/api/accounts/:accountId/budgets', budgetRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/accounts/:accountId/transactions/import', importRoutes);
app.use('/api/accounts/:accountId/reconciliations', reconciliationRoutes);
app.use('/api/accounts/:accountId/transactions', transactionRoutes);
app.use('/api/transactions/:txId/attachments', txAttachmentRouter);
app.use('/api/attachments', attachmentRouter);

const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// Generate any missed occurrences on startup, then daily at midnight
generateDueOccurrences();
cron.schedule('0 0 * * *', generateDueOccurrences);

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
