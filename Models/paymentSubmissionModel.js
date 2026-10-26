// =====================================================================
// A payment screenshot uploaded by a student, waiting for admin review.
// =====================================================================
const mongoose = require('mongoose');

const paymentSubmissionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    planMonths: { type: Number, required: true },          // 1, 3 or 6
    months: [{ type: String, required: true }],            // ["October 2026", "November 2026", ...]
    expectedAmount: { type: Number, required: true },      // plan amount + late fine
    fineAmount: { type: Number, default: 0 },              // late fine included in expectedAmount

    utr: { type: String, required: true, trim: true },     // 12-digit UPI reference

    screenshotUrl: { type: String, default: '' },
    screenshotPublicId: { type: String, default: '' },

    // What the phone read from the screenshot (ML Kit OCR)
    detected: {
        utr: { type: String, default: '' },
        amount: { type: Number, default: null },
        payeeMatched: { type: Boolean, default: null },
        paidOn: { type: Date, default: null },
        rawText: { type: String, default: '' },
    },

    // Problems found automatically. Possible values:
    // DUPLICATE_UTR, AMOUNT_MISMATCH, AMOUNT_NOT_FOUND, PAYEE_MISMATCH,
    // DATE_OLD, DATE_NOT_FOUND, UTR_NOT_IN_IMAGE, UTR_EDITED
    flags: [{ type: String }],

    duplicateOf: {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        name: { type: String, default: '' },
        month: { type: String, default: '' },
    },

    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
    },
    autoRejected: { type: Boolean, default: false },
    rejectReason: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
}, { timestamps: true });

paymentSubmissionSchema.index({ utr: 1 });
paymentSubmissionSchema.index({ status: 1, createdAt: -1 });
paymentSubmissionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('PaymentSubmission', paymentSubmissionSchema);
