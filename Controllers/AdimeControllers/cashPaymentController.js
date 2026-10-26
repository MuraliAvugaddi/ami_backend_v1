// =====================================================================
// ADMIN — record a CASH payment from Student Finance.
// The student instantly gets a notification + receipt with PAID stamp.
// =====================================================================
const mongoose = require('mongoose');
const Payment = require('../../Models/paymentModel');
const { findPlan, getPaymentConfig } = require('../../utils/paymentConfig');
const { computeFeeStatus } = require('../../utils/feeStatus');
const { refreshAccessFromPayments } = require('../../utils/access');
const { consecutiveMonths } = require('../../utils/months');
const { createReceipt, emitReceipt, nextReceiptNo } = require('../../utils/receipts');
const { Receipt } = require('../../Models/receiptModel');

const toId = (id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null);

// ---------------------------------------------------------------------
// GET /api/admin/students/:userId/fee-status   → fills the cash dialog
// ---------------------------------------------------------------------
const getStudentFeeStatus = async (req, res) => {
    try {
        const id = toId(req.params.userId);
        if (!id) return res.status(400).json({ success: false, message: 'Invalid student id.' });

        const fee = await computeFeeStatus(id);
        if (!fee) return res.status(404).json({ success: false, message: 'Student not found.' });

        const config = getPaymentConfig();
        const fine = fee.currentMonth === fee.startMonth ? fee.fine : 0;
        const plans = config.plans.map((p) => ({
            ...p,
            monthLabels: consecutiveMonths(fee.startMonth, p.months),
            fine,
            total: p.amount + fine,
        }));
        const receipts = await Receipt.find({ userId: id }).sort({ createdAt: -1 }).limit(10).lean();

        return res.status(200).json({ success: true, ...fee, fine, plans, receipts });
    } catch (error) {
        console.error('Admin fee status error:', error);
        return res.status(500).json({ success: false, message: 'Could not load fee status.' });
    }
};

// ---------------------------------------------------------------------
// POST /api/admin/students/:userId/cash-payment
// body: { planMonths: 1|3|6, amount, waiveFine: bool, note }
// ---------------------------------------------------------------------
const recordCashPayment = async (req, res) => {
    try {
        const id = toId(req.params.userId);
        if (!id) return res.status(400).json({ success: false, message: 'Invalid student id.' });

        const plan = findPlan(req.body?.planMonths);
        if (!plan) return res.status(400).json({ success: false, message: 'Choose 1, 3 or 6 months.' });

        const fee = await computeFeeStatus(id);
        if (!fee) return res.status(404).json({ success: false, message: 'Student not found.' });

        const months = consecutiveMonths(fee.startMonth, plan.months);
        const waiveFine = req.body?.waiveFine === true || req.body?.waiveFine === 'true';
        const fine = !waiveFine && fee.currentMonth === fee.startMonth ? fee.fine : 0;

        const amount = req.body?.amount !== undefined && req.body?.amount !== ''
            ? Number(req.body.amount)
            : plan.amount + fine;
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Enter the cash amount received.' });
        }
        if (amount > (plan.amount + fine) * 2) {
            return res.status(400).json({ success: false, message: `₹${amount} looks too high for this plan. Please check.` });
        }

        const fineTaken = Math.min(fine, amount);
        const planAmount = amount - fineTaken;
        const perMonth = Math.round((planAmount / plan.months) * 100) / 100;
        const receiptNo = await nextReceiptNo('cash');
        const paidAt = new Date();
        const note = String(req.body?.note || '').slice(0, 200);

        for (const [index, month] of months.entries()) {
            const [name, year] = month.split(' ');
            await Payment.findOneAndUpdate(
                {
                    $or: [{ userId: id }, { userId: String(id) }],
                    month: { $regex: new RegExp(`^${name}\\s*${year}`, 'i') },
                },
                {
                    $set: {
                        userId: id,
                        amount: perMonth,
                        method: 'offline',
                        transactionId: `CASH-${receiptNo}`,
                        month,
                        status: 'Success',
                        paidAt,
                        planMonths: plan.months,
                        source: 'cash',
                        fine: index === 0 ? fineTaken : 0,
                        receiptNo,
                        screenshotUrl: '',
                        submissionId: null,
                    },
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
        }

        const updatedUser = await refreshAccessFromPayments(id);

        const receipt = await createReceipt({
            receiptNo,
            userId: id,
            mode: 'cash',
            planMonths: plan.months,
            months,
            planAmount,
            fine: fineTaken,
            totalAmount: amount,
            utr: '',
            note,
            paidAt,
            accessTill: updatedUser?.accessExpiresAt || null,
        });

        if (req.io && updatedUser) {
            req.io.emit('statusUpdated', {
                userId: String(updatedUser._id),
                isApproved: updatedUser.isApproved,
                accessExpiresAt: updatedUser.accessExpiresAt,
            });
        }
        emitReceipt(req.io, receipt, updatedUser?.accessExpiresAt);

        return res.status(200).json({
            success: true,
            message: `Cash ₹${amount} saved for ${months.join(', ')}. Receipt ${receiptNo} sent to the student.`,
            receipt,
            accessExpiresAt: updatedUser?.accessExpiresAt || null,
        });
    } catch (error) {
        console.error('Cash payment error:', error);
        return res.status(500).json({ success: false, message: 'Could not save the cash payment.' });
    }
};

module.exports = { getStudentFeeStatus, recordCashPayment };
