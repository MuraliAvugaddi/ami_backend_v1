const mongoose = require('mongoose');
const User = require('../../Models/users');
const Complaint = require('../../Models/complaintModel');
const { CATEGORIES, CATEGORY_TRADE } = require('../../Models/complaintModel');
const { nextHostelCode } = require('../../Models/hostelCounterModel');
const { uploadBase64Image } = require('../../utils/cloudinary');
const { hostelNotify, emitToStaff } = require('../../utils/hostelNotify');

// ============================================================
// STUDENT — ROOM COMPLAINTS
// ============================================================

const CATEGORY_LABEL = {
    electrical: 'Electrical',
    plumbing: 'Plumbing',
    carpentry: 'Carpentry',
    cleaning: 'Room cleaning',
    other: 'Other'
};

const OPEN_STATUSES = ['open', 'in_progress', 'reopened'];

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);

// ------------------------------------------------------------
// POST /api/complaints   body: { category, title, description, photoBase64 }
// ------------------------------------------------------------
const raiseComplaint = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        const category = clean(req.body.category, 20);
        const title = clean(req.body.title, 100);
        if (!CATEGORIES.includes(category)) {
            return res.status(400).json({ success: false, message: "Please choose the problem type." });
        }
        if (!title) {
            return res.status(400).json({ success: false, message: "Please tell us what the problem is." });
        }

        // Same problem raised again in 12 hours → don't create a duplicate
        const duplicate = await Complaint.findOne({
            userId: user._id,
            category,
            title,
            status: { $in: OPEN_STATUSES },
            createdAt: { $gte: new Date(Date.now() - 12 * 60 * 60 * 1000) }
        });
        if (duplicate) {
            return res.status(409).json({ success: false, message: `You already raised this (${duplicate.code}). Our team is on it.` });
        }

        let photoUrl = '';
        if (req.body.photoBase64) {
            const uploaded = await uploadBase64Image(req.body.photoBase64, 'ami-complaints', `${user._id}_${Date.now()}`);
            photoUrl = uploaded.url;
        }

        const complaint = await Complaint.create({
            code: await nextHostelCode('CMP'),
            userId: user._id,
            studentName: user.name,
            studentPhone: user.phonenumber || '',
            hostelblock: user.hostelblock || '',
            room: user.room != null ? String(user.room) : '',
            category,
            title,
            description: clean(req.body.description, 1000),
            photoUrl,
            timeline: [{ byName: user.name, byRole: 'student', action: 'raised', note: title }]
        });

        const trade = CATEGORY_TRADE[category];
        await hostelNotify(
            { trades: trade ? [trade] : [], roles: trade ? ['attender'] : ['attender', 'warden'] },
            {
                title: `New complaint · ${CATEGORY_LABEL[category]}`,
                body: `${title} — Room ${complaint.room || '-'}${complaint.hostelblock ? `, ${complaint.hostelblock}` : ''}`,
                type: 'complaint',
                refId: complaint._id
            }
        );
        emitToStaff('complaintUpdated', { id: String(complaint._id) });

        res.status(201).json({
            success: true,
            message: `Complaint ${complaint.code} raised. Our team will fix it soon.`,
            complaint
        });
    } catch (error) {
        console.error("Raise complaint error:", error);
        res.status(500).json({ success: false, message: error.message?.includes('Cloudinary') ? error.message : "Could not raise the complaint." });
    }
};

// ------------------------------------------------------------
// GET /api/complaints/mine
// ------------------------------------------------------------
const getMyComplaints = async (req, res) => {
    try {
        const complaints = await Complaint.find({ userId: req.user.id })
            .populate('assignedTo', 'name phone trade')
            .sort({ createdAt: -1 })
            .limit(100);
        res.status(200).json({ success: true, complaints });
    } catch (error) {
        res.status(500).json({ success: false, message: "Could not load your complaints." });
    }
};

// ------------------------------------------------------------
// GET /api/complaints/:id
// ------------------------------------------------------------
const getMyComplaintById = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid complaint." });
        }
        const complaint = await Complaint.findOne({ _id: req.params.id, userId: req.user.id })
            .populate('assignedTo', 'name phone trade');
        if (!complaint) return res.status(404).json({ success: false, message: "Complaint not found." });
        res.status(200).json({ success: true, complaint });
    } catch (error) {
        res.status(500).json({ success: false, message: "Could not load the complaint." });
    }
};

// ------------------------------------------------------------
// POST /api/complaints/:id/confirm   body: { fixed, rating, comment }
// ------------------------------------------------------------
const confirmComplaint = async (req, res) => {
    try {
        const complaint = await Complaint.findOne({ _id: req.params.id, userId: req.user.id });
        if (!complaint) return res.status(404).json({ success: false, message: "Complaint not found." });
        if (complaint.status !== 'repaired') {
            return res.status(400).json({ success: false, message: "You can confirm only after the team marks it repaired." });
        }

        const fixed = req.body.fixed === true || req.body.fixed === 'true';
        const comment = clean(req.body.comment, 500);

        if (fixed) {
            complaint.status = 'closed';
            complaint.closedAt = new Date();
            complaint.rating = Math.max(1, Math.min(5, parseInt(req.body.rating, 10) || 5));
            complaint.studentComment = comment;
            complaint.timeline.push({ byName: complaint.studentName, byRole: 'student', action: 'confirmed', note: `Fixed · ${complaint.rating}★${comment ? ` — ${comment}` : ''}` });
        } else {
            complaint.status = 'reopened';
            complaint.repairedAt = null;
            complaint.timeline.push({ byName: complaint.studentName, byRole: 'student', action: 'reopened', note: comment || 'Still not fixed' });
        }
        await complaint.save();

        await hostelNotify(
            { staffIds: complaint.assignedTo ? [complaint.assignedTo] : [], roles: ['attender'] },
            fixed
                ? { title: `${complaint.code} confirmed fixed ⭐ ${complaint.rating}`, body: complaint.title, type: 'complaint', refId: complaint._id }
                : { title: `${complaint.code} NOT fixed — reopened`, body: comment || complaint.title, type: 'complaint', refId: complaint._id }
        );
        emitToStaff('complaintUpdated', { id: String(complaint._id) });

        res.status(200).json({
            success: true,
            message: fixed ? "Thank you for confirming!" : "Reopened. The team has been told.",
            complaint
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Could not update the complaint." });
    }
};

module.exports = {
    CATEGORY_LABEL,
    OPEN_STATUSES,
    raiseComplaint,
    getMyComplaints,
    getMyComplaintById,
    confirmComplaint
};
