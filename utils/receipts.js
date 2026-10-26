// =====================================================================
// Creates receipts and tells the student app instantly (Socket.io).
// =====================================================================
const { Receipt, Counter } = require('../Models/receiptModel');
const User = require('../Models/users');
const { nowIST } = require('./months');

/**
 * Cash and UPI receipts have their own number series so they can never be confused:
 *   AMI-CASH-2026-00012   /   AMI-UPI-2026-00045
 */
const nextReceiptNo = async (mode = 'upi') => {
    const year = nowIST().getUTCFullYear();
    const kind = mode === 'cash' ? 'CASH' : 'UPI';
    const c = await Counter.findOneAndUpdate(
        { _id: `receipt-${kind}-${year}` },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
    );
    return `AMI-${kind}-${year}-${String(c.seq).padStart(5, '0')}`;
};

/**
 * @param {object} data { userId, mode, planMonths, months, planAmount, fine, totalAmount, utr, note, paidAt, accessTill, submissionId, receiptNo? }
 */
const createReceipt = async (data) => {
    const user = await User.findById(data.userId).select('name enrollmentNo room').lean();
    return Receipt.create({
        ...data,
        receiptNo: data.receiptNo || (await nextReceiptNo(data.mode)),
        studentName: user?.name || '',
        enrollmentNo: user?.enrollmentNo || '',
        room: user?.room || '',
    });
};

/** Sends the receipt to the student's app (they get a notification + receipt popup). */
const emitReceipt = (io, receipt, accessExpiresAt) => {
    if (!io || !receipt) return;
    const r = receipt.toObject ? receipt.toObject() : receipt;
    io.emit('paymentReceipt', {
        userId: String(r.userId),
        accessExpiresAt: accessExpiresAt || r.accessTill || null,
        receipt: { ...r, _id: String(r._id), userId: String(r.userId) },
    });
};

module.exports = { nextReceiptNo, createReceipt, emitReceipt };
