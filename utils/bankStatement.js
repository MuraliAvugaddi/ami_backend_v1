// =====================================================================
// Reads a bank / Vyapar / UPI merchant statement (Excel .xlsx/.xls or .csv)
// and returns only the CREDIT lines (money received) with their UTR.
//
// Works with most Indian bank formats because it finds the columns by
// their heading: "Date", "Narration / Description / Remarks",
// "Ref No / UTR / RRN", "Deposit / Credit / Amount".
// =====================================================================
const XLSX = require('xlsx');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** 12-digit numbers that are not part of a longer number (account numbers are 14+ digits). */
const findUtrs = (text) => {
    const found = String(text || '').match(/(?<!\d)\d{12}(?!\d)/g) || [];
    return [...new Set(found)];
};

/** "₹4,000.00", "4000 CR", "4,000" → 4000. Returns null if not a money value. */
const parseMoney = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const s = String(value).replace(/[₹,\s]|INR|Rs\.?|CR|Cr/gi, '');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    return parseFloat(s);
};

/** IST day string "2026-10-23" from a Date. */
const dayKey = (date) => {
    if (!date || Number.isNaN(new Date(date).getTime())) return '';
    return new Date(new Date(date).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
};

/** Builds a Date at noon IST for that calendar day (safe from timezone shifts). */
const istNoon = (y, m, d) => {
    if (y < 100) y += 2000;
    const date = new Date(Date.UTC(y, m, d, 6, 30, 0)); // 06:30 UTC = 12:00 IST
    return Number.isNaN(date.getTime()) || date.getUTCMonth() !== m ? null : date;
};

/** Reads dates like 23/10/26, 23-10-2026, 23-Oct-2026, 2026-10-23, Excel dates. */
const parseDate = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : istNoon(value.getFullYear(), value.getMonth(), value.getDate());
    }
    if (typeof value === 'number' && value > 30000 && value < 80000) {
        const p = XLSX.SSF.parse_date_code(value);
        return p ? istNoon(p.y, p.m - 1, p.d) : null;
    }
    const s = String(value).trim();
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return istNoon(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2,4})/);
    if (m) return istNoon(+m[3], +m[2] - 1, +m[1]);
    m = s.match(/^(\d{1,2})[-/.\s]([A-Za-z]{3,9})[-/.,\s]+(\d{2,4})/);
    if (m) {
        const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
        if (mi >= 0) return istNoon(+m[3], mi, +m[1]);
    }
    m = s.match(/^([A-Za-z]{3,9})[\s-]+(\d{1,2}),?[\s-]+(\d{4})/);
    if (m) {
        const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
        if (mi >= 0) return istNoon(+m[3], mi, +m[2]);
    }
    return null;
};

const norm = (h) => String(h || '').toLowerCase().replace(/[^a-z]/g, ' ').replace(/\s+/g, ' ').trim();

/** Finds the heading row and the column numbers. */
const findColumns = (rows) => {
    for (let r = 0; r < Math.min(rows.length, 60); r++) {
        const heads = (rows[r] || []).map(norm);
        if (heads.filter(Boolean).length < 3) continue;

        const find = (test) => heads.findIndex((h) => h && test(h));

        const credit = find((h) => /(deposit|credit|cr amount|received|money in)/.test(h) && !/debit|card/.test(h));
        const amount = find((h) => /\bamount\b|\bamt\b/.test(h) && !/(debit|withdraw|balance|charge|fee|tax|commission)/.test(h));
        const debit = find((h) => /(withdraw|debit|dr amount)/.test(h));
        const drcr = find((h) => /^(dr cr|cr dr|type|txn type|transaction type|debit credit)$/.test(h));
        const ref = find((h) => /(utr|rrn|ref|reference|transaction id|txn id|upi id|bank ref)/.test(h) && !/date/.test(h));
        const narration = find((h) => /(narration|description|particular|remark|details)/.test(h));
        const status = find((h) => /^(status|txn status|transaction status)$/.test(h));
        const date = (() => {
            const pref = find((h) => /(txn|transaction|tran|value)? ?date/.test(h) && /(txn|transaction|tran)/.test(h));
            return pref >= 0 ? pref : find((h) => /date/.test(h));
        })();

        const moneyCol = credit >= 0 ? credit : amount;
        if (moneyCol >= 0 && (ref >= 0 || narration >= 0)) {
            return { headerRow: r, credit, amount, moneyCol, debit, drcr, ref, narration, date, status };
        }
    }
    return null;
};

/**
 * @param {Buffer} buffer  file content
 * @returns {{ ok: boolean, message?: string, rowsRead: number, credits: Array }}
 *          credits: [{ utr, altUtrs, amount, txnDate, txnDay, narration }]
 */
const parseStatement = (buffer) => {
    let workbook;
    try {
        workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
    } catch (e) {
        return { ok: false, message: 'Could not open this file. Download the statement as Excel (.xlsx / .xls) or CSV.', rowsRead: 0, credits: [] };
    }

    const credits = [];
    let rowsRead = 0;
    let columnsFound = false;

    for (const sheetName of workbook.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: '' });
        const cols = findColumns(rows);
        if (!cols) continue;
        columnsFound = true;

        for (let r = cols.headerRow + 1; r < rows.length; r++) {
            const row = rows[r] || [];
            if (!row.some((c) => String(c).trim())) continue;
            rowsRead++;

            // Skip failed / pending lines (merchant reports have a Status column)
            if (cols.status >= 0 && /(fail|pending|declin|revers|refund)/i.test(String(row[cols.status]))) continue;

            // Only money RECEIVED
            let amount = parseMoney(row[cols.moneyCol]);
            if (cols.credit < 0) {
                if (cols.drcr >= 0 && /^(dr|debit|d)$/i.test(String(row[cols.drcr]).trim())) continue;
                if (cols.debit >= 0 && parseMoney(row[cols.debit]) > 0 && !(amount > 0)) continue;
                if (typeof row[cols.moneyCol] === 'string' && /\bdr\b/i.test(row[cols.moneyCol])) continue;
            }
            if (!(amount > 0)) continue;

            const refText = cols.ref >= 0 ? String(row[cols.ref]) : '';
            const narration = cols.narration >= 0 ? String(row[cols.narration]) : '';
            // HDFC writes the UPI ref as 0000412345678901 (zero-padded to 16 digits)
            const refDigits = refText.replace(/\s/g, '');
            const refUtrs = findUtrs(/^0+\d{12}$/.test(refDigits) ? refDigits.slice(-12) : refDigits);
            const narUtrs = findUtrs(narration);
            const all = [...new Set([...refUtrs, ...narUtrs])];
            if (!all.length) continue;

            const txnDate = cols.date >= 0 ? parseDate(row[cols.date]) : null;
            credits.push({
                utr: all[0],
                altUtrs: all.slice(1),
                amount: Math.round(amount * 100) / 100,
                txnDate,
                txnDay: dayKey(txnDate),
                narration: (narration || refText).slice(0, 200),
            });
        }
    }

    if (!columnsFound) {
        return {
            ok: false,
            message: 'Could not find the columns in this file. It needs a heading row with Date, Narration/Reference (UTR) and Credit/Deposit/Amount.',
            rowsRead: 0,
            credits: [],
        };
    }
    return { ok: true, rowsRead, credits };
};

module.exports = { parseStatement, findUtrs, parseDate, dayKey };
