const mongoose = require('mongoose');

const specialOrderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'SpecialFood' },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true }
    }],
    totalAmount: { type: Number, required: true },
    paymentId: { type: String, required: true },
    status: { type: String, enum: ['Ordered', 'Preparing', 'Ready', 'Delivered'], default: 'Ordered' },
    orderToken: { type: String, unique: true },
    orderDate: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('SpecialOrder', specialOrderSchema);