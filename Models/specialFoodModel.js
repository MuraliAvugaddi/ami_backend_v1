const mongoose = require('mongoose');

const specialFoodSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String, required: true }, // URL or Base64
    description: { type: String },
    isAvailable: { type: Boolean, default: true },
    stock: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('SpecialFood', specialFoodSchema);