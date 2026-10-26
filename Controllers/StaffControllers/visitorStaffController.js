const Visitor = require('../../Models/visitorModel');

// ============================================================
// STAFF — VISITOR REGISTER
// ============================================================

// GET /api/staff/visitors?date=YYYY-MM-DD&inside=true&search=
const listVisitors = async (req, res) => {
    try {
        const query = {};
        if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '')) {
            const start = new Date(`${req.query.date}T00:00:00+05:30`);
            query.inAt = { $gte: start, $lt: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
        }
        if (req.query.inside === 'true') query.outAt = null;

        let visitors = await Visitor.find(query).sort({ inAt: -1 }).limit(500).lean();

        const search = String(req.query.search || '').trim().toLowerCase();
        if (search) {
            visitors = visitors.filter((v) => [v.code, v.name, v.phone, v.studentName, v.vehicleNumber, v.relation]
                .some((x) => String(x || '').toLowerCase().includes(search)));
        }
        const now = Date.now();
        visitors = visitors.map((v) => ({
            ...v,
            overstay: !v.outAt && now - new Date(v.inAt).getTime() > v.expectedMinutes * 60 * 1000
        }));
        res.status(200).json({ success: true, visitors });
    } catch (error) {
        res.status(500).json({ success: false, message: "Could not load visitors." });
    }
};

// POST /api/staff/visitors/:id/checkout
const checkoutVisitor = async (req, res) => {
    try {
        const visitor = await Visitor.findById(req.params.id);
        if (!visitor) return res.status(404).json({ success: false, message: "Visitor not found." });
        if (!visitor.outAt) {
            visitor.outAt = new Date();
            visitor.checkedOutBy = req.staff.name;
            await visitor.save();
        }
        res.status(200).json({ success: true, visitor });
    } catch (error) {
        res.status(500).json({ success: false, message: "Could not check out." });
    }
};

// POST /api/staff/visitors/:id/flag   body: { note }
const flagVisitor = async (req, res) => {
    try {
        const visitor = await Visitor.findById(req.params.id);
        if (!visitor) return res.status(404).json({ success: false, message: "Visitor not found." });
        visitor.flagged = !visitor.flagged;
        visitor.flagNote = visitor.flagged ? String(req.body.note || '').trim().slice(0, 300) : '';
        await visitor.save();
        res.status(200).json({ success: true, visitor });
    } catch (error) {
        res.status(500).json({ success: false, message: "Could not update visitor." });
    }
};

module.exports = { listVisitors, checkoutVisitor, flagVisitor };
