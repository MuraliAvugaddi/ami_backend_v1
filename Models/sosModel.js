const mongoose = require('mongoose');

// ============================================================
// SOS — emergency alert from a student
// ============================================================

const SOS_TYPES = ['medical', 'snake', 'danger', 'fire', 'fight', 'other'];

const sosSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    studentName: { type: String, default: '' },
    studentPhone: { type: String, default: '' },
    fatherPhone: { type: String, default: '' },
    hostelblock: { type: String, default: '' },
    room: { type: String, default: '' },

    type: { type: String, enum: SOS_TYPES, default: 'other' },
    note: { type: String, default: '' },

    status: { type: String, enum: ['active', 'on_the_way', 'handled'], default: 'active' },
    goingName: { type: String, default: '' },
    goingPhone: { type: String, default: '' },
    goingAt: { type: Date, default: null },
    handledName: { type: String, default: '' },
    handledNote: { type: String, default: '' },
    handledAt: { type: Date, default: null }
}, { timestamps: true });

sosSchema.index({ status: 1, createdAt: -1 });

const Sos = mongoose.model('Sos', sosSchema);
module.exports = Sos;
module.exports.SOS_TYPES = SOS_TYPES;
