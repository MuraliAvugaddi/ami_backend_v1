const MessMenu = require('../../Models/messMenuModel');

const saveMonthlyMenu = async (req, res) => {
  try {
    const { month, year, weeklySchedule } = req.body;

    if (!month || !year || !weeklySchedule) {
      return res.status(400).json({ message: 'Month, year, and weeklySchedule are required.' });
    }

    await MessMenu.updateMany({}, { isActive: false });

    const updatedMenu = await MessMenu.findOneAndUpdate(
      { month, year },
      { month, year, weeklySchedule, isActive: true },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: 'Monthly menu updated and published successfully!',
      menu: updatedMenu,
    });
  } catch (error) {
    console.error('Save Menu Error:', error);
    res.status(500).json({ success: false, message: 'Server error saving menu' });
  }
};

const getActiveMenu = async (req, res) => {
  try {
    const activeMenu = await MessMenu.findOne({ isActive: true });
    if (!activeMenu) {
      return res.status(404).json({ success: false, message: 'No active menu published yet.' });
    }
    res.status(200).json({ success: true, menu: activeMenu });
  } catch (error) {
    console.error('Get Active Menu Error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching menu' });
  }
};

module.exports = { saveMonthlyMenu, getActiveMenu };