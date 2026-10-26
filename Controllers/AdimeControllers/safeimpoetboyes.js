// const path = require('path');
// require('dotenv').config({ path: path.join(__dirname, '../../.env') });
// const mongoose = require('mongoose');
// const xlsx = require('xlsx');

// const User = require('../../Models/users');
// const Payment = require('../../Models/paymentModel');

// let DRY_RUN = false; 

// function cleanPhone(raw) {
//     if (!raw) return '';
//     let str = String(raw).replace(/\D/g, '').trim();
//     if (str.length > 10 && str.startsWith('91')) {
//         str = str.slice(-10);
//     }
//     return str.slice(-10);
// }

// function evaluateCell(val) {
//     if (val === undefined || val === null) return { isEmpty: true, isNA: false, value: '' };
//     const str = String(val).trim();
//     if (str === '') return { isEmpty: true, isNA: false, value: '' };
//     if (str.toLowerCase() === 'n/a' || str.toLowerCase() === 'na') {
//         return { isEmpty: false, isNA: true, value: 'N/A' };
//     }
//     return { isEmpty: false, isNA: false, value: str };
// }

// function parseAmount(val, fallback = 4000) {
//     const evaluated = evaluateCell(val);
//     if (evaluated.isEmpty || evaluated.isNA) return 0;
//     const num = Number(evaluated.value.replace(/[^0-9.]/g, ''));
//     return (!isNaN(num) && num > 0) ? num : fallback;
// }

// function parseUtrAndMethod(rawUtr) {
//     const evaluated = evaluateCell(rawUtr);
//     if (evaluated.isEmpty) {
//         return { status: 'EMPTY', method: 'offline', transactionId: '' };
//     }
//     if (evaluated.isNA) {
//         return { status: 'NA', method: 'offline', transactionId: 'N/A' };
//     }
    
//     const lower = evaluated.value.toLowerCase();
//     if (lower === 'cash') {
//         return { status: 'PAID', method: 'offline', transactionId: 'CASH' };
//     } else if (lower === 'app' || lower === 'aap') {
//         return { status: 'PAID', method: 'online', transactionId: 'APP_PAYMENT' };
//     } else {
//         return { status: 'PAID', method: 'online', transactionId: evaluated.value };
//     }
// }

// function parseExcelDate(rawDate, defaultMonthYear) {
//     const evaluated = evaluateCell(rawDate);
//     if (evaluated.isEmpty || evaluated.isNA) return null;
//     let str = evaluated.value;

//     if (str.includes('/')) {
//         const parts = str.split('/');
//         if (parts.length >= 2) {
//             const day = parts[0].padStart(2, '0');
//             const month = parts[1].padStart(2, '0');
//             let year = parts[2] || '2026';
//             if (year.length === 2) year = `20${year}`;
//             return new Date(`${year}-${month}-${day}T12:00:00.000Z`);
//         }
//     }

//     if (str.includes('-')) {
//         const parts = str.split('-');
//         if (parts.length >= 2) {
//             const day = parts[0].padStart(2, '0');
//             const mon = parts[1].toLowerCase().slice(0, 3);
//             const map = {
//                 jan: '01', feb: '02', mar: '03', apr: '04',
//                 may: '05', jun: '06', jul: '07', aug: '08',
//                 sep: '09', oct: '10', nov: '11', dec: '12'
//             };
//             if (map[mon]) {
//                 return new Date(`2026-${map[mon]}-${day}T12:00:00.000Z`);
//             }
//         }
//     }

//     if (!isNaN(Number(str))) {
//         const d = new Date((Number(str) - 25569) * 86400 * 1000);
//         if (!isNaN(d.getTime())) return d;
//     }

//     return defaultMonthYear.toLowerCase().includes('sep')
//         ? new Date('2026-09-01T12:00:00.000Z')
//         : new Date('2026-08-01T12:00:00.000Z');
// }

// async function runImport() {
//     try {
//         console.log("==================================================");
//         console.log("🚀 SAFE IMPORT: AUGUST & SEPTEMBER (FIXED AMOUNT KEYS)");
//         console.log("==================================================\n");

//         if (!process.env.MONGO_URI) {
//             throw new Error("MONGO_URI not found in .env.");
//         }

//         console.log("⏳ Connecting to MongoDB Atlas...");
//         await mongoose.connect(process.env.MONGO_URI);
//         console.log("✅ MongoDB Connected.\n");

//         const filePath = path.join(__dirname, '../../students_data.xlsx');
//         const workbook = xlsx.readFile(filePath);
//         const sheet = workbook.Sheets[workbook.SheetNames[0]];
//         const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

//         console.log(`📊 Total rows in Excel: ${rows.length}\n`);

//         console.log("⏳ Loading registered users from database...");
//         const dbUsers = await User.find({}).lean();
//         const userPhoneMap = new Map();

//         for (const u of dbUsers) {
//             const phone = cleanPhone(u.phonenumber);
//             if (phone.length === 10) {
//                 userPhoneMap.set(phone, u);
//             }
//         }
//         console.log(`✅ Loaded ${dbUsers.length} registered students into memory.\n`);

//         const userBulkOps = [];
//         const paymentBulkOps = [];
//         let augustCount = 0;
//         let septemberCount = 0;

//         const now = new Date();
//         const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

//         for (let i = 0; i < rows.length; i++) {
//             const row = rows[i];

//             const name = (row['Student Name'] || row['Name'] || '').toString().trim();
//             const phone = cleanPhone(row['mobile number'] || row['Phone Number'] || row['phonenumber']);
//             const fatherPhone = cleanPhone(row['father mobile'] || row['Father Phone'] || row['fatherPhone']);

//             // 🎯 Exact columns matched directly from your sheet
//             const rawAugAmount = row['aug payment'] || row['amount'] || row['AUG PAYMENT'];
//             const rawAugUtr = row['utr'] || row['UTR'];
//             const rawAugDate = row['date'];

//             // 🎯 Fixed: 'sep amount' instead of 'sep payment'
//             const rawSepAmount = row['sep amount'] || row['sep payment'] || row['SEP PAYMENT'] || row['amount'];
//             const rawSepUtr = row['utr_1'] || row['UTR_1'] || row['utr'];
//             const rawSepDate = row['date_1'] || row['DATE_1'] || row['date'];

//             if (!phone && !name) continue;
//             if (phone.length < 10) continue;

//             if (userPhoneMap.has(phone)) {
//                 const student = userPhoneMap.get(phone);

//                 const augUtrInfo = parseUtrAndMethod(rawAugUtr);
//                 const sepUtrInfo = parseUtrAndMethod(rawSepUtr);

//                 const augAmount = parseAmount(rawAugAmount);
//                 const sepAmount = parseAmount(rawSepAmount);

//                 const hasValidSeptemberPay = (sepUtrInfo.status === 'PAID' && sepAmount > 0);
//                 const hasValidAugustPay = (augUtrInfo.status === 'PAID' && augAmount > 0);
//                 const shouldBeActive = hasValidSeptemberPay || hasValidAugustPay;

//                 // Update User Profile
//                 const userUpdate = {
//                     isApproved: shouldBeActive,
//                     accessExpiresAt: shouldBeActive ? lastDayOfMonth : null
//                 };

//                 if (fatherPhone.length === 10) {
//                     userUpdate.fatherPhone = fatherPhone;
//                 }

//                 userBulkOps.push({
//                     updateOne: {
//                         filter: { _id: student._id },
//                         update: { $set: userUpdate }
//                     }
//                 });

//                 // --- 1. AUGUST PAYMENT RECORD ---
//                 if (augUtrInfo.status === 'PAID' && augAmount > 0) {
//                     const augDate = parseExcelDate(rawAugDate, 'August 2026') || new Date('2026-08-15T12:00:00.000Z');
//                     paymentBulkOps.push({
//                         updateOne: {
//                             filter: { userId: student._id, month: { $regex: /^august/i } },
//                             update: {
//                                 $set: {
//                                     userId: student._id,
//                                     amount: augAmount,
//                                     method: augUtrInfo.method,
//                                     transactionId: augUtrInfo.transactionId,
//                                     month: 'August 2026',
//                                     status: 'Success',
//                                     paidAt: augDate,
//                                     updatedAt: new Date()
//                                 }
//                             },
//                             upsert: true
//                         }
//                     });
//                     augustCount++;
//                 } else if (augUtrInfo.status === 'NA') {
//                     paymentBulkOps.push({
//                         updateOne: {
//                             filter: { userId: student._id, month: { $regex: /^august/i } },
//                             update: {
//                                 $set: {
//                                     userId: student._id,
//                                     amount: 0,
//                                     method: 'offline',
//                                     transactionId: 'N/A',
//                                     month: 'August 2026',
//                                     status: 'Pending',
//                                     updatedAt: new Date()
//                                 }
//                             },
//                             upsert: true
//                         }
//                     });
//                     augustCount++;
//                 }

//                 // --- 2. SEPTEMBER PAYMENT RECORD ---
//                 if (sepUtrInfo.status === 'PAID' && sepAmount > 0) {
//                     const sepDate = parseExcelDate(rawSepDate, 'September 2026') || new Date('2026-09-15T12:00:00.000Z');
//                     paymentBulkOps.push({
//                         updateOne: {
//                             filter: { userId: student._id, month: { $regex: /^september/i } },
//                             update: {
//                                 $set: {
//                                     userId: student._id,
//                                     amount: sepAmount,
//                                     method: sepUtrInfo.method,
//                                     transactionId: sepUtrInfo.transactionId,
//                                     month: 'September 2026',
//                                     status: 'Success',
//                                     paidAt: sepDate,
//                                     updatedAt: new Date()
//                                 }
//                             },
//                             upsert: true
//                         }
//                     });
//                     septemberCount++;
//                 } else if (sepUtrInfo.status === 'NA') {
//                     paymentBulkOps.push({
//                         updateOne: {
//                             filter: { userId: student._id, month: { $regex: /^september/i } },
//                             update: {
//                                 $set: {
//                                     userId: student._id,
//                                     amount: 0,
//                                     method: 'offline',
//                                     transactionId: 'N/A',
//                                     month: 'September 2026',
//                                     status: 'Pending',
//                                     updatedAt: new Date()
//                                 }
//                             },
//                             upsert: true
//                         }
//                     });
//                     septemberCount++;
//                 }
//             }
//         }

//         console.log("=================== AUDIT REPORT ===================");
//         console.log(`👤 Student Profiles to Update:  ${userBulkOps.length}`);
//         console.log(`📅 August Payment Records:      ${augustCount}`);
//         console.log(`📅 September Payment Records:   ${septemberCount}`);
//         console.log(`💳 Total Payments to Upsert:    ${paymentBulkOps.length}`);
//         console.log("====================================================\n");

//         if (!DRY_RUN) {
//             console.log("⏳ Applying updates to MongoDB Atlas...");

//             if (userBulkOps.length > 0) {
//                 await User.bulkWrite(userBulkOps, { ordered: false });
//                 console.log(`✅ ${userBulkOps.length} student profiles updated.`);
//             }

//             if (paymentBulkOps.length > 0) {
//                 const BATCH_SIZE = 1500;
//                 for (let i = 0; i < paymentBulkOps.length; i += BATCH_SIZE) {
//                     const batch = paymentBulkOps.slice(i, i + BATCH_SIZE);
//                     await Payment.bulkWrite(batch, { ordered: false });
//                     console.log(`   - Saved payments batch ${i + 1} to ${Math.min(i + BATCH_SIZE, paymentBulkOps.length)}`);
//                 }
//                 console.log(`✅ ${paymentBulkOps.length} payment records successfully updated.`);
//             }

//             console.log("\n🎉 BOTH AUGUST AND SEPTEMBER DATA FULLY SYNCED!");
//         }

//         process.exit(0);

//     } catch (err) {
//         console.error("❌ Fatal Error:", err);
//         process.exit(1);
//     }
// }

// runImport();
