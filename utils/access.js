// =====================================================================
// Works out a student's mess access from the months they have paid for.
// Example: paid Oct + Nov + Dec (3-month plan) → access till 31 Dec 23:59 IST.
// =====================================================================
const Payment = require('../Models/paymentModel');
const User = require('../Models/users');
const { monthKey, endOfMonthIST, normalizeLabel } = require('./months');

/** All successfully paid month labels for a user, normalised & sorted. */
const getPaidMonths = async (userId) => {
    const payments = await Payment.find({
        $or: [{ userId }, { userId: String(userId) }],
        status: { $regex: /^success$/i },
        amount: { $gt: 0 },
    }).select('month').lean();

    const set = new Set(payments.map((p) => normalizeLabel(p.month)).filter(Boolean));
    return [...set].sort((a, b) => monthKey(a) - monthKey(b));
};

/**
 * Recomputes accessExpiresAt from paid months and saves it.
 * Keeps a later manual expiry if the admin granted one.
 * Returns the updated user document.
 */
const refreshAccessFromPayments = async (userId, { keepLaterExpiry = true } = {}) => {
    const user = await User.findById(userId);
    if (!user) return null;

    const months = await getPaidMonths(userId);
    const lastPaid = months.length ? months[months.length - 1] : null;
    let expiry = lastPaid ? endOfMonthIST(lastPaid) : null;

    if (keepLaterExpiry && user.accessExpiresAt && expiry && user.accessExpiresAt > expiry) {
        expiry = user.accessExpiresAt;
    }

    const isApproved = Boolean(expiry && expiry > new Date());

    // updateOne (not user.save) → old students with a missing / wrong email
    // don't block the payment with "Path `email` is required"
    await User.updateOne({ _id: user._id }, { $set: { accessExpiresAt: expiry, isApproved } });

    user.accessExpiresAt = expiry;
    user.isApproved = isApproved;
    return user;
};

module.exports = { getPaidMonths, refreshAccessFromPayments };
