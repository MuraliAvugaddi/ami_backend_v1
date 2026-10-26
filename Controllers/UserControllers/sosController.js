const User = require('../../Models/users');
const Sos = require('../../Models/sosModel');
const { SOS_TYPES } = require('../../Models/sosModel');
const { nextHostelCode } = require('../../Models/hostelCounterModel');
const { hostelNotify, emitToStaff } = require('../../utils/hostelNotify');

// ============================================================
// STUDENT — SOS EMERGENCY
// ============================================================

const SOS_LABEL = {
    medical: 'Medical emergency',
    snake: 'Snake / animal',
    danger: 'Student in danger',
    fire: 'Fire / smoke',
    fight: 'Fight / violence',
    other: 'Emergency'
};

// ------------------------------------------------------------
// POST /api/sos   body: { type, note }
// ------------------------------------------------------------
const sendSos = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        const type = SOS_TYPES.includes(req.body.type) ? req.body.type : 'other';

        // Pressed again within 3 minutes → same alert rings again (no duplicates)
        let sos = await Sos.findOne({
            userId: user._id,
            status: 'active',
            createdAt: { $gte: new Date(Date.now() - 3 * 60 * 1000) }
        });

        if (!sos) {
            sos = await Sos.create({
                code: await nextHostelCode('SOS'),
                userId: user._id,
                studentName: user.name,
                studentPhone: user.phonenumber || '',
                fatherPhone: user.fatherPhone || '',
                hostelblock: user.hostelblock || '',
                room: user.room != null ? String(user.room) : '',
                type,
                note: String(req.body.note || '').trim().slice(0, 300)
            });
        }

        const body = `${sos.studentName} · Room ${sos.room || '-'}${sos.hostelblock ? ` · ${sos.hostelblock}` : ''} · ${sos.studentPhone}`;
        await hostelNotify(
            { roles: ['attender', 'warden', 'director'] },
            {
                title: `🚨 SOS: ${SOS_LABEL[sos.type]}`,
                body,
                type: 'sos',
                refId: sos._id,
                data: {
                    code: sos.code,
                    sosType: sos.type,
                    studentName: sos.studentName,
                    studentPhone: sos.studentPhone,
                    room: sos.room,
                    hostelblock: sos.hostelblock,
                    note: sos.note
                }
            }
        );
        emitToStaff('sosAlert', { id: String(sos._id) });

        res.status(201).json({ success: true, message: "Help is on the way. Stay where you are.", sos });
    } catch (error) {
        console.error("SOS error:", error);
        res.status(500).json({ success: false, message: "Could not send SOS. Call the warden directly." });
    }
};

// ------------------------------------------------------------
// GET /api/sos/mine
// ------------------------------------------------------------
const getMySos = async (req, res) => {
    try {
        const sos = await Sos.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(20);
        res.status(200).json({ success: true, sos });
    } catch (error) {
        res.status(500).json({ success: false, message: "Could not load SOS history." });
    }
};

module.exports = { SOS_LABEL, sendSos, getMySos };
