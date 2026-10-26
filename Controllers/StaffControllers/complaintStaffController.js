const mongoose = require('mongoose');
const Staff = require('../../Models/staffModel');
const Complaint = require('../../Models/complaintModel');
const { CATEGORIES, CATEGORY_TRADE } = require('../../Models/complaintModel');
const { CATEGORY_LABEL, OPEN_STATUSES } = require('../UserControllers/complaintController');
const { uploadBase64Image } = require('../../utils/cloudinary');
const { hostelNotify, emitToStaff } = require('../../utils/hostelNotify');

// ============================================================
// STAFF — COMPLAINTS
//   Repair team: accept → mark repaired
//   Attender: assign, notes
//   Warden: report (cause, action, solution) after 48 h
//   Director: final close after 64 h
// ============================================================

const clean = (value, max = 600) => String(value ?? '').trim().slice(0, max);

const step = (staff, action, note = '') => ({ byName: staff.name, byRole: staff.role === 'worker' ? staff.trade : staff.role, action, note });

const tradeCategories = (trade) => Object.keys(CATEGORY_TRADE).filter((k) => CATEGORY_TRADE[k] === trade);

const canSee = (staff, complaint) =>
    staff.role !== 'worker' ||
    CATEGORY_TRADE[complaint.category] === staff.trade ||
    String(complaint.assignedTo?._id || complaint.assignedTo || '') === String(staff._id);

const loadComplaint = async (id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return Complaint.findById(id).populate('assignedTo', 'name phone trade');
};

// ------------------------------------------------------------
// GET /api/staff/complaints?tab=new|mine|active|escalated|done|all&category=&search=&from=&to=
// ------------------------------------------------------------
const listComplaints = async (req, res) => {
    try {
        const staff = req.staff;
        const tab = String(req.query.tab || 'active');
        const query = {};

        if (staff.role === 'worker') {
            query.$or = [{ category: { $in: tradeCategories(staff.trade) } }, { assignedTo: staff._id }];
        }
        if (CATEGORIES.includes(req.query.category)) query.category = req.query.category;

        if (tab === 'new') query.status = { $in: ['open', 'reopened'] };
        else if (tab === 'mine') { query.assignedTo = staff._id; query.status = { $in: ['in_progress', 'reopened'] }; }
        else if (tab === 'active') query.status = { $in: OPEN_STATUSES };
        else if (tab === 'escalated') query.level = staff.role === 'director' ? 'director' : { $in: ['warden', 'director'] };
        else if (tab === 'done') query.status = { $in: ['repaired', 'closed'] };

        // Calendar filter: ?from=2026-10-01&to=2026-10-27  (India time, both days included)
        const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
        if (isDay(req.query.from) || isDay(req.query.to)) {
            const from = isDay(req.query.from) ? req.query.from : req.query.to;
            const to = isDay(req.query.to) ? req.query.to : req.query.from;
            query.createdAt = {
                $gte: new Date(`${from}T00:00:00+05:30`),
                $lte: new Date(`${to}T23:59:59.999+05:30`)
            };
        }

        let complaints = await Complaint.find(query)
            .populate('assignedTo', 'name phone trade')
            .sort({ createdAt: tab === 'done' ? -1 : 1 })
            .limit(300)
            .lean();

        const search = String(req.query.search || '').trim().toLowerCase();
        if (search) {
            complaints = complaints.filter((c) => [c.code, c.title, c.room, c.hostelblock, c.studentName, c.studentPhone]
                .some((v) => String(v || '').toLowerCase().includes(search)));
        }
        res.status(200).json({ success: true, complaints });
    } catch (error) {
        console.error("List complaints error:", error);
        res.status(500).json({ success: false, message: "Could not load complaints." });
    }
};

// GET /api/staff/complaints/:id
const getComplaint = async (req, res) => {
    try {
        const complaint = await loadComplaint(req.params.id);
        if (!complaint) return res.status(404).json({ success: false, message: "Complaint not found." });
        if (!canSee(req.staff, complaint)) return res.status(403).json({ success: false, message: "This complaint is for another team." });
        res.status(200).json({ success: true, complaint });
    } catch (error) {
        res.status(500).json({ success: false, message: "Could not load the complaint." });
    }
};

// ------------------------------------------------------------
// POST /api/staff/complaints/:id/accept   (repair team: "I'm going")
// ------------------------------------------------------------
const acceptComplaint = async (req, res) => {
    try {
        const staff = req.staff;
        const complaint = await loadComplaint(req.params.id);
        if (!complaint) return res.status(404).json({ success: false, message: "Complaint not found." });
        if (!canSee(staff, complaint)) return res.status(403).json({ success: false, message: "This complaint is for another team." });
        if (!['open', 'reopened'].includes(complaint.status)) {
            return res.status(400).json({ success: false, message: "This job is already taken or done." });
        }

        complaint.assignedTo = staff._id;
        complaint.status = 'in_progress';
        complaint.acceptedAt = new Date();
        complaint.timeline.push(step(staff, 'accepted', `${staff.name} is coming to fix it`));
        await complaint.save();

        await hostelNotify({ studentIds: [complaint.userId] }, {
            title: 'Your complaint is being fixed 🔧',
            body: `${staff.name} (${staff.trade}) accepted ${complaint.code}. Phone: ${staff.phone}`,
            type: 'complaint',
            refId: complaint._id
        });
        await hostelNotify({ roles: ['attender'] }, {
            title: `${complaint.code} accepted`,
            body: `${staff.name} is working on: ${complaint.title}`,
            type: 'complaint',
            refId: complaint._id
        });
        emitToStaff('complaintUpdated', { id: String(complaint._id) });

        res.status(200).json({ success: true, message: "Job accepted. The student has been told.", complaint: await loadComplaint(complaint._id) });
    } catch (error) {
        res.status(500).json({ success: false, message: "Could not accept the job." });
    }
};

// ------------------------------------------------------------
// POST /api/staff/complaints/:id/assign   body: { workerId, note }   (attender/warden/director)
// ------------------------------------------------------------
const assignComplaint = async (req, res) => {
    try {
        const complaint = await loadComplaint(req.params.id);
        if (!complaint) return res.status(404).json({ success: false, message: "Complaint not found." });
        if (!OPEN_STATUSES.includes(complaint.status)) {
            return res.status(400).json({ success: false, message: "This complaint is already repaired." });
        }
        const worker = await Staff.findOne({ _id: req.body.workerId, role: 'worker', isActive: true });
        if (!worker) return res.status(400).json({ success: false, message: "Choose a worker." });

        complaint.assignedTo = worker._id;
        complaint.status = 'in_progress';
        complaint.acceptedAt = complaint.acceptedAt || new Date();
        complaint.timeline.push(step(req.staff, 'assigned', `Assigned to ${worker.name}${req.body.note ? ` — ${clean(req.body.note, 300)}` : ''}`));
        await complaint.save();

        await hostelNotify({ staffIds: [worker._id] }, {
            title: `New job for you · ${CATEGORY_LABEL[complaint.category]}`,
            body: `${complaint.title} — Room ${complaint.room}. Assigned by ${req.staff.name}`,
            type: 'complaint',
            refId: complaint._id
        });
        await hostelNotify({ studentIds: [complaint.userId] }, {
            title: 'Worker assigned',
            body: `${worker.name} will fix ${complaint.code}. Phone: ${worker.phone}`,
            type: 'complaint',
            refId: complaint._id
        });
        emitToStaff('complaintUpdated', { id: String(complaint._id) });

        res.status(200).json({ success: true, message: `Assigned to ${worker.name}.`, complaint: await loadComplaint(complaint._id) });
    } catch (error) {
        res.status(500).json({ success: false, message: "Could not assign the job." });
    }
};

// ------------------------------------------------------------
// POST /api/staff/complaints/:id/repaired   body: { note, photoBase64 }
// ------------------------------------------------------------
const markRepaired = async (req, res) => {
    try {
        const staff = req.staff;
        const complaint = await loadComplaint(req.params.id);
        if (!complaint) return res.status(404).json({ success: false, message: "Complaint not found." });
        if (!canSee(staff, complaint)) return res.status(403).json({ success: false, message: "This complaint is for another team." });
        if (!OPEN_STATUSES.includes(complaint.status)) {
            return res.status(400).json({ success: false, message: "This complaint is already repaired." });
        }
        const note = clean(req.body.note);
        if (!note) return res.status(400).json({ success: false, message: "Write what you repaired." });

        if (req.body.photoBase64) {
            const uploaded = await uploadBase64Image(req.body.photoBase64, 'ami-repairs', `${complaint.code}_${Date.now()}`);
            complaint.repairPhotoUrl = uploaded.url;
        }
        complaint.status = 'repaired';
        complaint.repairedAt = new Date();
        complaint.repairNote = note;
        if (!complaint.assignedTo && staff.role === 'worker') complaint.assignedTo = staff._id;
        complaint.timeline.push(step(staff, 'repaired', note));
        await complaint.save();

        await hostelNotify({ studentIds: [complaint.userId] }, {
            title: 'Your problem is repaired ✅',
            body: `${complaint.code}: ${note}. Please confirm in the app.`,
            type: 'complaint',
            refId: complaint._id
        });
        const roles = ['attender'];
        if (complaint.level !== 'team') roles.push('warden');
        if (complaint.level === 'director') roles.push('director');
        await hostelNotify({ roles }, {
            title: `${complaint.code} repaired`,
            body: `${staff.name}: ${note}`,
            type: 'complaint',
            refId: complaint._id
        });
        emitToStaff('complaintUpdated', { id: String(complaint._id) });

        res.status(200).json({ success: true, message: "Marked repaired. The student has been told.", complaint: await loadComplaint(complaint._id) });
    } catch (error) {
        console.error("Mark repaired error:", error);
        res.status(500).json({ success: false, message: error.message?.includes('Cloudinary') ? error.message : "Could not update the complaint." });
    }
};

// POST /api/staff/complaints/:id/note   body: { note }
const addNote = async (req, res) => {
    try {
        const complaint = await loadComplaint(req.params.id);
        if (!complaint) return res.status(404).json({ success: false, message: "Complaint not found." });
        if (!canSee(req.staff, complaint)) return res.status(403).json({ success: false, message: "This complaint is for another team." });
        const note = clean(req.body.note);
        if (!note) return res.status(400).json({ success: false, message: "Write a note." });

        complaint.timeline.push(step(req.staff, 'note', note));
        await complaint.save();
        if (complaint.assignedTo && String(complaint.assignedTo._id) !== String(req.staff._id)) {
            await hostelNotify({ staffIds: [complaint.assignedTo._id] }, {
                title: `Note on ${complaint.code} from ${req.staff.name}`,
                body: note,
                type: 'complaint',
                refId: complaint._id
            });
        }
        res.status(200).json({ success: true, complaint: await loadComplaint(complaint._id) });
    } catch (error) {
        res.status(500).json({ success: false, message: "Could not save the note." });
    }
};

// ------------------------------------------------------------
// POST /api/staff/complaints/:id/warden-report   body: { cause, actionTaken, solution, markRepaired }
// ------------------------------------------------------------
const wardenReport = async (req, res) => {
    try {
        const complaint = await loadComplaint(req.params.id);
        if (!complaint) return res.status(404).json({ success: false, message: "Complaint not found." });
        if (complaint.level === 'team') {
            return res.status(400).json({ success: false, message: "This complaint has not reached the warden yet." });
        }
        const cause = clean(req.body.cause, 1000);
        const actionTaken = clean(req.body.actionTaken, 1000);
        const solution = clean(req.body.solution, 1000);
        if (!cause || !actionTaken) {
            return res.status(400).json({ success: false, message: "Write why the problem came and what action you took." });
        }

        complaint.wardenReport = { cause, actionTaken, solution, wardenName: req.staff.name, writtenAt: new Date() };
        complaint.timeline.push(step(req.staff, 'report', `Cause: ${cause}\nAction: ${actionTaken}${solution ? `\nSolution: ${solution}` : ''}`));

        if ((req.body.markRepaired === true || req.body.markRepaired === 'true') && OPEN_STATUSES.includes(complaint.status)) {
            complaint.status = 'repaired';
            complaint.repairedAt = new Date();
            complaint.repairNote = solution || actionTaken;
            await hostelNotify({ studentIds: [complaint.userId] }, {
                title: 'Your problem is repaired ✅',
                body: `${complaint.code}: solved by the warden. Please confirm in the app.`,
                type: 'complaint',
                refId: complaint._id
            });
        }
        await complaint.save();

        await hostelNotify({ roles: ['director'] }, {
            title: `Warden report · ${complaint.code}`,
            body: `${req.staff.name}: ${cause.slice(0, 120)}`,
            type: 'complaint',
            refId: complaint._id
        });
        emitToStaff('complaintUpdated', { id: String(complaint._id) });

        res.status(200).json({ success: true, message: "Report sent to the director.", complaint: await loadComplaint(complaint._id) });
    } catch (error) {
        res.status(500).json({ success: false, message: "Could not save the report." });
    }
};

// POST /api/staff/complaints/:id/director-close   body: { note }
const directorClose = async (req, res) => {
    try {
        const complaint = await loadComplaint(req.params.id);
        if (!complaint) return res.status(404).json({ success: false, message: "Complaint not found." });
        const note = clean(req.body.note, 1000);
        if (!note) return res.status(400).json({ success: false, message: "Write your final note." });

        complaint.directorNote = note;
        complaint.repairedAt = complaint.repairedAt || new Date();
        complaint.status = 'closed';
        complaint.closedAt = new Date();
        complaint.timeline.push(step(req.staff, 'closed', note));
        await complaint.save();

        await hostelNotify({ studentIds: [complaint.userId], roles: ['warden', 'attender'] }, {
            title: `${complaint.code} closed by the director`,
            body: note,
            type: 'complaint',
            refId: complaint._id
        });
        emitToStaff('complaintUpdated', { id: String(complaint._id) });

        res.status(200).json({ success: true, message: "Complaint closed.", complaint: await loadComplaint(complaint._id) });
    } catch (error) {
        res.status(500).json({ success: false, message: "Could not close the complaint." });
    }
};

// ------------------------------------------------------------
// GET /api/staff/complaints-summary   (dashboard numbers)
// ------------------------------------------------------------
const complaintSummary = async (req, res) => {
    try {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const all = await Complaint.find({ createdAt: { $gte: since } })
            .select('status level category createdAt repairedAt assignedTo rating')
            .populate('assignedTo', 'name trade')
            .lean();
        const openNow = await Complaint.find({ status: { $in: OPEN_STATUSES } }).select('level').lean();

        const count = (fn) => all.filter(fn).length;
        const fixTimes = all.filter((c) => c.repairedAt).map((c) => (new Date(c.repairedAt) - new Date(c.createdAt)) / 3600000);
        const ratings = all.filter((c) => c.rating).map((c) => c.rating);

        const workers = {};
        all.forEach((c) => {
            if (!c.assignedTo) return;
            const key = String(c.assignedTo._id);
            workers[key] = workers[key] || { name: c.assignedTo.name, trade: c.assignedTo.trade, jobs: 0, done: 0 };
            workers[key].jobs++;
            if (['repaired', 'closed'].includes(c.status)) workers[key].done++;
        });

        res.status(200).json({
            success: true,
            open: openNow.length,
            atWarden: openNow.filter((c) => c.level === 'warden').length,
            atDirector: openNow.filter((c) => c.level === 'director').length,
            last30Days: all.length,
            solved30Days: count((c) => ['repaired', 'closed'].includes(c.status)),
            avgFixHours: fixTimes.length ? Math.round((fixTimes.reduce((a, b) => a + b, 0) / fixTimes.length) * 10) / 10 : null,
            avgRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
            byCategory: Object.fromEntries(CATEGORIES.map((k) => [k, count((c) => c.category === k)])),
            workers: Object.values(workers).sort((a, b) => b.done - a.done)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Could not load summary." });
    }
};

module.exports = {
    listComplaints,
    getComplaint,
    acceptComplaint,
    assignComplaint,
    markRepaired,
    addNote,
    wardenReport,
    directorClose,
    complaintSummary
};
