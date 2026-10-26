// Models/counterModels.js
const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
    createdAt: {
        type: Date,
        default: Date.now,
        // ✅ Updated: Automatically deletes after 32 days (2,764,800 seconds)
        index: { expires: 2764800 } 
    }
});

const Counter = mongoose.model('Counter', counterSchema);
module.exports = Counter;