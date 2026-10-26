const express = require('express');
const router = express.Router();

const { auth } = require('../../Middelware/auth');
const getuserprofileController = require('../../Controllers/UserControllers/userController');

router.get('/profile', auth, getuserprofileController.getUserProfile);
router.delete('/profile', auth, getuserprofileController.deleteUserProfile);

module.exports = router;