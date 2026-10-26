// ============================================================
// Create (or reset) a staff login from the terminal.
//
//   npm run create-staff -- director "Dr. Sharma" 9876543210 secret123
//   npm run create-staff -- mess_admin "Raju" 9000000000 mess@123
//
// Roles: mess_admin, director, warden, attender
// (workers are added by the director inside the admin app)
// ============================================================
require('dotenv').config();
const mongoose = require('mongoose');
const Staff = require('../Models/staffModel');

(async () => {
    const [role, name, phone, password] = process.argv.slice(2);
    const roles = ['mess_admin', 'director', 'warden', 'attender'];

    if (!roles.includes(role) || !name || !/^\d{10}$/.test(phone || '') || String(password || '').length < 6) {
        console.log('Usage: npm run create-staff -- <mess_admin|director|warden|attender> "Full Name" <10-digit phone> <password 6+ chars>');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI);
    const existing = await Staff.findOne({ phone });
    if (existing) {
        existing.role = role;
        existing.name = name;
        existing.isActive = true;
        existing.password = password;
        await existing.save();
        console.log(`✅ ${phone} updated → ${role} (password reset)`);
    } else {
        await Staff.create({ name, phone, password, role });
        console.log(`✅ ${role} created: ${name} (${phone})`);
    }
    await mongoose.disconnect();
})().catch((e) => {
    console.error('❌', e.message);
    process.exit(1);
});
