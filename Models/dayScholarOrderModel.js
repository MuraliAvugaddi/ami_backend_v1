const mongoose = require('mongoose');

const dayScholarOrderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    mealType: { type: String, enum: ['Breakfast', 'Lunch', 'Snacks', 'Dinner'], required: true },
    baseAmount: { type: Number, required: true },
    gstAmount: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    tokenNumber: { type: String, required: true, unique: true },
    paymentId: { type: String, required: true },
    transactionId: { type: String, required: true },
    status: { type: String, enum: ['Generated', 'Scanned', 'Cancelled'], default: 'Generated' },
    month: { type: String, required: true }, // e.g., "July 2026"
    orderedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DayScholarOrder', dayScholarOrderSchema);