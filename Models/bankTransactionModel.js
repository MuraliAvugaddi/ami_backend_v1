// =====================================================================
// One money-received (credit) line from the bank / Vyapar statement.
// This is the REAL proof of payment. Screenshots can be edited,
// the bank statement cannot.
// =====================================================================
const mongoose = require('mongoose');

const bankTransactionSchema = new mongoose.Schema({
    utr: { type: String, required: true, trim: true },   // 12-digit UPI reference (RRN / UTR)
    altUtrs: [{ type: String }],                          // other 12-digit numbers found in the same line
    amount: { type: Number, required: true },             // money received (credit)
    txnDate: { type: Date, default: null },
    txnDay: { type: String, default: '' },                // "2026-10-23" (IST day)
    narration: { type: String, default: '' },             // description from the statement
    statementId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankStatementUpload', default: null },
}, { timestamps: true });

bankTransactionSchema.index({ utr: 1 }, { unique: true });
bankTransactionSchema.index({ altUtrs: 1 });
bankTransactionSchema.index({ txnDay: 1 });

const bankStatementUploadSchema = new mongoose.Schema({
    fileName: { type: String, default: '' },
    rowsRead: { type: Number, default: 0 },
    credits: { type: Number, default: 0 },
    added: { type: Number, default: 0 },
    alreadyHad: { type: Number, default: 0 },
    fromDay: { type: String, default: '' },   // first day covered by the statement, "2026-10-01"
    toDay: { type: String, default: '' },     // last day covered by the statement, "2026-10-23"
}, { timestamps: true });

const BankTransaction = mongoose.models.BankTransaction ||
    mongoose.model('BankTransaction', bankTransactionSchema);
const BankStatementUpload = mongoose.models.BankStatementUpload ||
    mongoose.model('BankStatementUpload', bankStatementUploadSchema);

module.exports = { BankTransaction, BankStatementUpload };
