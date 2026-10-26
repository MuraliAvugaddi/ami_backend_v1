// =====================================================================
// A payment receipt the student sees in the app (with PAID stamp).
// Created when the admin approves a UPI screenshot or records cash.
// =====================================================================
const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema({
    receiptNo: { type: String, required: true, unique: true },   // AMI-CASH-2026-00012
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Snapshot of the student (stays correct even if profile changes later)
    studentName: { type: String, default: '' },
    enrollmentNo: { type: String, default: '' },
    room: { type: String, default: '' },

    mode: { type: String, enum: ['upi', 'cash'], required: true },
    planMonths: { type: Number, default: 1 },
    months: [{ type: String }],
    planAmount: { type: Number, default: 0 },
    fine: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    utr: { type: String, default: '' },
    note: { type: String, default: '' },
    paidAt: { type: Date, default: Date.now },
    accessTill: { type: Date, default: null },

    submissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentSubmission', default: null },
}, { timestamps: true });

receiptSchema.index({ userId: 1, createdAt: -1 });

const counterSchema = new mongoose.Schema({
    _id: { type: String },
    seq: { type: Number, default: 0 },
});

const Receipt = mongoose.models.Receipt || mongoose.model('Receipt', receiptSchema);
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

module.exports = { Receipt, Counter };
