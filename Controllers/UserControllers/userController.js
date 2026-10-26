const User = require('../../Models/users');

const getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json(user);

    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ============================================================
// DELETE USER ACCOUNT
// ============================================================
const deleteUserProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findByIdAndDelete(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ 
            success: true, 
            message: 'Account and associated data deleted successfully.' 
        });
    } catch (error) {
        console.error('Error deleting user account:', error);
        res.status(500).json({ message: 'Server error during account deletion' });
    }
};

module.exports = { getUserProfile, deleteUserProfile };