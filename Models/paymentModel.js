const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // 👈 Must match mongoose.model('User', userSchema)
        required: true
    },
    amount: { type: Number, required: true },
    method: { type: String, enum: ['online', 'offline'], required: true },
    transactionId: { type: String },
    month: { type: String, required: true },
    status: { type: String, default: 'Success' },
    paidAt: { type: Date, default: Date.now },

    // ✅ NEW — screenshot payments
    screenshotUrl: { type: String, default: '' },
    submissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentSubmission', default: null },
    planMonths: { type: Number, default: 1 },        // 1, 3 or 6
    source: { type: String, default: 'manual' },     // manual | screenshot | cash | cashfree
    fine: { type: Number, default: 0 },              // late fine (saved on the first month of the plan)
    receiptNo: { type: String, default: '' },
}, { timestamps: true });

paymentSchema.index({ transactionId: 1 });
paymentSchema.index({ userId: 1, month: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
