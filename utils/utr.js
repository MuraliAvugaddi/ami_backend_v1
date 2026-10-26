// =====================================================================
// UTR helpers — shared by student upload, admin approval and manual entry.
// =====================================================================
const Payment = require('../Models/paymentModel');
const PaymentSubmission = require('../Models/paymentSubmissionModel');

/** Keeps digits only: "UTR: 6991 2542 2656" → "699125422656" */
const normalizeUtr = (value) => String(value || '').replace(/\D/g, '');

/** UPI UTR / RRN numbers are 12 digits. */
const isValidUtr = (value) => /^\d{12}$/.test(normalizeUtr(value));

/**
 * Finds who already used this UTR.
 * Looks at saved payments AND at screenshots that are pending/approved.
 * Returns null if the UTR is free, otherwise { userId, name, month, where }.
 */
const findUtrOwner = async (utrRaw, { excludeUserId = null, excludeSubmissionId = null } = {}) => {
    const utr = normalizeUtr(utrRaw);
    if (!utr) return null;

    const sameUser = (id) => excludeUserId && id && String(id) === String(excludeUserId);

    const payment = await Payment.findOne({
        transactionId: utr,
        status: { $regex: /^success$/i },
    }).populate('userId', 'name enrollmentNo').lean();

    if (payment && !sameUser(payment.userId?._id || payment.userId)) {
        return {
            userId: payment.userId?._id || payment.userId || null,
            name: payment.userId?.name || 'Another student',
            enrollmentNo: payment.userId?.enrollmentNo || '',
            month: payment.month || '',
            where: 'payment',
        };
    }

    const subQuery = { utr, status: { $in: ['pending', 'approved'] } };
    if (excludeSubmissionId) subQuery._id = { $ne: excludeSubmissionId };

    const submission = await PaymentSubmission.findOne(subQuery)
        .populate('userId', 'name enrollmentNo')
        .lean();

    if (submission && !sameUser(submission.userId?._id || submission.userId)) {
        return {
            userId: submission.userId?._id || submission.userId || null,
            name: submission.userId?.name || 'Another student',
            enrollmentNo: submission.userId?.enrollmentNo || '',
            month: (submission.months || []).join(', '),
            where: 'submission',
        };
    }

    // Same student re-uploading a UTR that is already pending → also a duplicate
    if (submission && submission.status === 'pending' && !excludeSubmissionId) {
        return {
            userId: submission.userId?._id || submission.userId || null,
            name: submission.userId?.name || 'You',
            enrollmentNo: submission.userId?.enrollmentNo || '',
            month: (submission.months || []).join(', '),
            where: 'own-pending',
        };
    }

    return null;
};

module.exports = { normalizeUtr, isValidUtr, findUtrOwner };
