const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require('../../Models/users');
const Staff = require('../../Models/staffModel');
const { STAFF_ROLES, TRADES } = require('../../Models/staffModel');

// ============================================================
// STAFF ACCOUNTS — login for the admin app + director manages staff
// ============================================================

const makeToken = (staff) =>
    jwt.sign({ id: staff._id, staff: true, role: staff.role }, process.env.JWT_SECRET, { expiresIn: '180d' });

// ------------------------------------------------------------
// POST /api/staff/login   body: { phone, password }
// ------------------------------------------------------------
const staffLogin = async (req, res) => {
    try {
        const phone = String(req.body.phone || '').replace(/\D/g, '');
        const password = String(req.body.password || '');
        if (!phone || !password) {
            return res.status(400).json({ success: false, message: "Enter your mobile number and password." });
        }

        const staff = await Staff.findOne({ phone });
        if (!staff || !(await bcrypt.compare(password, staff.password))) {
            return res.status(400).json({ success: false, message: "Wrong mobile number or password." });
        }
        if (!staff.isActive) {
            return res.status(403).json({ success: false, message: "Your account is disabled. Contact the director." });
        }

        res.status(200).json({ success: true, token: makeToken(staff), staff: staff.toSafe() });
    } catch (error) {
        console.error("Staff login error:", error);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
};

// GET /api/staff/me
const getMe = async (req, res) => {
    res.status(200).json({ success: true, staff: req.staff.toSafe() });
};

// ------------------------------------------------------------
// GET /api/staff   (director, warden, attender — to see the team)
// ------------------------------------------------------------
const listStaff = async (req, res) => {
    try {
        const query = {};
        if (req.query.role) query.role = req.query.role;
        if (req.query.trade) query.trade = req.query.trade;
        const staff = await Staff.find(query).select('-password').sort({ role: 1, name: 1 });
        res.status(200).json({ success: true, staff });
    } catch (error) {
        res.status(500).json({ success: false, message: "Could not load staff." });
    }
};

// ------------------------------------------------------------
// POST /api/staff   (director)   body: { name, phone, password, role, trade, email }
// ------------------------------------------------------------
const createStaff = async (req, res) => {
    try {
        const { name, password, role, trade, email } = req.body;
        const phone = String(req.body.phone || '').replace(/\D/g, '');

        if (!name || !String(name).trim()) return res.status(400).json({ success: false, message: "Name is required." });
        if (!/^\d{10}$/.test(phone)) return res.status(400).json({ success: false, message: "Enter a valid 10-digit mobile number." });
        if (String(password || '').length < 6) return res.status(400).json({ success: false, message: "Password must be at least 6 characters." });
        if (!STAFF_ROLES.includes(role)) return res.status(400).json({ success: false, message: "Choose a valid role." });
        if (role === 'worker' && !TRADES.includes(trade)) {
            return res.status(400).json({ success: false, message: "Choose the work: electrician, plumber, carpenter or cleaner." });
        }
        if (await Staff.exists({ phone })) {
            return res.status(400).json({ success: false, message: "This mobile number is already used." });
        }

        const staff = await Staff.create({
            name: String(name).trim(),
            phone,
            password: String(password),
            role,
            trade: role === 'worker' ? trade : '',
            email: String(email || '').trim()
        });
        res.status(201).json({ success: true, message: `${staff.name} added.`, staff: staff.toSafe() });
    } catch (error) {
        console.error("Create staff error:", error);
        res.status(500).json({ success: false, message: "Could not add staff." });
    }
};

// ------------------------------------------------------------
// PATCH /api/staff/:id   (director)   body: { isActive, password, trade, name, email }
// ------------------------------------------------------------
const updateStaff = async (req, res) => {
    try {
        const staff = await Staff.findById(req.params.id);
        if (!staff) return res.status(404).json({ success: false, message: "Staff not found." });

        const b = req.body || {};
        if (b.isActive !== undefined) {
            if (String(staff._id) === String(req.staff._id) && b.isActive === false) {
                return res.status(400).json({ success: false, message: "You cannot disable your own account." });
            }
            staff.isActive = Boolean(b.isActive);
        }
        if (b.name) staff.name = String(b.name).trim();
        if (b.email !== undefined) staff.email = String(b.email).trim();
        if (b.trade && staff.role === 'worker' && TRADES.includes(b.trade)) staff.trade = b.trade;
        if (b.password) {
            if (String(b.password).length < 6) {
                return res.status(400).json({ success: false, message: "Password must be at least 6 characters." });
            }
            staff.password = String(b.password);
        }
        await staff.save();
        res.status(200).json({ success: true, message: "Saved.", staff: staff.toSafe() });
    } catch (error) {
        res.status(500).json({ success: false, message: "Could not update staff." });
    }
};

// ------------------------------------------------------------
// GET /api/staff/students?search=&block=   (student directory)
// ------------------------------------------------------------
const searchStudents = async (req, res) => {
    try {
        const search = String(req.query.search || '').trim();
        const block = String(req.query.block || '').trim();
        const query = {};
        if (search) {
            const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            query.$or = [{ name: rx }, { email: rx }, { phonenumber: rx }, { fatherPhone: rx }, { enrollmentNo: rx }, { hostelblock: rx }, { course: rx }];
            if (/^\d+$/.test(search)) query.$or.push({ room: Number(search) });
        }
        if (block) query.hostelblock = new RegExp(`^${block.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

        const [students, total, blocks] = await Promise.all([
            User.find(query)
                .select('name email phonenumber fatherPhone hostelblock room course year enrollmentNo gender isApproved accessExpiresAt createdAt')
                .sort({ hostelblock: 1, room: 1, name: 1 })
                .limit(500)
                .lean(),
            User.countDocuments({}),
            User.distinct('hostelblock')
        ]);

        res.status(200).json({
            success: true,
            total,
            blocks: blocks.map((b) => String(b || '').trim()).filter(Boolean)
                .filter((b, i, all) => all.findIndex((x) => x.toLowerCase() === b.toLowerCase()) === i)
                .sort(),
            students
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Could not search students." });
    }
};

module.exports = { staffLogin, getMe, listStaff, createStaff, updateStaff, searchStudents };
