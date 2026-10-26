const mongoose = require('mongoose');

// ============================================================
// ROOM COMPLAINT
// Student raises → repair team fixes.
// Not fixed in 48 h → Warden.  Not fixed in 64 h → Director.
// ============================================================

const CATEGORIES = ['electrical', 'plumbing', 'carpentry', 'cleaning', 'other'];

// Which team gets which complaint
const CATEGORY_TRADE = {
    electrical: 'electrician',
    plumbing: 'plumber',
    carpentry: 'carpenter',
    cleaning: 'cleaner',
    other: ''
};

const timelineSchema = new mongoose.Schema({
    at: { type: Date, default: Date.now },
    byName: { type: String, default: '' },
    byRole: { type: String, default: '' },
    action: { type: String, required: true }, // raised, accepted, assigned, repaired, confirmed, reopened, escalated, note, report, closed
    note: { type: String, default: '' }
}, { _id: false });

const complaintSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Snapshot of the student (so old complaints still show the right room)
    studentName: { type: String, default: '' },
    studentPhone: { type: String, default: '' },
    hostelblock: { type: String, default: '' },
    room: { type: String, default: '' },

    category: { type: String, enum: CATEGORIES, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    photoUrl: { type: String, default: '' },

    status: {
        type: String,
        enum: ['open', 'in_progress', 'repaired', 'closed', 'reopened'],
        default: 'open'
    },
    level: {
        type: String,
        enum: ['team', 'warden', 'director'],
        default: 'team'
    },

    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', default: null },
    acceptedAt: { type: Date, default: null },
    repairedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    repairNote: { type: String, default: '' },
    repairPhotoUrl: { type: String, default: '' },

    sentToWardenAt: { type: Date, default: null },
    sentToDirectorAt: { type: Date, default: null },
    wardenReport: {
        cause: { type: String, default: '' },
        actionTaken: { type: String, default: '' },
        solution: { type: String, default: '' },
        wardenName: { type: String, default: '' },
        writtenAt: { type: Date, default: null }
    },
    directorNote: { type: String, default: '' },

    rating: { type: Number, min: 1, max: 5, default: null },
    studentComment: { type: String, default: '' },

    timeline: [timelineSchema]
}, { timestamps: true });

complaintSchema.index({ status: 1, level: 1, createdAt: 1 });
complaintSchema.index({ userId: 1, createdAt: -1 });

const Complaint = mongoose.model('Complaint', complaintSchema);
module.exports = Complaint;
module.exports.CATEGORIES = CATEGORIES;
module.exports.CATEGORY_TRADE = CATEGORY_TRADE;
