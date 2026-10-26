// Controllers/AdimeControllers/systemConfigController.js
const SystemConfig = require('../../Models/SystemConfig.js');

// GET /api/system/status
exports.getSystemStatus = async (req, res) => {
  try {
    let config = await SystemConfig.findOne();
    if (!config) {
      config = await SystemConfig.create({
        maintenanceNotice: {
          isActive: false,
          title: '',
          message: '',
          level: 'warning',
        },
      });
    }
    return res.status(200).json({ success: true, data: config });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/system/status
exports.updateSystemStatus = async (req, res) => {
  try {
    const { maintenanceNotice } = req.body;

    const updated = await SystemConfig.findOneAndUpdate(
      {},
      { maintenanceNotice },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      success: true,
      message: 'System status updated successfully',
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};