const mongoose = require('mongoose');

// ============================================================
// VISITOR REGISTER — filled at the gate by scanning the QR
// ============================================================

const visitorSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    relation: { type: String, default: '' },
    peopleCount: { type: Number, default: 1 },

    studentName: { type: String, required: true, trim: true },
    studentCourseYear: { type: String, default: '' },
    studentRoom: { type: String, default: '' },

    purpose: { type: String, default: '' },
    expectedMinutes: { type: Number, default: 60 },

    vehicleType: { type: String, enum: ['none', 'car', 'bike', 'other'], default: 'none' },
    vehicleNumber: { type: String, default: '', uppercase: true, trim: true },

    photoUrl: { type: String, required: true },
    gate: { type: String, default: 'Main gate' },

    inAt: { type: Date, default: Date.now },
    outAt: { type: Date, default: null },
    checkedOutBy: { type: String, default: '' },
    flagged: { type: Boolean, default: false },
    flagNote: { type: String, default: '' }
}, { timestamps: true });

visitorSchema.index({ inAt: -1 });

module.exports = mongoose.model('Visitor', visitorSchema);
