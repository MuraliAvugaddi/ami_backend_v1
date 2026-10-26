const SpecialFood = require('../../Models/specialFoodModel');
const SpecialOrder = require('../../Models/specialOrderModel');

// --- ADMIN LOGIC ---
// 1. Add new item to the menu
exports.addItem = async (req, res) => {
    try {
        const { name, price, image, description } = req.body;
        const newItem = new SpecialFood({ name, price, image, description });
        await newItem.save();
        res.status(201).json({ success: true, message: "Item added to menu", item: newItem });
    } catch (e) { res.status(500).json({ message: "Upload failed" }); }
};

// 2. Toggle Stock (In/Out of Stock)
exports.toggleStock = async (req, res) => {
    try {
        const item = await SpecialFood.findById(req.params.id);
        item.isAvailable = !item.isAvailable;
        await item.save();
        res.json({ success: true, isAvailable: item.isAvailable });
    } catch (e) { res.status(500).json({ message: "Update failed" }); }
};

// 3. View All Special Orders for the Chef
exports.getChefOrders = async (req, res) => {
    const orders = await SpecialOrder.find({ status: { $ne: 'Delivered' } })
        .populate('userId', 'name room phonenumber')
        .populate('items.productId', 'name');
    res.json(orders);
};