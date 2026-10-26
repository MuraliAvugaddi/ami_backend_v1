// ============================================================
// ONE PLACE TO TELL PEOPLE ABOUT HOSTEL EVENTS
//   • saves the bell notification
//   • sends it live to the open app (Socket.io room)
//   • SOS → also SMS + email through Brevo
// ============================================================
const User = require('../Models/users');
const Staff = require('../Models/staffModel');
const HostelNotification = require('../Models/hostelNotificationModel');
const { sendBrevoSms, sendBrevoMail } = require('./brevoSms');

let io = null;
const setHostelIo = (socketIo) => { io = socketIo; };

/**
 * who: { studentIds: [], staffIds: [], roles: [], trades: [] }
 * msg: { title, body, type, refId, data, sms, email }
 */
const hostelNotify = async (who, msg) => {
    try {
        const students = who.studentIds?.length
            ? await User.find({ _id: { $in: who.studentIds.filter(Boolean) } }).select('name email phonenumber').lean()
            : [];

        const staffOr = [];
        if (who.staffIds?.length) staffOr.push({ _id: { $in: who.staffIds.filter(Boolean) } });
        if (who.roles?.length) staffOr.push({ role: { $in: who.roles } });
        if (who.trades?.length) staffOr.push({ role: 'worker', trade: { $in: who.trades } });
        const staff = staffOr.length
            ? await Staff.find({ $or: staffOr, isActive: true }).select('name email phone role').lean()
            : [];

        const rows = [
            ...students.map((s) => ({ receiverId: s._id, receiverType: 'student' })),
            ...staff.map((s) => ({ receiverId: s._id, receiverType: 'staff' }))
        ].map((r) => ({ ...r, title: msg.title, body: msg.body || '', type: msg.type || 'info', refId: String(msg.refId || '') }));

        if (rows.length) await HostelNotification.insertMany(rows);

        if (io) {
            const payload = { title: msg.title, body: msg.body || '', type: msg.type || 'info', refId: String(msg.refId || ''), ...(msg.data || {}) };
            students.forEach((s) => io.to(`user:${s._id}`).emit('hostelNotification', payload));
            staff.forEach((s) => io.to(`staff:${s._id}`).emit('hostelNotification', payload));
        }

        const isSos = msg.type === 'sos';
        if (isSos || msg.sms) {
            sendBrevoSms([...staff.map((s) => s.phone), ...students.map((s) => s.phonenumber)], `${msg.title}\n${msg.body || ''}`);
        }
        if (isSos || msg.email) {
            sendBrevoMail([...staff, ...students], msg.title, msg.body || '');
        }
    } catch (error) {
        console.error('❌ Hostel notify error:', error.message);
    }
};

const emitToStaff = (event, data) => {
    if (io) io.to('staff').emit(event, data);
};

module.exports = { hostelNotify, setHostelIo, emitToStaff };
