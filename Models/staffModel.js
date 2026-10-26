const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// ============================================================
// HOSTEL STAFF
// Everyone who logs in to the admin app with a mobile number:
// mess admin, director, warden, attender and the repair team.
// ============================================================

const STAFF_ROLES = ['mess_admin', 'director', 'warden', 'attender', 'worker'];
const TRADES = ['electrician', 'plumber', 'carpenter', 'cleaner'];

const staffSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    phone: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        default: '',
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: STAFF_ROLES,
        required: true
    },
    // Only for the repair team
    trade: {
        type: String,
        enum: [...TRADES, ''],
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

staffSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

staffSchema.methods.toSafe = function () {
    const obj = this.toObject();
    delete obj.password;
    return obj;
};

const Staff = mongoose.model("Staff", staffSchema);
module.exports = Staff;
module.exports.STAFF_ROLES = STAFF_ROLES;
module.exports.TRADES = TRADES;
