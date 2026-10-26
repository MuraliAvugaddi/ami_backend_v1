// =====================================================================
// ADMIN — upload bank / Vyapar statement and check screenshots against it.
// =====================================================================
const { BankTransaction, BankStatementUpload } = require('../../Models/bankTransactionModel');
const PaymentSubmission = require('../../Models/paymentSubmissionModel');
const Payment = require('../../Models/paymentModel');
const { parseStatement } = require('../../utils/bankStatement');
const { bankStatusFor } = require('../../utils/bankMatch');
const { approveCore } = require('./paymentReviewController');

const MAX_FILE_BYTES = 7 * 1024 * 1024;

/** Counts pending requests by bank result. */
const pendingSummary = async () => {
    const pending = await PaymentSubmission.find({ status: 'pending' }).select('utr expectedAmount detected.paidOn createdAt').lean();
    const map = await bankStatusFor(pending);
    const summary = { pending: pending.length, verified: 0, amount_low: 0, not_found: 0, not_checked: 0 };
    for (const v of map.values()) summary[v.status]++;
    return summary;
};

// ---------------------------------------------------------------------
// POST /api/admin/bank-statements    body: { fileName, base64 }
// ---------------------------------------------------------------------
const uploadBankStatement = async (req, res) => {
    try {
        const { fileName = 'statement', base64 } = req.body || {};
        if (!base64) return res.status(400).json({ success: false, message: 'Please choose a statement file.' });

        const buffer = Buffer.from(String(base64).replace(/^data:.*?;base64,/, ''), 'base64');
        if (!buffer.length) return res.status(400).json({ success: false, message: 'The file is empty.' });
        if (buffer.length > MAX_FILE_BYTES) {
            return res.status(400).json({ success: false, message: 'File is too big (max 7 MB). Download a shorter date range.' });
        }
        if (/\.pdf$/i.test(fileName) || buffer.slice(0, 4).toString() === '%PDF') {
            return res.status(400).json({ success: false, message: 'PDF is not supported. Download the statement as Excel (.xlsx / .xls) or CSV.' });
        }

        const parsed = parseStatement(buffer);
        if (!parsed.ok) return res.status(400).json({ success: false, message: parsed.message });
        if (!parsed.credits.length) {
            return res.status(400).json({
                success: false,
                message: `Read ${parsed.rowsRead} rows but found no UPI credits with a 12-digit UTR. Check that this is the account where students pay.`,
            });
        }

        const days = parsed.credits.map((c) => c.txnDay).filter(Boolean).sort();
        const upload = await BankStatementUpload.create({
            fileName: String(fileName).slice(0, 120),
            rowsRead: parsed.rowsRead,
            credits: parsed.credits.length,
            fromDay: days[0] || '',
            toDay: days[days.length - 1] || '',
        });

        let added = 0;
        let alreadyHad = 0;
        for (const c of parsed.credits) {
            const r = await BankTransaction.updateOne(
                { utr: c.utr },
                { $setOnInsert: { ...c, statementId: upload._id } },
                { upsert: true }
            );
            if (r.upsertedCount) added++; else alreadyHad++;
        }
        upload.added = added;
        upload.alreadyHad = alreadyHad;
        await upload.save();

        const summary = await pendingSummary();

        return res.status(200).json({
            success: true,
            message: `Statement read: ${parsed.credits.length} UPI credits (${added} new) from ${upload.fromDay || '?'} to ${upload.toDay || '?'}.`,
            upload,
            summary,
        });
    } catch (error) {
        console.error('Bank statement upload error:', error);
        return res.status(500).json({ success: false, message: 'Could not read this statement.' });
    }
};

// ---------------------------------------------------------------------
// GET /api/admin/bank-statements   → last uploads + pending summary
// ---------------------------------------------------------------------
const getBankStatements = async (req, res) => {
    try {
        const [uploads, summary, totalCredits] = await Promise.all([
            BankStatementUpload.find().sort({ createdAt: -1 }).limit(20).lean(),
            pendingSummary(),
            BankTransaction.countDocuments(),
        ]);
        return res.status(200).json({ success: true, uploads, summary, totalCredits });
    } catch (error) {
        console.error('Bank statements error:', error);
        return res.status(500).json({ success: false, message: 'Could not load statements.' });
    }
};

// ---------------------------------------------------------------------
// POST /api/admin/payment-submissions/approve-verified
// Approves every pending request whose UTR + amount is in the bank statement.
// ---------------------------------------------------------------------
const approveAllVerified = async (req, res) => {
    try {
        const pending = await PaymentSubmission.find({ status: 'pending' }).sort({ createdAt: 1 });
        const map = await bankStatusFor(pending);

        let approved = 0;
        const failed = [];
        for (const s of pending) {
            if (map.get(String(s._id))?.status !== 'verified') continue;
            const r = await approveCore(s, { utr: s.utr, force: true, io: req.io });
            if (r.ok) approved++;
            else failed.push({ id: String(s._id), utr: s.utr, message: r.message });
        }

        return res.status(200).json({
            success: true,
            message: approved
                ? `Approved ${approved} bank-verified payment${approved > 1 ? 's' : ''}.`
                : 'No bank-verified payments waiting.',
            approved,
            failed,
            summary: await pendingSummary(),
        });
    } catch (error) {
        console.error('Approve verified error:', error);
        return res.status(500).json({ success: false, message: 'Could not approve payments.' });
    }
};

// ---------------------------------------------------------------------
// GET /api/admin/bank-transactions/unclaimed
// Money received in the bank, but no student has claimed that UTR yet.
// ---------------------------------------------------------------------
const getUnclaimedCredits = async (req, res) => {
    try {
        const txns = await BankTransaction.find().sort({ txnDate: -1 }).limit(500).lean();
        const utrs = txns.flatMap((t) => [t.utr, ...(t.altUtrs || [])]);
        const [subs, pays] = await Promise.all([
            PaymentSubmission.find({ utr: { $in: utrs }, status: { $in: ['pending', 'approved'] } }).select('utr').lean(),
            Payment.find({ transactionId: { $in: utrs } }).select('transactionId').lean(),
        ]);
        const used = new Set([...subs.map((s) => s.utr), ...pays.map((p) => String(p.transactionId))]);
        const unclaimed = txns.filter((t) => ![t.utr, ...(t.altUtrs || [])].some((u) => used.has(u)));
        return res.status(200).json({ success: true, transactions: unclaimed.slice(0, 200) });
    } catch (error) {
        console.error('Unclaimed credits error:', error);
        return res.status(500).json({ success: false, message: 'Could not load bank credits.' });
    }
};

module.exports = { uploadBankStatement, getBankStatements, approveAllVerified, getUnclaimedCredits };
