const express = require('express');
const router = express.Router();
const controller = require('../../Controllers/UserControllers/specialFoodController');
const { auth } = require('../../Middelware/auth');

// USER ROUTES
router.get('/menu', auth, controller.getMenu);
router.post('/order', auth, controller.placeOrder);
router.get('/my-orders', auth, controller.getOrderHistory);

// ADMIN ROUTES (Should ideally be in Admin router)
router.post('/admin/add-item', auth, controller.addItem); 
router.patch('/admin/update-item/:id', auth, controller.updateItem);
router.delete('/admin/delete-item/:id', auth, controller.deleteItem);
router.get('/admin/orders', auth, controller.getAllOrders);

module.exports = router;