const HostelNotification = require('../../Models/hostelNotificationModel');

// ============================================================
// BELL LIST — students (req.user) and staff (req.staff)
// ============================================================

const receiverOf = (req) => (req.staff
    ? { receiverId: req.staff._id, receiverType: 'staff' }
    : { receiverId: req.user.id, receiverType: 'student' });

const getMyNotifications = async (req, res) => {
    try {
        const who = receiverOf(req);
        const notifications = await HostelNotification.find(who).sort({ createdAt: -1 }).limit(100);
        const unread = await HostelNotification.countDocuments({ ...who, isRead: false });
        res.status(200).json({ success: true, unread, notifications });
    } catch (error) {
        res.status(500).json({ success: false, message: "Could not load notifications." });
    }
};

const markAllRead = async (req, res) => {
    try {
        await HostelNotification.updateMany({ ...receiverOf(req), isRead: false }, { isRead: true });
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: "Could not update notifications." });
    }
};

module.exports = { getMyNotifications, markAllRead };
