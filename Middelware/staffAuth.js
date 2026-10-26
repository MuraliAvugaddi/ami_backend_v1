const jwt = require("jsonwebtoken");
const Staff = require('../Models/staffModel');

// ============================================================
// STAFF LOGIN CHECK (admin app)
// Token is made at /api/staff/login and carries { id, staff: true }
// ============================================================

const staffAuth = async (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'Please log in again.' });
        }

        const token = authHeader.replace("Bearer ", "");
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        if (!verified.staff) {
            return res.status(401).json({ success: false, message: 'Staff login required.' });
        }

        const staff = await Staff.findById(verified.id);
        if (!staff || !staff.isActive) {
            return res.status(401).json({ success: false, message: 'Your account is disabled. Contact the director.' });
        }

        req.staff = staff;
        next();
    } catch (err) {
        res.status(401).json({ success: false, message: "Session expired. Please log in again." });
    }
};

// allowRoles('director', 'warden')
const allowRoles = (...roles) => (req, res, next) => {
    if (!req.staff || !roles.includes(req.staff.role)) {
        return res.status(403).json({ success: false, message: 'You do not have access to this.' });
    }
    next();
};

module.exports = { staffAuth, allowRoles };
