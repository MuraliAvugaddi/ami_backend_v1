// =====================================================================
// One place that answers: "Has this student paid? Is a fine due?"
// Used by the student app (reminders, pay screen) and the admin cash dialog.
//
// Fine rule (change in .env): unpaid after the 10th → ₹20 for every
// extra day (11th = ₹20, 12th = ₹40 …), no maximum.
// =====================================================================
const User = require('../Models/users');
const Payment = require('../Models/paymentModel');
const PaymentSubmission = require('../Models/paymentSubmissionModel');
const { getPaymentConfig } = require('./paymentConfig');
const { getPaidMonths } = require('./access');
const {
    currentMonthParts, toLabel, addMonths, normalizeLabel, nowIST,
} = require('./months');

const DAY_MS = 24 * 60 * 60 * 1000;

/** Months that already have a pending screenshot for this student. */
const getPendingMonths = async (userId) => {
    const pending = await PaymentSubmission.find({ userId, status: 'pending' }).select('months').lean();
    return pending.flatMap((p) => p.months.map(normalizeLabel));
};

/** First month (from the current IST month) that is neither paid nor pending. */
const firstOpenMonth = (blocked) => {
    let m = currentMonthParts();
    for (let i = 0; i < 24; i++) {
        const label = toLabel(m);
        if (!blocked.has(label)) return label;
        m = addMonths(m, 1);
    }
    return toLabel(currentMonthParts());
};

/** Late fine for TODAY if the current month is unpaid. */
const fineForToday = (config = getPaymentConfig()) => {
    const day = nowIST().getUTCDate();
    return day > config.fineAfterDay ? (day - config.fineAfterDay) * config.finePerDay : 0;
};

/**
 * @returns {Promise<object|null>}
 *  state: 'active' | 'expiring' | 'pending' | 'due' | 'late'
 */
const computeFeeStatus = async (userId) => {
    const config = getPaymentConfig();
    const user = await User.findById(userId)
        .select('name enrollmentNo room hostelblock accessExpiresAt isApproved')
        .lean();
    if (!user) return null;

    const [paidMonths, pendingMonths, lastPayment] = await Promise.all([
        getPaidMonths(userId),
        getPendingMonths(userId),
        Payment.findOne({ $or: [{ userId }, { userId: String(userId) }], status: { $regex: /^success$/i } })
            .sort({ paidAt: -1 })
            .select('planMonths month paidAt')
            .lean(),
    ]);

    const now = new Date();
    const currentMonth = toLabel(currentMonthParts());
    const expiry = user.accessExpiresAt ? new Date(user.accessExpiresAt) : null;
    const coveredNow = Boolean(expiry && expiry > now);
    const paidCurrent = coveredNow || paidMonths.includes(currentMonth);
    const pendingCurrent = !paidCurrent && pendingMonths.includes(currentMonth);

    const blocked = new Set([...paidMonths, ...pendingMonths]);
    const startMonth = firstOpenMonth(blocked);

    const fine = !paidCurrent && !pendingCurrent ? fineForToday(config) : 0;
    const daysLeft = coveredNow ? Math.ceil((expiry - now) / DAY_MS) : 0;
    const dayOfMonth = nowIST().getUTCDate();

    let state;
    if (paidCurrent) state = daysLeft <= 3 ? 'expiring' : 'active';
    else if (pendingCurrent) state = 'pending';
    else state = dayOfMonth > config.fineAfterDay ? 'late' : 'due';

    return {
        state,
        currentMonth,
        startMonth,
        accessExpiresAt: expiry,
        daysLeft,
        fine,
        fineAfterDay: config.fineAfterDay,
        finePerDay: config.finePerDay,
        monthlyFee: config.plans[0].amount,
        lastPlanMonths: lastPayment?.planMonths || 1,
        paidMonths,
        pendingMonths,
        student: {
            name: user.name || '',
            enrollmentNo: user.enrollmentNo || '',
            room: user.room || '',
            hostelblock: user.hostelblock || '',
        },
    };
};

module.exports = { computeFeeStatus, getPendingMonths, firstOpenMonth, fineForToday };
