const mongoose = require('mongoose');
const Sos = require('../../Models/sosModel');
const { hostelNotify, emitToStaff } = require('../../utils/hostelNotify');

// ============================================================
// STAFF — SOS ALERTS
// ============================================================

// GET /api/staff/sos?status=active|all
const listSos = async (req, res) => {
    try {
        const query = req.query.status === 'all' ? {} : { status: { $in: ['active', 'on_the_way'] } };
        const sos = await Sos.find(query).sort({ createdAt: -1 }).limit(200);
        res.status(200).json({ success: true, sos });
    } catch (error) {
        res.status(500).json({ success: false, message: "Could not load SOS alerts." });
    }
};

// GET /api/staff/sos/:id
const getSos = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: "Invalid SOS." });
        const sos = await Sos.findById(req.params.id);
        if (!sos) return res.status(404).json({ success: false, message: "SOS not found." });
        res.status(200).json({ success: true, sos });
    } catch (error) {
        res.status(500).json({ success: false, message: "Could not load SOS." });
    }
};

// POST /api/staff/sos/:id/going   ("I'm going")
const goingToSos = async (req, res) => {
    try {
        const sos = await Sos.findById(req.params.id);
        if (!sos) return res.status(404).json({ success: false, message: "SOS not found." });

        if (sos.status === 'active') {
            sos.status = 'on_the_way';
            sos.goingName = req.staff.name;
            sos.goingPhone = req.staff.phone;
            sos.goingAt = new Date();
            await sos.save();

            await hostelNotify({ studentIds: [sos.userId] }, {
                title: 'Help is coming 🏃',
                body: `${req.staff.name} is on the way. Phone: ${req.staff.phone}`,
                type: 'sos_update',
                refId: sos._id
            });
            await hostelNotify({ roles: ['attender', 'warden', 'director'] }, {
                title: `SOS ${sos.code} taken by ${req.staff.name}`,
                body: `${sos.studentName} · Room ${sos.room}`,
                type: 'sos_update',
                refId: sos._id
            });
            emitToStaff('sosUpdated', { id: String(sos._id), status: sos.status });
        }
        res.status(200).json({ success: true, sos });
    } catch (error) {
        res.status(500).json({ success: false, message: "Could not update SOS." });
    }
};

// POST /api/staff/sos/:id/handled   body: { note }
const handleSos = async (req, res) => {
    try {
        const sos = await Sos.findById(req.params.id);
        if (!sos) return res.status(404).json({ success: false, message: "SOS not found." });

        sos.status = 'handled';
        sos.handledName = req.staff.name;
        sos.handledNote = String(req.body.note || '').trim().slice(0, 600);
        sos.handledAt = new Date();
        if (!sos.goingAt) {
            sos.goingName = req.staff.name;
            sos.goingPhone = req.staff.phone;
            sos.goingAt = sos.handledAt;
        }
        await sos.save();

        await hostelNotify({ roles: ['warden', 'director'] }, {
            title: `SOS ${sos.code} handled`,
            body: `${req.staff.name}: ${sos.handledNote || 'Handled'}`,
            type: 'sos_update',
            refId: sos._id
        });
        emitToStaff('sosUpdated', { id: String(sos._id), status: sos.status });
        res.status(200).json({ success: true, sos });
    } catch (error) {
        res.status(500).json({ success: false, message: "Could not update SOS." });
    }
};

module.exports = { listSos, getSos, goingToSos, handleSos };
