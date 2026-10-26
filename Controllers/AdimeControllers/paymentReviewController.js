// =====================================================================
// ADMIN SIDE — review payment screenshots, approve / reject,
// and see month-wise receipts of every student.
// =====================================================================
const mongoose = require('mongoose');
const User = require('../../Models/users');
const Payment = require('../../Models/paymentModel');
const PaymentSubmission = require('../../Models/paymentSubmissionModel');
const { normalizeUtr, isValidUtr, findUtrOwner } = require('../../utils/utr');
const { refreshAccessFromPayments } = require('../../utils/access');
const { getPaymentConfig } = require('../../utils/paymentConfig');
const { monthKey, monthRange, normalizeLabel } = require('../../utils/months');
const { bankStatusFor } = require('../../utils/bankMatch');
const { createReceipt, emitReceipt, nextReceiptNo } = require('../../utils/receipts');

const USER_FIELDS = 'name enrollmentNo phonenumber fatherPhone room year gender course hostelblock';

const toId = (id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null);

// ---------------------------------------------------------------------
// GET /api/admin/payment-submissions?status=pending|approved|rejected|issues&search=
// ---------------------------------------------------------------------
const listSubmissions = async (req, res) => {
    try {
        const status = String(req.query.status || 'pending').toLowerCase();
        const search = String(req.query.search || '').trim().toLowerCase();
        const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);

        let query = {};
        if (status === 'issues') {
            // Duplicate UTRs + screenshots with any problem + (checked below) pending ones the bank does not confirm
            query = { $or: [{ autoRejected: true }, { 'flags.0': { $exists: true } }, { status: 'pending' }] };
        } else if (['pending', 'approved', 'rejected'].includes(status)) {
            query = { status };
        }

        let items = await PaymentSubmission.find(query)
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate('userId', USER_FIELDS)
            .populate('duplicateOf.userId', 'name enrollmentNo room')
            .select('-detected.rawText -screenshotPublicId')
            .lean();

        // Bank statement check for every request
        const bank = await bankStatusFor(items);
        items = items.map((s) => ({ ...s, bank: bank.get(String(s._id)) || { status: 'not_checked' } }));

        if (status === 'issues') {
            items = items.filter((s) =>
                s.autoRejected || (s.flags || []).length ||
                (s.status === 'pending' && ['not_found', 'amount_low'].includes(s.bank.status)));
        }

        if (search) {
            items = items.filter((s) => {
                const u = s.userId || {};
                return [u.name, u.enrollmentNo, u.phonenumber, u.room, s.utr]
                    .some((v) => String(v || '').toLowerCase().includes(search));
            });
        }

        return res.status(200).json({ success: true, submissions: items });
    } catch (error) {
        console.error('List submissions error:', error);
        return res.status(500).json({ success: false, message: 'Could not load payment requests.' });
    }
};

// ---------------------------------------------------------------------
// GET /api/admin/payment-submissions/counts
// ---------------------------------------------------------------------
const getSubmissionCounts = async (req, res) => {
    try {
        const [pending, approved, rejected, flagged, cleanPending] = await Promise.all([
            PaymentSubmission.countDocuments({ status: 'pending' }),
            PaymentSubmission.countDocuments({ status: 'approved' }),
            PaymentSubmission.countDocuments({ status: 'rejected' }),
            PaymentSubmission.countDocuments({ $or: [{ autoRejected: true }, { 'flags.0': { $exists: true } }] }),
            PaymentSubmission.find({ status: 'pending', autoRejected: { $ne: true }, 'flags.0': { $exists: false } })
                .select('utr expectedAmount detected.paidOn createdAt').lean(),
        ]);
        const bank = await bankStatusFor(cleanPending);
        let bankProblems = 0;
        let verified = 0;
        for (const v of bank.values()) {
            if (['not_found', 'amount_low'].includes(v.status)) bankProblems++;
            if (v.status === 'verified') verified++;
        }
        const issues = flagged + bankProblems;
        return res.status(200).json({ success: true, pending, approved, rejected, issues, verified });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Could not load counts.' });
    }
};

// ---------------------------------------------------------------------
// POST /api/admin/payment-submissions/:id/approve   body: { utr? }
// Saves one Payment per month (same UTR), extends access, appears in Excel.
// ---------------------------------------------------------------------
// Bank messages shown to the admin when approving without bank proof
const BANK_MESSAGES = {
    not_found: 'This UTR is NOT in your bank statement. The screenshot may be edited or fake.',
    amount_low: 'Less money reached your bank than the plan amount.',
    not_checked: 'Not checked with the bank yet. Upload the latest bank / Vyapar statement first.',
};

/**
 * Approves one submission. Used by the Approve button and by "Approve all bank-verified".
 * Returns { ok, httpStatus, code?, message, bank?, accessExpiresAt? }
 */
const approveCore = async (submission, { utr: utrInput, force = false, io = null } = {}) => {
    if (submission.status === 'approved') {
        return { ok: false, httpStatus: 400, message: 'This payment is already approved.' };
    }

    // Admin may correct the UTR before approving
    const utr = utrInput ? normalizeUtr(utrInput) : submission.utr;
    if (!isValidUtr(utr)) {
        return { ok: false, httpStatus: 400, message: 'UTR must be exactly 12 digits.' };
    }

    const owner = await findUtrOwner(utr, { excludeSubmissionId: submission._id });
    if (owner) {
        return {
            ok: false,
            httpStatus: 409,
            message: `Duplicate UTR — already registered for ${owner.name}${owner.enrollmentNo ? ` (${owner.enrollmentNo})` : ''}, ${owner.month}.`,
        };
    }

    // ✅ Bank proof: only approve without asking when the money is really in the bank
    const bank = (await bankStatusFor([{ ...submission.toObject(), utr }])).get(String(submission._id));
    if (bank.status !== 'verified' && !force) {
        return {
            ok: false,
            httpStatus: 409,
            code: 'BANK_NOT_VERIFIED',
            bank,
            message: BANK_MESSAGES[bank.status] +
                (bank.status === 'amount_low' ? ` Bank: ₹${bank.bankAmount}, plan: ₹${submission.expectedAmount}.` : ''),
        };
    }

    const student = await User.findById(submission.userId);
    if (!student) return { ok: false, httpStatus: 404, message: 'Student account no longer exists.' };

        // Stop if any of these months was already paid another way (cash / manual entry)
    const existing = await Payment.find({
        $or: [{ userId: student._id }, { userId: String(student._id) }],
        status: { $regex: /^success$/i },
    }).select('month transactionId').lean();
    const clash = existing.filter(
        (p) => submission.months.map(normalizeLabel).includes(normalizeLabel(p.month)) &&
            normalizeUtr(p.transactionId) !== utr
    );
    if (clash.length) {
        return {
            ok: false,
            httpStatus: 409,
            message: `${clash.map((c) => normalizeLabel(c.month)).join(', ')} is already paid (UTR ${clash[0].transactionId || 'cash'}). Reject this request or reset that month first.`,
        };
    }

    const fineAmount = Number(submission.fineAmount || 0);
    const planAmount = submission.expectedAmount - fineAmount;
    const perMonth = Math.round((planAmount / submission.planMonths) * 100) / 100;
    const paidAt = submission.detected?.paidOn || submission.createdAt || new Date();
    const receiptNo = await nextReceiptNo('upi');

    for (const [index, month] of submission.months.entries()) {
        const label = normalizeLabel(month);
        const prefix = label.split(' ')[0];
        const year = label.split(' ')[1] || '';
        await Payment.findOneAndUpdate(
            {
                $or: [{ userId: student._id }, { userId: String(student._id) }],
                month: { $regex: new RegExp(`^${prefix}\\s*${year}`, 'i') },
            },
            {
                $set: {
                    userId: student._id,
                    amount: perMonth,
                    method: 'online',
                    transactionId: utr,
                    month: label,
                    status: 'Success',
                    paidAt,
                    screenshotUrl: submission.screenshotUrl,
                    submissionId: submission._id,
                    planMonths: submission.planMonths,
                    source: 'screenshot',
                    fine: index === 0 ? fineAmount : 0,
                    receiptNo,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
    }

    submission.utr = utr;
    submission.status = 'approved';
    submission.rejectReason = '';
    submission.reviewedAt = new Date();
    await submission.save();

    const updatedUser = await refreshAccessFromPayments(student._id);

    // ✅ Receipt for the student (shows in app with PAID stamp + notification)
    const receipt = await createReceipt({
        receiptNo,
        userId: student._id,
        mode: 'upi',
        planMonths: submission.planMonths,
        months: submission.months.map(normalizeLabel),
        planAmount,
        fine: fineAmount,
        totalAmount: submission.expectedAmount,
        utr,
        paidAt,
        accessTill: updatedUser?.accessExpiresAt || null,
        submissionId: submission._id,
    });
    emitReceipt(io, receipt, updatedUser?.accessExpiresAt);

    if (io && updatedUser) {
        io.emit('statusUpdated', {
            userId: String(updatedUser._id),
            isApproved: updatedUser.isApproved,
            accessExpiresAt: updatedUser.accessExpiresAt,
        });
        io.emit('paymentReviewed', { userId: String(updatedUser._id), status: 'approved' });
    }

    return {
        ok: true,
        httpStatus: 200,
        message: `Approved ${submission.months.join(', ')} for ${student.name}.`,
        accessExpiresAt: updatedUser?.accessExpiresAt || null,
    };
};

// ---------------------------------------------------------------------
// POST /api/admin/payment-submissions/:id/approve   body: { utr?, force? }
// force=true → admin approves even though the bank statement does not confirm it.
// ---------------------------------------------------------------------
const approveSubmission = async (req, res) => {
    try {
        const id = toId(req.params.id);
        if (!id) return res.status(400).json({ success: false, message: 'Invalid request id.' });

        const submission = await PaymentSubmission.findById(id);
        if (!submission) return res.status(404).json({ success: false, message: 'Payment request not found.' });

        const r = await approveCore(submission, {
            utr: req.body?.utr,
            force: req.body?.force === true || req.body?.force === 'true',
            io: req.io,
        });
        return res.status(r.httpStatus).json({
            success: r.ok,
            code: r.code,
            bank: r.bank,
            message: r.message,
            accessExpiresAt: r.accessExpiresAt || null,
        });
    } catch (error) {
        console.error('Approve submission error:', error);
        return res.status(500).json({ success: false, message: 'Could not approve this payment.' });
    }
};

// ---------------------------------------------------------------------
// POST /api/admin/payment-submissions/:id/reject   body: { reason }
// ---------------------------------------------------------------------
const rejectSubmission = async (req, res) => {
    try {
        const id = toId(req.params.id);
        if (!id) return res.status(400).json({ success: false, message: 'Invalid request id.' });

        const submission = await PaymentSubmission.findById(id);
        if (!submission) return res.status(404).json({ success: false, message: 'Payment request not found.' });
        if (submission.status === 'approved') {
            return res.status(400).json({
                success: false,
                message: 'This payment is already approved. Use "Reset month" in Student Finance to undo it.',
            });
        }

        submission.status = 'rejected';
        submission.rejectReason = String(req.body.reason || 'Invalid payment screenshot').slice(0, 300);
        submission.reviewedAt = new Date();
        await submission.save();

        if (req.io) {
            req.io.emit('paymentReviewed', {
                userId: String(submission.userId),
                status: 'rejected',
                reason: submission.rejectReason,
                months: submission.months,
                utr: submission.utr,
            });
        }

        return res.status(200).json({ success: true, message: 'Payment request rejected.' });
    } catch (error) {
        console.error('Reject submission error:', error);
        return res.status(500).json({ success: false, message: 'Could not reject this payment.' });
    }
};

// ---------------------------------------------------------------------
// GET /api/admin/students/:userId/receipts
// Month-wise payments (with screenshot) + all screenshot submissions.
// ---------------------------------------------------------------------
const getStudentReceipts = async (req, res) => {
    try {
        const id = toId(req.params.userId);
        if (!id) return res.status(400).json({ success: false, message: 'Invalid student id.' });

        const student = await User.findById(id).select(`${USER_FIELDS} accessExpiresAt isApproved`).lean();
        if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

        const payments = await Payment.find({
            $or: [{ userId: id }, { userId: String(id) }],
            status: { $regex: /^success$/i },
        }).lean();
        payments.sort((a, b) => monthKey(b.month) - monthKey(a.month));

        let submissions = await PaymentSubmission.find({ userId: id })
            .sort({ createdAt: -1 })
            .populate('duplicateOf.userId', 'name enrollmentNo room')
            .select('-detected.rawText -screenshotPublicId')
            .lean();

        // Bank statement check for each screenshot (shown in the admin payment dialog)
        const bank = await bankStatusFor(submissions);
        submissions = submissions.map((s) => ({ ...s, bank: bank.get(String(s._id)) || { status: 'not_checked' } }));

        return res.status(200).json({ success: true, student, payments, submissions });
    } catch (error) {
        console.error('Student receipts error:', error);
        return res.status(500).json({ success: false, message: 'Could not load receipts.' });
    }
};

// ---------------------------------------------------------------------
// GET /api/admin/payment-settings — fees + month list for admin dropdowns
// ---------------------------------------------------------------------
const getAdminPaymentSettings = async (req, res) => {
    const config = getPaymentConfig();
    return res.status(200).json({
        success: true,
        upiId: config.upiId,
        payeeName: config.payeeName,
        plans: config.plans,
        months: monthRange(config.firstMonth, 6), // first fee month → 6 months ahead
    });
};

module.exports = {
    approveCore,
    listSubmissions,
    getSubmissionCounts,
    approveSubmission,
    rejectSubmission,
    getStudentReceipts,
    getAdminPaymentSettings,
};
