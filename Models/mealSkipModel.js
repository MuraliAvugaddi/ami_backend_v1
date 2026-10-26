const mongoose = require('mongoose');

const mealSkipSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, // Format: "YYYY-MM-DD"
    mealType: { type: String, enum: ['Breakfast', 'Lunch', 'Snacks', 'Dinner', 'Full Day'], required: true },
    month: { type: String, required: true },
    skippedAt: { type: Date, default: Date.now }
});

mealSkipSchema.index({ userId: 1, date: 1, mealType: 1 }, { unique: true });

module.exports = mongoose.model('MealSkip', mealSkipSchema);