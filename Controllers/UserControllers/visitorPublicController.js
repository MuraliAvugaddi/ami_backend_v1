const Visitor = require('../../Models/visitorModel');
const { nextHostelCode } = require('../../Models/hostelCounterModel');
const { uploadBase64Image } = require('../../utils/cloudinary');
const { emitToStaff } = require('../../utils/hostelNotify');

// ============================================================
// PUBLIC — visitor fills the gate form (no login, opened from the gate QR)
// ============================================================

const recentHits = new Map();
const tooMany = (key) => {
    const now = Date.now();
    const hits = (recentHits.get(key) || []).filter((t) => now - t < 60 * 60 * 1000);
    hits.push(now);
    recentHits.set(key, hits);
    return hits.length > 15;
};

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);

const createVisitorEntry = async (req, res) => {
    try {
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '';
        if (tooMany(ip)) {
            return res.status(429).json({ success: false, message: "Too many entries. Please ask the guard." });
        }

        const b = req.body || {};
        const name = clean(b.name, 80);
        const phone = clean(b.phone, 15).replace(/\D/g, '');
        const studentName = clean(b.studentName, 80);

        if (!name) return res.status(400).json({ success: false, message: "Enter your name." });
        if (!/^\d{10}$/.test(phone)) return res.status(400).json({ success: false, message: "Enter a valid 10-digit mobile number." });
        if (!studentName) return res.status(400).json({ success: false, message: "Enter the name of the person you are meeting." });
        if (!b.photoBase64) return res.status(400).json({ success: false, message: "Please take a live photo." });

        const vehicleType = ['car', 'bike', 'other'].includes(b.vehicleType) ? b.vehicleType : 'none';
        const vehicleNumber = clean(b.vehicleNumber, 15).toUpperCase();
        if (vehicleType !== 'none' && !vehicleNumber) {
            return res.status(400).json({ success: false, message: "Enter the vehicle number." });
        }

        const uploaded = await uploadBase64Image(b.photoBase64, 'ami-visitors', `${phone}_${Date.now()}`);
        const visitor = await Visitor.create({
            code: await nextHostelCode('VIS'),
            name,
            phone,
            relation: clean(b.relation, 40),
            peopleCount: Math.max(1, Math.min(20, parseInt(b.peopleCount, 10) || 1)),
            studentName,
            studentCourseYear: clean(b.studentCourseYear, 60),
            studentRoom: clean(b.studentRoom, 20),
            purpose: clean(b.purpose, 300),
            expectedMinutes: Math.max(10, Math.min(24 * 60, parseInt(b.expectedMinutes, 10) || 60)),
            vehicleType,
            vehicleNumber,
            photoUrl: uploaded.url,
            gate: clean(b.gate, 40) || 'Main gate'
        });
        emitToStaff('visitorAdded', { id: String(visitor._id) });

        res.status(201).json({
            success: true,
            message: "Entry recorded. Please show this screen to the guard.",
            visitor: { code: visitor.code, name: visitor.name, inAt: visitor.inAt, studentName: visitor.studentName }
        });
    } catch (error) {
        console.error("Visitor entry error:", error);
        res.status(500).json({ success: false, message: "Could not save the entry. Please ask the guard." });
    }
};

module.exports = { createVisitorEntry };
