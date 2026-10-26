const mongoose = require('mongoose');

const mealItemsSchema = new mongoose.Schema({
  breakfast: [{ type: String, trim: true }],
  lunch: [{ type: String, trim: true }],
  snacks: [{ type: String, trim: true }],
  dinner: [{ type: String, trim: true }],
});

const messMenuSchema = new mongoose.Schema(
  {
    month: { type: String, required: true }, // e.g. "August 2026"
    year: { type: Number, required: true },  // e.g. 2026
    weeklySchedule: {
      Mon: { type: mealItemsSchema, default: {} },
      Tue: { type: mealItemsSchema, default: {} },
      Wed: { type: mealItemsSchema, default: {} },
      Thu: { type: mealItemsSchema, default: {} },
      Fri: { type: mealItemsSchema, default: {} },
      Sat: { type: mealItemsSchema, default: {} },
      Sun: { type: mealItemsSchema, default: {} },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MessMenu', messMenuSchema);