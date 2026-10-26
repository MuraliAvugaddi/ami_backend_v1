const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const User = require('../../Models/users');
const Payment = require('../../Models/paymentModel');
const MealSkip = require('../../Models/mealSkipModel');
const PaymentSubmission = require('../../Models/paymentSubmissionModel');
const { findUtrOwner, normalizeUtr } = require('../../utils/utr');
const { refreshAccessFromPayments } = require('../../utils/access');
const { endOfMonthIST, currentMonthParts, monthKey, monthRange, normalizeLabel } = require('../../utils/months');
const { getPaymentConfig } = require('../../utils/paymentConfig');

// Helper to safely find user by ID, enrollmentNo, or phone
const findUserSafely = async (rawId) => {
    if (!rawId) return null;
    const cleanId = String(rawId).trim();
    if (mongoose.Types.ObjectId.isValid(cleanId)) {
        const found = await User.findById(cleanId);
        if (found) return found;
    }
    return await User.findOne({
        $or: [
            { _id: cleanId },
            { id: cleanId },
            { enrollmentNo: cleanId },
            { phonenumber: cleanId }
        ]
    });
};

// Helper: Checks if the input is a genuine numeric bank/UPI UTR (ignores words like 'unpaid', 'cash', etc.)
const isRealNumericUtr = (val) => {
    if (!val) return false;
    const clean = String(val).trim().toLowerCase();
    const ignoredWords = ['unpaid', 'pending', 'due', 'none', 'null', 'n/a', 'na'];
    if (ignoredWords.includes(clean) || clean.startsWith('cash')) {
        return false;
    }
    // Must contain at least 6 digits to be recognized as a genuine transaction reference
    const digitsOnly = clean.replace(/\D/g, '');
    return digitsOnly.length >= 6;
};

// 1. Fetch all users for admin dashboard (Auto-evaluates expired access)
const getAllUsers = async (req, res) => {
    try {
        const users = await User.find({}).select('-password').sort({ createdAt: -1 }).lean();
        const now = new Date();

        const formattedUsers = users.map((u) => {
            const stringId = u._id ? u._id.toString() : (u.id ? u.id.toString() : '');

            let isCurrentlyApproved = Boolean(u.isApproved);
            if (u.accessExpiresAt && new Date(u.accessExpiresAt) < now) {
                isCurrentlyApproved = false;
            }

            return {
                ...u,
                _id: stringId,
                id: stringId,
                name: u.name || 'Unnamed Student',
                enrollmentNo: u.enrollmentNo ? String(u.enrollmentNo) : 'N/A',
                phonenumber: u.phonenumber ? String(u.phonenumber) : '',
                course: u.course || 'N/A',
                year: u.year ? String(u.year) : '1',
                room: u.room ? String(u.room) : 'N/A',
                gender: u.gender || 'All',
                fatherPhone: u.fatherPhone ? String(u.fatherPhone) : '',
                isApproved: isCurrentlyApproved,
                accessExpiresAt: u.accessExpiresAt || null,
            };
        });

        res.status(200).json(formattedUsers);
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: 'Server error while fetching users.' });
    }
};

// 2. Approve/Deactivate User
const updateUserStatus = async (req, res) => {
    try {
        const rawUserId = req.params.userId || req.body.userId;
        const { isApproved } = req.body;
        const io = req.io;

        if (!rawUserId || rawUserId === 'undefined' || rawUserId === 'null' || rawUserId === 'N/A') {
            return res.status(400).json({ message: 'Valid Student User ID is required.' });
        }

        const cleanUserId = String(rawUserId).trim();
        const boolApproved = (isApproved === true || isApproved === 'true' || isApproved === 1);

        // End of the current month in IST — but never shorten a prepaid 3/6-month plan
        let lastDayOfMonth = endOfMonthIST(currentMonthParts());
        const existingUser = mongoose.Types.ObjectId.isValid(cleanUserId)
            ? await User.findById(cleanUserId).select('accessExpiresAt').lean()
            : null;
        if (existingUser?.accessExpiresAt && new Date(existingUser.accessExpiresAt) > lastDayOfMonth) {
            lastDayOfMonth = new Date(existingUser.accessExpiresAt);
        }

        const filter = mongoose.Types.ObjectId.isValid(cleanUserId)
            ? { _id: new mongoose.Types.ObjectId(cleanUserId) }
            : { $or: [{ _id: cleanUserId }, { id: cleanUserId }] };

        const updatedUser = await User.findOneAndUpdate(
            filter,
            {
                $set: {
                    isApproved: boolApproved,
                    accessExpiresAt: boolApproved ? lastDayOfMonth : null
                }
            },
            { new: true, runValidators: false }
        ).select('-password');

        if (!updatedUser) {
            return res.status(404).json({ message: 'Student account not found in database.' });
        }

        const idStr = updatedUser._id.toString();

        if (io) {
            io.emit('statusUpdated', {
                userId: idStr,
                isApproved: updatedUser.isApproved,
                accessExpiresAt: updatedUser.accessExpiresAt
            });
        }

        res.status(200).json({
            success: true,
            user: {
                ...updatedUser.toObject(),
                _id: idStr,
                id: idStr
            }
        });
    } catch (error) {
        console.error("Status update error:", error);
        res.status(500).json({ message: 'Error updating user status', error: error.message });
    }
};

// 3. Fast Global Monthly Payment History (POPULATES STUDENT DETAILS)
const getAllPayments = async (req, res) => {
    try {
        let { month, gender, date, userId } = req.query;

        if (userId) {
            const cleanUid = String(userId).trim();
            const userFilters = [{ userId: cleanUid }];
            if (mongoose.Types.ObjectId.isValid(cleanUid)) {
                userFilters.push({ userId: new mongoose.Types.ObjectId(cleanUid) });
            }

            const userPayments = await Payment.find({ $or: userFilters })
                .populate({
                    path: 'userId',
                    select: 'name enrollmentNo course year room hostelblock phonenumber gender'
                })
                .sort({ updatedAt: -1, paidAt: -1 })
                .lean();

            return res.status(200).json({ success: true, payments: userPayments });
        }

        let query = {};
        if (date) {
            const startDate = new Date(date);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);
            query.paidAt = { $gte: startDate, $lte: endDate };
        } else if (month && month !== 'All Year' && month !== 'All') {
            query.month = { $regex: new RegExp(`^${month.trim()}$`, 'i') };
        }

        // 🔑 POPULATE userId so Flutter receives the full student profile
        let payments = await Payment.find(query)
            .populate({
                path: 'userId',
                select: 'name enrollmentNo course year room hostelblock phonenumber gender'
            })
            .sort({ paidAt: -1 })
            .lean();

        // Filter by student gender if requested
        if (gender && gender !== 'All') {
            payments = payments.filter(
                p => p.userId && p.userId.gender && p.userId.gender.toLowerCase() === gender.toLowerCase()
            );
        }

        res.status(200).json(payments);
    } catch (error) {
        console.error("Sync payment error:", error);
        res.status(500).json({ message: "Failed to sync payment records" });
    }
};

// 4. Deactivate All Users
const deactivateAllUsers = async (req, res) => {
    try {
        const { io } = req;
        // Students who prepaid (3/6-month plans) keep their access.
        const now = new Date();
        const result = await User.updateMany(
            { $or: [{ accessExpiresAt: null }, { accessExpiresAt: { $lt: now } }] },
            { $set: { isApproved: false, accessExpiresAt: null } }
        );
        if (io) io.emit('statusUpdated', { isApproved: false, accessExpiresAt: null });

        res.status(200).json({
            success: true,
            message: `${result.modifiedCount ?? 0} students deactivated for the new month. Prepaid students kept their access.`,
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error deactivating users.' });
    }
};

// 5. Fetch Meal Skipping Report
const getAdminSkipReport = async (req, res) => {
    try {
        const { date, mealType } = req.query;
        let query = { date: date };

        if (mealType && mealType !== 'All') {
            query.mealType = mealType;
        }

        const report = await MealSkip.find(query)
            .populate('userId', 'name phonenumber fatherPhone gender room enrollmentNo course')
            .sort({ mealType: 1 })
            .lean();

        const stats = {
            breakfast: report.filter(item => item.mealType === 'Breakfast').length,
            lunch: report.filter(item => item.mealType === 'Lunch').length,
            snacks: report.filter(item => item.mealType === 'Snacks').length,
            dinner: report.filter(item => item.mealType === 'Dinner').length,
            fullDay: report.filter(item => item.mealType === 'Full Day').length,
            total: report.length
        };

        res.status(200).json({
            success: true,
            date: date,
            stats: stats,
            report: report
        });
    } catch (error) {
        res.status(500).json({ message: "Error fetching report" });
    }
};

// 6. Record Manual Payment (WITH STRICT NUMERIC DUPLICATE UTR PROTECTION)
const recordManualPayment = async (req, res) => {
    try {
        const { userId, studentId, amount, month, paymentsData, transactionId, paymentDate, date, fatherPhone } = req.body;
        const io = req.io;

        const targetId = userId || studentId;
        if (!targetId) {
            return res.status(400).json({ message: "Student ID is required." });
        }

        const user = await findUserSafely(targetId);
        if (!user) {
            return res.status(404).json({ message: "Student account not found in database." });
        }

        if (fatherPhone && String(fatherPhone).trim() !== '') {
            user.fatherPhone = String(fatherPhone).trim();
        }

        const effectiveDate = paymentDate || date;
        const parsedPaymentDate = effectiveDate ? new Date(effectiveDate) : new Date();
        const parsedAmount = Number(amount);
        const finalAmount = (!isNaN(parsedAmount) && parsedAmount > 0) ? parsedAmount : 4000;

        let recordsToProcess = [];
        if (paymentsData && Array.isArray(paymentsData) && paymentsData.length > 0) {
            recordsToProcess = paymentsData;
        } else {
            recordsToProcess = [{
                month: month || "October 2026",
                transactionId: transactionId || `CASH_${Date.now()}`
            }];
        }

        // =========================================================================
        // 🔒 DUPLICATE UTR VALIDATION (CHECKS REAL NUMERIC UTRs ONLY)
        // =========================================================================
        for (const item of recordsToProcess) {
            const rawTxn = item.transactionId ? String(item.transactionId).trim() : '';

            if (isRealNumericUtr(rawTxn)) {
                // Also checks screenshots uploaded by students
                const owner = await findUtrOwner(normalizeUtr(rawTxn), { excludeUserId: user._id });
                if (owner && owner.where !== 'own-pending') {
                    return res.status(400).json({
                        success: false,
                        message: `Duplicate UTR detected! Transaction ID (${rawTxn}) was already recorded for ${owner.name} (${owner.month}). Reusing bank screenshots is strictly prohibited.`
                    });
                }

                const existingTxn = await Payment.findOne({
                    transactionId: { $regex: new RegExp(`^${rawTxn}$`, 'i') },
                    status: 'Success'
                }).populate('userId', 'name phonenumber enrollmentNo').lean();

                if (existingTxn && isRealNumericUtr(existingTxn.transactionId)) {
                    const existingUid = existingTxn.userId ? String(existingTxn.userId._id || existingTxn.userId.id || existingTxn.userId) : '';
                    const currentUid = String(user._id);

                    const isDifferentStudent = existingUid && existingUid !== currentUid;
                    // Same student + same UTR is allowed (one payment for a 3 or 6 month plan)
                    if (isDifferentStudent) {
                        const previousStudentName = existingTxn.userId?.name || "Another Student";
                        const previousMonth = existingTxn.month || "a past month";
                        return res.status(400).json({
                            success: false,
                            message: `Duplicate UTR detected! Transaction ID (${rawTxn}) was already recorded for ${previousStudentName} (${previousMonth}). Reusing bank screenshots is strictly prohibited.`
                        });
                    }
                }
            }
        }

        // =========================================================================
        // SAVE OR UPDATE PAYMENT
        // =========================================================================
        for (const item of recordsToProcess) {
            const targetMonth = String(item.month || '').trim();
            if (!targetMonth) continue;

            const txnId = item.transactionId ? String(item.transactionId).trim() : `CASH_${Date.now()}`;
            const monthPrefix = targetMonth.split(' ')[0];
            const monthYear = targetMonth.split(' ')[1] || '';

            const userMatchFilter = {
                $or: [
                    { userId: user._id },
                    { userId: user._id.toString() }
                ],
                month: { $regex: new RegExp(`^${monthPrefix}\\s*${monthYear}`, 'i') }
            };

            await Payment.findOneAndUpdate(
                userMatchFilter,
                {
                    $set: {
                        userId: user._id,
                        amount: finalAmount,
                        method: 'offline',
                        transactionId: txnId,
                        month: targetMonth,
                        status: 'Success',
                        paidAt: parsedPaymentDate,
                        planMonths: recordsToProcess.length,
                        source: 'manual',
                        updatedAt: new Date()
                    }
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            const allMatches = await Payment.find(userMatchFilter).sort({ updatedAt: -1 });
            if (allMatches.length > 1) {
                const idsToDelete = allMatches.slice(1).map(d => d._id);
                await Payment.deleteMany({ _id: { $in: idsToDelete } });
            }
        }

        await user.save(); // saves fatherPhone
        // Access runs till the end of the LAST paid month (e.g. 3-month plan → 3 months)
        const refreshed = await refreshAccessFromPayments(user._id);
        if (refreshed) {
            user.isApproved = refreshed.isApproved;
            user.accessExpiresAt = refreshed.accessExpiresAt;
        }

        if (io) {
            io.emit('statusUpdated', {
                userId: user._id.toString(),
                isApproved: user.isApproved,
                accessExpiresAt: user.accessExpiresAt
            });
        }

        res.status(200).json({
            success: true,
            message: "Payment records successfully saved/updated & access granted."
        });
    } catch (error) {
        console.error("Manual payment update error:", error);
        res.status(500).json({ message: "Server error recording payment.", error: error.message });
    }
};

// 7. Reset / Delete an Accidental Month Payment
const deleteMonthPayment = async (req, res) => {
    try {
        const { userId, month } = req.body;
        if (!userId || !month) {
            return res.status(400).json({ message: "Student ID and month are required." });
        }

        const user = await findUserSafely(userId);
        if (!user) {
            return res.status(404).json({ message: "Student not found in database." });
        }

        const label = normalizeLabel(month);
        const monthPrefix = label.split(' ')[0];
        const monthYear = label.split(' ')[1] || '';

        await Payment.deleteMany({
            $or: [
                { userId: user._id },
                { userId: user._id.toString() }
            ],
            month: { $regex: new RegExp(`^${monthPrefix}\\s*${monthYear}`, 'i') }
        });

        // If this month came from an approved screenshot, mark that request as reset
        await PaymentSubmission.updateMany(
            { userId: user._id, status: 'approved', months: label },
            { $set: { status: 'rejected', rejectReason: `Reset by admin (${label})`, reviewedAt: new Date() } }
        );

        // Recalculate access from the months that are still paid
        const refreshed = await refreshAccessFromPayments(user._id, { keepLaterExpiry: false });
        if (req.io && refreshed) {
            req.io.emit('statusUpdated', {
                userId: String(refreshed._id),
                isApproved: refreshed.isApproved,
                accessExpiresAt: refreshed.accessExpiresAt
            });
        }

        return res.status(200).json({
            success: true,
            message: `Payment record for ${month} successfully deleted and marked unpaid.`
        });
    } catch (error) {
        console.error("Delete month payment error:", error);
        return res.status(500).json({ message: "Server error resetting month payment." });
    }
};

// 8. Delete Student Completely (Admin Panel)
const deleteUser = async (req, res) => {
    try {
        const rawUserId = req.params.userId || req.body.userId;
        const io = req.io;

        if (!rawUserId) {
            return res.status(400).json({ message: "Student ID is required." });
        }

        const cleanUserId = String(rawUserId).trim();
        const filter = mongoose.Types.ObjectId.isValid(cleanUserId)
            ? { _id: new mongoose.Types.ObjectId(cleanUserId) }
            : { $or: [{ _id: cleanUserId }, { id: cleanUserId }] };

        const deletedUser = await User.findOneAndDelete(filter);
        if (!deletedUser) {
            return res.status(404).json({ message: "Student account not found." });
        }

        const studentId = deletedUser._id;

        // Clean up student's payments and meal skips
        await Payment.deleteMany({
            $or: [
                { userId: studentId },
                { userId: studentId.toString() }
            ]
        });

        await MealSkip.deleteMany({
            $or: [
                { userId: studentId },
                { userId: studentId.toString() }
            ]
        });

        if (io) {
            io.emit('studentDeleted', { userId: studentId.toString() });
        }

        res.status(200).json({
            success: true,
            message: `Student ${deletedUser.name} and related records have been deleted.`
        });
    } catch (error) {
        console.error("Delete student error:", error);
        res.status(500).json({ message: "Server error deleting student.", error: error.message });
    }
};

// 9. Export Filtered Student Payment Status to Excel
// Months are automatic: from FIRST_FEE_MONTH (.env, default "August 2026")
// up to the current month (+ any month someone has already prepaid).
const exportStudentReportExcel = async (req, res) => {
    try {
        const { yearGroup, gender, month, unpaidOnly } = req.query;
        const isUnpaidFilterActive = (unpaidOnly === 'true' || unpaidOnly === true || unpaidOnly === '1');

        let userQuery = {};
        if (gender && gender !== 'All') {
            userQuery.gender = { $regex: new RegExp(`^${gender.trim()}$`, 'i') };
        }

        if (yearGroup === 'Junior') {
            userQuery.year = { $in: ['1', 1] };
        } else if (yearGroup === 'Senior') {
            // ✅ FIX: old query `$or: [{year:{$ne:'1'}}, {year:{$ne:1}}]` matched everyone
            userQuery.year = { $nin: ['1', 1] };
        }

        const users = await User.find(userQuery).select('-password').sort({ name: 1 }).lean();
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(isUnpaidFilterActive ? 'Unpaid Students' : 'Student Mess Report');

        const monthNames = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];

        const formatDate = (value) => {
            if (!value) return '-';
            const d = new Date(value);
            if (Number.isNaN(d.getTime())) return '-';
            // Show the date in Indian time
            const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
            return `${String(ist.getUTCDate()).padStart(2, '0')}-${monthNames[ist.getUTCMonth()].slice(0, 3)}-${ist.getUTCFullYear()}`;
        };

        const allPayments = await Payment.find({ status: { $regex: /^success$/i }, amount: { $gt: 0 } }).lean();
        const userPaymentsMap = {};
        for (const p of allPayments) {
            if (p.userId) {
                const uid = p.userId.toString();
                if (!userPaymentsMap[uid]) userPaymentsMap[uid] = {};
                userPaymentsMap[uid][normalizeLabel(p.month)] = p;
            }
        }

        const baseColumns = [
            { header: 'S.No', key: 'sno', width: 8 },
            { header: 'Student Name', key: 'name', width: 25 },
            { header: 'Enrollment No', key: 'enrollmentNo', width: 18 },
            { header: 'Gender', key: 'gender', width: 10 },
            { header: 'Year', key: 'year', width: 8 },
            { header: 'Room', key: 'room', width: 10 },
            { header: 'Course', key: 'course', width: 15 },
            { header: 'Phone Number', key: 'phonenumber', width: 16 },
            { header: 'Father Phone', key: 'fatherPhone', width: 16 },
        ];

        const baseRow = (u, sno) => ({
            sno,
            name: u.name,
            enrollmentNo: u.enrollmentNo || 'N/A',
            gender: u.gender || 'N/A',
            year: u.year || '1',
            room: u.room || 'N/A',
            course: u.course || 'N/A',
            phonenumber: u.phonenumber || 'N/A',
            fatherPhone: (u.fatherPhone && String(u.fatherPhone).trim() !== '') ? u.fatherPhone : 'N/A',
        });

        const sendWorkbook = async (fileName) => {
            sheet.getRow(1).font = { bold: true };
            sheet.views = [{ state: 'frozen', ySplit: 1 }];
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            // ✅ Expose headers so Flutter Web can access file download streams
            res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
            await workbook.xlsx.write(res);
            return res.end();
        };

        if (month === 'All Year') {
            // Automatic month list: first fee month → current month, plus any prepaid future month
            const config = getPaymentConfig();
            const monthSet = new Set(monthRange(config.firstMonth, 0));
            for (const p of allPayments) {
                const label = normalizeLabel(p.month);
                if (monthKey(label) >= monthKey(config.firstMonth)) monthSet.add(label);
            }
            const months = [...monthSet].sort((a, b) => monthKey(a) - monthKey(b));
            const currentLabel = `${monthNames[currentMonthParts().month]} ${currentMonthParts().year}`;

            sheet.columns = [
                ...baseColumns,
                ...months.map((m, i) => ({ header: `${m.slice(0, 3)} ${m.split(' ')[1]} Payment`, key: `m${i}`, width: 24 })),
                { header: 'Status', key: 'status', width: 18 },
            ];

            let rowCount = 0;
            users.forEach((u) => {
                const uidStr = u._id ? u._id.toString() : '';
                const pays = userPaymentsMap[uidStr] || {};
                const isPaidAll = months.every((m) => pays[m]);
                if (isUnpaidFilterActive && isPaidAll) return;

                rowCount++;
                const row = baseRow(u, rowCount);
                months.forEach((m, i) => {
                    const p = pays[m];
                    row[`m${i}`] = p ? `₹${p.amount} [${p.transactionId || 'Cash'}]` : 'UNPAID';
                });
                const curShort = currentLabel.slice(0, 3).toUpperCase();
                row.status = pays[currentLabel] ? `PAID ${curShort}` : `UNPAID ${curShort}`;
                sheet.addRow(row);
            });

            return sendWorkbook(`Ami_${isUnpaidFilterActive ? 'UNPAID_' : ''}Yearly_Report_${yearGroup || 'All'}.xlsx`);
        }

        const targetMonth = normalizeLabel(month || `${monthNames[currentMonthParts().month]} ${currentMonthParts().year}`);

        sheet.columns = [
            ...baseColumns,
            { header: `${targetMonth} Status`, key: 'monthStatus', width: 18 },
            { header: 'Amount', key: 'amount', width: 12 },
            { header: 'UTR / Txn ID', key: 'txnId', width: 22 },
            { header: 'Payment Date', key: 'paidAt', width: 16 },
            { header: 'Plan', key: 'plan', width: 12 },
            { header: 'Mode', key: 'mode', width: 14 },
            { header: 'Screenshot', key: 'screenshot', width: 40 },
        ];

        let rowCount = 0;
        users.forEach((u) => {
            const uidStr = u._id ? u._id.toString() : '';
            const pay = (userPaymentsMap[uidStr] || {})[targetMonth];
            const isPaid = Boolean(pay);
            if (isUnpaidFilterActive && isPaid) return;

            rowCount++;
            const row = {
                ...baseRow(u, rowCount),
                monthStatus: isPaid ? 'PAID' : 'UNPAID',
                amount: isPaid ? `₹${pay.amount}` : '0',
                txnId: isPaid ? (pay.transactionId || 'Cash') : '-',
                paidAt: isPaid ? formatDate(pay.paidAt) : '-',
                plan: isPaid ? `${pay.planMonths || 1} Month${(pay.planMonths || 1) > 1 ? 's' : ''}` : '-',
                mode: isPaid ? (pay.source === 'screenshot' ? 'UPI Screenshot' : pay.method === 'offline' ? 'Manual / Cash' : 'Online') : '-',
                screenshot: isPaid && pay.screenshotUrl ? { text: 'View screenshot', hyperlink: pay.screenshotUrl } : '-',
            };
            sheet.addRow(row);
        });

        return sendWorkbook(`Ami_${isUnpaidFilterActive ? 'UNPAID_' : ''}Mess_Report_${yearGroup || 'All'}_${targetMonth.replace(/\s+/g, '_')}.xlsx`);
    } catch (error) {
        console.error("Excel export error:", error);
        res.status(500).json({ message: "Failed to generate Excel report" });
    }
};

module.exports = {
    getAllUsers,
    updateUserStatus,
    getAllPayments,
    deactivateAllUsers,
    getAdminSkipReport,
    recordManualPayment,
    deleteMonthPayment,
    deleteUser,
    exportStudentReportExcel,
};