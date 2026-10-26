// =====================================================================
// Checks screenshot payments against the uploaded bank statements.
//
//   verified     → UTR is in the bank statement with the right amount ✅
//   amount_low   → UTR is in the bank, but less money came in ❌
//   not_found    → statement for that day is uploaded, UTR is NOT there ❌ (fake / edited)
//   not_checked  → no statement uploaded yet for that day ⏳
// =====================================================================
const { BankTransaction, BankStatementUpload } = require('../Models/bankTransactionModel');
const { dayKey } = require('./bankStatement');

const GRACE_MS = 30 * 60 * 1000; // bank can take a few minutes to show a UPI credit

/**
 * @param {Array} submissions  PaymentSubmission docs (lean or not)
 * @returns {Promise<Map<string, {status, bankAmount, bankDay, narration}>>}  key = submission _id
 */
const bankStatusFor = async (submissions) => {
    const result = new Map();
    if (!submissions.length) return result;

    const utrs = [...new Set(submissions.map((s) => s.utr).filter(Boolean))];
    const [txns, uploads] = await Promise.all([
        BankTransaction.find({ $or: [{ utr: { $in: utrs } }, { altUtrs: { $in: utrs } }] }).lean(),
        BankStatementUpload.find({ fromDay: { $ne: '' }, toDay: { $ne: '' } }).select('fromDay toDay createdAt').lean(),
    ]);

    const byUtr = new Map();
    for (const t of txns) {
        byUtr.set(t.utr, t);
        for (const a of t.altUtrs || []) if (!byUtr.has(a)) byUtr.set(a, t);
    }

    // A statement proves "not paid" only if it covers that day AND was downloaded after the payment
    // (a statement that ends on a LATER day is always complete for this day).
    const covers = (day, paidAt) => uploads.some((u) =>
        u.fromDay <= day && day <= u.toDay &&
        (u.toDay > day || new Date(u.createdAt).getTime() >= new Date(paidAt).getTime() + GRACE_MS));

    for (const s of submissions) {
        const txn = byUtr.get(s.utr);
        let status;
        if (txn) {
            status = txn.amount + 1 >= Number(s.expectedAmount || 0) ? 'verified' : 'amount_low';
        } else {
            const submittedAt = s.createdAt || new Date();
            const day = dayKey(s.detected?.paidOn || submittedAt);
            status = day && covers(day, submittedAt) ? 'not_found' : 'not_checked';
        }
        result.set(String(s._id), {
            status,
            bankAmount: txn ? txn.amount : null,
            bankDay: txn ? txn.txnDay : '',
            narration: txn ? txn.narration : '',
        });
    }
    return result;
};

module.exports = { bankStatusFor };
