// =====================================================================
// STUDENT SIDE — pay by UPI QR and upload the payment screenshot
// =====================================================================
const User = require('../../Models/users');
const Payment = require('../../Models/paymentModel');
const PaymentSubmission = require('../../Models/paymentSubmissionModel');
const { getPaymentConfig, findPlan } = require('../../utils/paymentConfig');
const { uploadBase64Image } = require('../../utils/cloudinary');
const { normalizeUtr, isValidUtr, findUtrOwner } = require('../../utils/utr');
const { getPaidMonths } = require('../../utils/access');
const {
    currentMonthParts, monthKey, consecutiveMonths, normalizeLabel, nowIST,
} = require('../../utils/months');
const { computeFeeStatus, getPendingMonths, firstOpenMonth } = require('../../utils/feeStatus');
const { Receipt } = require('../../Models/receiptModel');

// ---------------------------------------------------------------------
// GET /api/payments/config
// Everything the "Pay Mess Fee" screen needs.
// ---------------------------------------------------------------------
const getPaymentScreenData = async (req, res) => {
    try {
        const userId = req.user.id;
        const config = getPaymentConfig();
        const user = await User.findById(userId).select('name enrollmentNo accessExpiresAt isApproved').lean();
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

        const paidMonths = await getPaidMonths(userId);
        const pendingMonths = await getPendingMonths(userId);
        const blocked = new Set([...paidMonths, ...pendingMonths]);
        const startMonth = firstOpenMonth(blocked);

        // Late fine only applies when this payment starts with the current (unpaid) month
        const fee = await computeFeeStatus(userId);
        const fine = fee && fee.currentMonth === startMonth ? fee.fine : 0;

        const plans = config.plans.map((p) => ({
            ...p,
            months: p.months,
            monthLabels: consecutiveMonths(startMonth, p.months),
            fine,
            total: p.amount + fine,
            fullPrice: config.plans[0].amount * p.months,              // for "you save ₹…"
        }));

        const submissions = await PaymentSubmission.find({ userId })
            .sort({ createdAt: -1 })
            .limit(20)
            .select('-detected.rawText -screenshotPublicId')
            .lean();

        return res.status(200).json({
            success: true,
            upiId: config.upiId,
            payeeName: config.payeeName,
            payeeKeyword: config.payeeKeyword,
            qrImageUrl: config.qrImageUrl,
            maxScreenshotAgeDays: config.maxScreenshotAgeDays,
            startMonth,
            plans,
            paidMonths,
            pendingMonths,
            accessExpiresAt: user.accessExpiresAt,
            isApproved: user.isApproved,
            fine,
            fee,
            submissions,
        });
    } catch (error) {
        console.error('Payment config error:', error);
        return res.status(500).json({ success: false, message: 'Could not load payment details.' });
    }
};

// ---------------------------------------------------------------------
// POST /api/payments/submit
// body: { planMonths, startMonth, utr, imageBase64, detected: { utr, amount, payeeMatched, paidOn, rawText } }
// ---------------------------------------------------------------------
const submitPaymentScreenshot = async (req, res) => {
    try {
        const userId = req.user.id;
        const config = getPaymentConfig();
        const { planMonths, startMonth, imageBase64 } = req.body;
        const detected = req.body.detected || {};
        const io = req.io;

        // ---------- 1. Basic checks ----------
        const plan = findPlan(planMonths);
        if (!plan) {
            return res.status(400).json({ success: false, message: 'Please choose a valid plan (1, 3 or 6 months).' });
        }
        if (!imageBase64 || String(imageBase64).length < 1000) {
            return res.status(400).json({ success: false, message: 'Please upload the payment screenshot.' });
        }
        if (String(imageBase64).length > 9 * 1024 * 1024) {
            return res.status(400).json({ success: false, message: 'Screenshot is too large. Please upload a smaller image.' });
        }

        const utr = normalizeUtr(req.body.utr);
        if (!isValidUtr(utr)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter the correct 12-digit UTR number from your payment screenshot.',
            });
        }

        const user = await User.findById(userId).select('name enrollmentNo').lean();
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

        // ---------- 2. Months for this plan ----------
        const months = consecutiveMonths(normalizeLabel(startMonth), plan.months);
        if (!months.length) {
            return res.status(400).json({ success: false, message: 'Invalid starting month.' });
        }

        // Not allowed to start more than 1 month in the past
        const thisMonthKey = monthKey(currentMonthParts());
        if (monthKey(months[0]) < thisMonthKey - 1) {
            return res.status(400).json({ success: false, message: `You cannot pay for ${months[0]} now.` });
        }

        const paidMonths = await getPaidMonths(userId);
        const alreadyPaid = months.filter((m) => paidMonths.includes(m));
        if (alreadyPaid.length) {
            return res.status(400).json({
                success: false,
                message: `${alreadyPaid.join(', ')} is already paid. Please refresh and try again.`,
            });
        }

        const pendingMonths = await getPendingMonths(userId);
        const alreadyPending = months.filter((m) => pendingMonths.includes(m));
        if (alreadyPending.length) {
            return res.status(400).json({
                success: false,
                message: `Your payment for ${alreadyPending.join(', ')} is already under review. Please wait for the admin.`,
            });
        }

        // Late fine (worked out on the server, the app cannot change it)
        const fee = await computeFeeStatus(userId);
        const fineAmount = fee && fee.currentMonth === months[0] ? fee.fine : 0;
        const expectedAmount = plan.amount + fineAmount;

        // ---------- 3. Upload screenshot ----------
        const now = nowIST();
        const folder = `ami-payments/${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
        const safeEnroll = String(user.enrollmentNo || userId).replace(/[^a-zA-Z0-9]/g, '');
        const { url, publicId } = await uploadBase64Image(imageBase64, folder, `${safeEnroll}_${utr}`);

        // ---------- 4. Automatic checks ----------
        const flags = [];
        const rawText = String(detected.rawText || '').slice(0, 4000);
        const rawUpper = rawText.toUpperCase();
        const rawDigits = rawText.replace(/\D/g, '');

        const detectedAmount = detected.amount != null && detected.amount !== '' ? Number(detected.amount) : null;
        if (detectedAmount == null || Number.isNaN(detectedAmount)) flags.push('AMOUNT_NOT_FOUND');
        else if (Math.round(detectedAmount) < Math.round(expectedAmount)) flags.push('AMOUNT_MISMATCH');

        const keyword = config.payeeKeyword.toUpperCase();
        const upiUser = config.upiId.split('@')[0].toUpperCase();
        const payeeMatched = rawText
            ? rawUpper.includes(keyword) || rawUpper.replace(/\s/g, '').includes(upiUser.replace(/\s/g, ''))
            : detected.payeeMatched === true;
        if (!payeeMatched) flags.push('PAYEE_MISMATCH');

        let paidOn = detected.paidOn ? new Date(detected.paidOn) : null;
        if (paidOn && Number.isNaN(paidOn.getTime())) paidOn = null;
        if (!paidOn) {
            flags.push('DATE_NOT_FOUND');
        } else {
            const ageDays = (Date.now() - paidOn.getTime()) / (24 * 60 * 60 * 1000);
            if (ageDays > config.maxScreenshotAgeDays || ageDays < -1) flags.push('DATE_OLD');
        }

        if (rawText && !rawDigits.includes(utr)) flags.push('UTR_NOT_IN_IMAGE');
        const detectedUtr = normalizeUtr(detected.utr);
        if (detectedUtr && detectedUtr !== utr) flags.push('UTR_EDITED');

        // ---------- 5. Duplicate UTR → auto reject but keep record for admin ----------
        const owner = await findUtrOwner(utr);
        const baseDoc = {
            userId,
            planMonths: plan.months,
            months,
            expectedAmount,
            fineAmount,
            utr,
            screenshotUrl: url,
            screenshotPublicId: publicId,
            detected: {
                utr: detectedUtr,
                amount: detectedAmount,
                payeeMatched,
                paidOn,
                rawText,
            },
        };

        if (owner) {
            const isOwnPending = owner.where === 'own-pending' ||
                (owner.where === 'submission' && String(owner.userId) === String(userId));
            // Same student re-using a UTR that is already saved for him (e.g. October already paid)
            const isOwnPaid = owner.where === 'payment' && String(owner.userId) === String(userId);
            const dup = await PaymentSubmission.create({
                ...baseDoc,
                flags: ['DUPLICATE_UTR', ...flags],
                duplicateOf: { userId: owner.userId, name: owner.name, month: owner.month },
                status: 'rejected',
                autoRejected: true,
                rejectReason: isOwnPending
                    ? 'This UTR is already submitted and waiting for review.'
                    : isOwnPaid
                        ? `Same UTR already saved for this student (${owner.month}).`
                        : `Duplicate UTR — already registered for ${owner.name} (${owner.month}).`,
                reviewedAt: new Date(),
            });
            if (io) io.emit('paymentSubmitted', { submissionId: dup._id, status: 'rejected' });

            return res.status(409).json({
                success: false,
                code: 'DUPLICATE_UTR',
                message: isOwnPending
                    ? 'You have already submitted this UTR. Please wait for the admin to verify it.'
                    : isOwnPaid
                    ? `This UTR is already used for your ${owner.month} payment. Please upload the screenshot of your new payment.`
                    : 'This UTR number is already registered. One payment screenshot can be used only once. Contact the mess office if you think this is a mistake.',
            });
        }

        const submission = await PaymentSubmission.create({ ...baseDoc, flags, status: 'pending' });
        if (io) io.emit('paymentSubmitted', { submissionId: submission._id, status: 'pending' });

        const warnings = [];
        if (flags.includes('AMOUNT_MISMATCH')) warnings.push(`Amount on screenshot is less than ₹${expectedAmount}.`);
        if (flags.includes('PAYEE_MISMATCH')) warnings.push(`Payment does not look like it was made to ${config.payeeName}.`);
        if (flags.includes('DATE_OLD')) warnings.push('Screenshot date looks old.');

        return res.status(201).json({
            success: true,
            message: 'Screenshot submitted. The mess admin will verify it and activate your plan.',
            warnings,
            submission: {
                _id: submission._id,
                months: submission.months,
                planMonths: submission.planMonths,
                expectedAmount: submission.expectedAmount,
                fineAmount: submission.fineAmount,
                utr: submission.utr,
                status: submission.status,
                flags: submission.flags,
                screenshotUrl: submission.screenshotUrl,
                createdAt: submission.createdAt,
            },
        });
    } catch (error) {
        console.error('Submit payment screenshot error:', error);
        return res.status(500).json({
            success: false,
            message: error.message?.includes('Cloudinary')
                ? error.message
                : 'Could not submit the screenshot. Please try again.',
        });
    }
};

// ---------------------------------------------------------------------
// GET /api/payments/my-submissions
// ---------------------------------------------------------------------
const getMySubmissions = async (req, res) => {
    try {
        const submissions = await PaymentSubmission.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(50)
            .select('-detected.rawText -screenshotPublicId')
            .lean();
        return res.status(200).json({ success: true, submissions });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Could not load your submissions.' });
    }
};

// ---------------------------------------------------------------------
// GET /api/payments/my-receipts — month-wise paid list with screenshots
// ---------------------------------------------------------------------
const getMyReceipts = async (req, res) => {
    try {
        const payments = await Payment.find({ userId: req.user.id, status: { $regex: /^success$/i } })
            .select('month amount transactionId method paidAt screenshotUrl planMonths source')
            .lean();
        payments.sort((a, b) => monthKey(b.month) - monthKey(a.month));
        return res.status(200).json({ success: true, receipts: payments });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Could not load receipts.' });
    }
};

// ---------------------------------------------------------------------
// GET /api/payments/status — used by the app for reminders + fine banner
// ---------------------------------------------------------------------
const getMyFeeStatus = async (req, res) => {
    try {
        const fee = await computeFeeStatus(req.user.id);
        if (!fee) return res.status(404).json({ success: false, message: 'User not found.' });
        const lastReceipt = await Receipt.findOne({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
        return res.status(200).json({ success: true, ...fee, lastReceipt, serverTime: new Date() });
    } catch (error) {
        console.error('Fee status error:', error);
        return res.status(500).json({ success: false, message: 'Could not load fee status.' });
    }
};

// ---------------------------------------------------------------------
// GET /api/payments/receipts — my receipts (UPI + cash) with receipt numbers
// ---------------------------------------------------------------------
const getMyReceiptList = async (req, res) => {
    try {
        const receipts = await Receipt.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(50).lean();
        return res.status(200).json({ success: true, receipts });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Could not load receipts.' });
    }
};

module.exports = {
    getMyFeeStatus,
    getMyReceiptList,
    getPaymentScreenData,
    submitPaymentScreenshot,
    getMySubmissions,
    getMyReceipts,
};
