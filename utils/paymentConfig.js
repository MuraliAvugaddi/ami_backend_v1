// =====================================================================
// Mess-fee payment settings. Change them in .env / Render → Environment.
// =====================================================================

const num = (v, def) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : def;
};

const getPaymentConfig = () => ({
    // UPI details printed inside the QR code
    upiId: (process.env.PAYMENT_UPI_ID || '').trim(),
    payeeName: (process.env.PAYMENT_PAYEE_NAME || 'AMI HOSTLERS JAIPUR').trim(),

    // Optional: link to the OFFICIAL QR image from Vyapar / HDFC (upload it to Cloudinary).
    // UPI apps trust the official QR the most. Empty = the app makes its own QR.
    qrImageUrl: (process.env.PAYMENT_QR_IMAGE_URL || '').trim(),

    // Word(s) that must appear on a valid screenshot (checked case-insensitively)
    payeeKeyword: (process.env.PAYMENT_PAYEE_KEYWORD || 'AMI HOSTLERS').trim(),

    // Plans: months → total amount
    plans: [
        // Prices are fixed here. (Old FEE_3_MONTHS / FEE_6_MONTHS in .env are ignored —
        // to change later use FEE_QUARTER / FEE_HALF_SEM.)
        { months: 1, amount: num(process.env.FEE_1_MONTH, 4000), label: 'Monthly' },
        { months: 3, amount: num(process.env.FEE_QUARTER, 12000), label: '3 Months' },
        { months: 6, amount: num(process.env.FEE_HALF_SEM, 20000), label: 'Half Semester' },
    ],

    // A screenshot older than this many days is flagged
    maxScreenshotAgeDays: num(process.env.PAYMENT_MAX_AGE_DAYS, 3),

    // First month shown in admin month lists / Excel "All Year"
    firstMonth: (process.env.FIRST_FEE_MONTH || 'August 2026').trim(),

    // Late fine: after this day of the month, ₹finePerDay for every extra day (no maximum)
    fineAfterDay: num(process.env.FINE_AFTER_DAY, 10),
    finePerDay: num(process.env.FINE_PER_DAY, 20),

    // Shown on receipts
    businessName: (process.env.RECEIPT_BUSINESS_NAME || 'AMI HOSTLERS JAIPUR').trim(),
});

const findPlan = (months) =>
    getPaymentConfig().plans.find((p) => p.months === Number(months)) || null;

module.exports = { getPaymentConfig, findPlan };
