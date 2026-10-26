const mongoose = require('mongoose');

// Running numbers for complaints (CMP-0001), SOS (SOS-0001) and visitors (VIS-0001).
// Kept separate from the meal-token counter, which is cleaned every month.
const hostelCounterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 }
});

const HostelCounter = mongoose.model('HostelCounter', hostelCounterSchema);

const nextHostelCode = async (prefix) => {
    const counter = await HostelCounter.findByIdAndUpdate(
        prefix,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    return `${prefix}-${String(counter.seq).padStart(4, '0')}`;
};

module.exports = { HostelCounter, nextHostelCode };
