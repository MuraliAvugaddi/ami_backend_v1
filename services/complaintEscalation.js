// ============================================================
// COMPLAINT ESCALATION (runs every 5 minutes)
//   • not repaired in 48 h → goes to the WARDEN
//   • not repaired in 64 h → goes to the DIRECTOR
//   • repaired but student never confirmed in 72 h → closed
// Change the hours in .env: ESCALATE_WARDEN_HOURS, ESCALATE_DIRECTOR_HOURS
// ============================================================
const Complaint = require('../Models/complaintModel');
const { hostelNotify, emitToStaff } = require('../utils/hostelNotify');

const OPEN = ['open', 'in_progress', 'reopened'];
const HOUR = 60 * 60 * 1000;

const hoursFromEnv = (name, fallback) => {
    const n = Number(process.env[name]);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

const systemStep = (action, note) => ({ byName: 'System', byRole: 'system', action, note });

const runEscalation = async (now = new Date()) => {
    const wardenHours = hoursFromEnv('ESCALATE_WARDEN_HOURS', 48);
    const directorHours = hoursFromEnv('ESCALATE_DIRECTOR_HOURS', 64);
    const result = { toWarden: 0, toDirector: 0, autoClosed: 0 };

    // ---- 64 h → Director ----
    const forDirector = await Complaint.find({
        status: { $in: OPEN },
        level: { $in: ['team', 'warden'] },
        createdAt: { $lte: new Date(now - directorHours * HOUR) }
    });
    for (const c of forDirector) {
        if (!c.sentToWardenAt) c.sentToWardenAt = now;
        c.level = 'director';
        c.sentToDirectorAt = now;
        c.timeline.push(systemStep('escalated', `Not repaired in ${directorHours} hours — sent to the Director`));
        await c.save();
        result.toDirector++;

        await hostelNotify({ roles: ['director', 'warden'] }, {
            title: `⚠️ ${c.code} escalated to Director`,
            body: `${c.title} — Room ${c.room}. Not repaired in ${directorHours} h.${c.wardenReport?.writtenAt ? ' Warden report is ready.' : ' No warden report yet.'}`,
            type: 'complaint',
            refId: c._id,
            email: true
        });
        await hostelNotify({ studentIds: [c.userId] }, {
            title: 'Your complaint reached the Director',
            body: `${c.code} is now with the hostel director. Sorry for the delay.`,
            type: 'complaint',
            refId: c._id
        });
        emitToStaff('complaintUpdated', { id: String(c._id) });
    }

    // ---- 48 h → Warden ----
    const forWarden = await Complaint.find({
        status: { $in: OPEN },
        level: 'team',
        createdAt: { $lte: new Date(now - wardenHours * HOUR) }
    });
    for (const c of forWarden) {
        c.level = 'warden';
        c.sentToWardenAt = now;
        c.timeline.push(systemStep('escalated', `Not repaired in ${wardenHours} hours — sent to the Warden`));
        await c.save();
        result.toWarden++;

        await hostelNotify({ roles: ['warden', 'attender'] }, {
            title: `⚠️ ${c.code} escalated to Warden`,
            body: `${c.title} — Room ${c.room}. Not repaired in ${wardenHours} h. Please check and write the report.`,
            type: 'complaint',
            refId: c._id,
            email: true
        });
        await hostelNotify({ studentIds: [c.userId] }, {
            title: 'Your complaint reached the Warden',
            body: `${c.code} is now with the hostel warden.`,
            type: 'complaint',
            refId: c._id
        });
        emitToStaff('complaintUpdated', { id: String(c._id) });
    }

    // ---- Auto-close ----
    const stale = await Complaint.find({ status: 'repaired', repairedAt: { $lte: new Date(now - 72 * HOUR) } });
    for (const c of stale) {
        c.status = 'closed';
        c.closedAt = now;
        c.timeline.push(systemStep('closed', 'Closed automatically — student did not reply in 72 hours'));
        await c.save();
        result.autoClosed++;
    }

    return result;
};

const startComplaintEscalation = () => {
    const tick = () => runEscalation()
        .then((r) => {
            if (r.toWarden || r.toDirector || r.autoClosed) console.log('⏱ Complaint escalation:', r);
        })
        .catch((e) => console.error('❌ Escalation error:', e.message));
    setTimeout(tick, 20 * 1000);
    return setInterval(tick, 5 * 60 * 1000);
};

module.exports = { runEscalation, startComplaintEscalation };
