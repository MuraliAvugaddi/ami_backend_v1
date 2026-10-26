// =====================================================================
// Month helpers — all month labels look like "October 2026".
// All "now" calculations use Indian time (IST, UTC+5:30), because
// Render servers run in UTC.
// =====================================================================

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Current date shifted to IST (read it with getUTC* methods). */
const nowIST = () => new Date(Date.now() + IST_OFFSET_MS);

/** { month: 0-11, year } for the current IST month. */
const currentMonthParts = () => {
    const d = nowIST();
    return { month: d.getUTCMonth(), year: d.getUTCFullYear() };
};

const toLabel = ({ month, year }) => `${MONTH_NAMES[month]} ${year}`;

/** "October 2026" (also accepts "oct 2026", "October-2026") → { month, year } or null */
const parseLabel = (label) => {
    if (!label) return null;
    const parts = String(label).trim().replace(/[-_/,]+/g, ' ').split(/\s+/);
    if (parts.length < 2) return null;
    const name = parts[0].toLowerCase();
    const month = MONTH_NAMES.findIndex(
        (m) => m.toLowerCase() === name || m.slice(0, 3).toLowerCase() === name.slice(0, 3)
    );
    const year = parseInt(parts[1], 10);
    if (month < 0 || Number.isNaN(year)) return null;
    return { month, year };
};

/** Normalises any month string to "October 2026" (or returns the original if unreadable). */
const normalizeLabel = (label) => {
    const p = parseLabel(label);
    return p ? toLabel(p) : String(label || '').trim();
};

const addMonths = ({ month, year }, n) => {
    const total = year * 12 + month + n;
    return { month: total % 12, year: Math.floor(total / 12) };
};

/** Sort key so months can be compared: 2026*12 + 9 */
const monthKey = (label) => {
    const p = typeof label === 'string' ? parseLabel(label) : label;
    return p ? p.year * 12 + p.month : -1;
};

/** Last moment of the month in IST (23:59:59 IST), returned as a real UTC Date. */
const endOfMonthIST = (labelOrParts) => {
    const p = typeof labelOrParts === 'string' ? parseLabel(labelOrParts) : labelOrParts;
    if (!p) return null;
    // Day 0 of next month = last day of this month. 23:59:59 IST = 18:29:59 UTC.
    return new Date(Date.UTC(p.year, p.month + 1, 0, 18, 29, 59));
};

/** n consecutive month labels starting at startLabel. */
const consecutiveMonths = (startLabel, n) => {
    const start = parseLabel(startLabel);
    if (!start) return [];
    return Array.from({ length: n }, (_, i) => toLabel(addMonths(start, i)));
};

/** Month list from startLabel up to (current month + monthsAhead). Used for admin dropdowns & Excel. */
const monthRange = (startLabel, monthsAhead = 0) => {
    const start = parseLabel(startLabel) || currentMonthParts();
    const end = addMonths(currentMonthParts(), monthsAhead);
    const out = [];
    let cur = start;
    let guard = 0;
    while (monthKey(cur) <= monthKey(end) && guard < 60) {
        out.push(toLabel(cur));
        cur = addMonths(cur, 1);
        guard++;
    }
    return out;
};

module.exports = {
    MONTH_NAMES,
    nowIST,
    currentMonthParts,
    toLabel,
    parseLabel,
    normalizeLabel,
    addMonths,
    monthKey,
    endOfMonthIST,
    consecutiveMonths,
    monthRange,
};
