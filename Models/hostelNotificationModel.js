const mongoose = require('mongoose');

// Bell list for students and staff (complaint updates, SOS, escalations)
const hostelNotificationSchema = new mongoose.Schema({
    receiverId: { type: mongoose.Schema.Types.ObjectId, required: true },
    receiverType: { type: String, enum: ['student', 'staff'], required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    type: { type: String, default: 'info' }, // complaint, sos, info
    refId: { type: String, default: '' },
    isRead: { type: Boolean, default: false }
}, { timestamps: true });

hostelNotificationSchema.index({ receiverId: 1, createdAt: -1 });

module.exports = mongoose.model('HostelNotification', hostelNotificationSchema);
