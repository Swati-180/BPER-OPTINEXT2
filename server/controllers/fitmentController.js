const Fitment = require('../models/Fitment');
const { invalidateFitmentSummaryCache } = require('./reportsController');

const getFitmentByEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const query = { employeeId };
    if (req.tenantScope?.projectId) {
      query.projectId = req.tenantScope.projectId;
    }
    const fitment = await Fitment.findOne(query);
    if (!fitment) return res.status(404).json({ message: 'Fitment profile not found' });
    res.json(fitment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const upsertFitment = async (req, res) => {
  try {
    const { employeeId } = req.body;
    const filter = { employeeId };
    const updateData = { ...req.body };

    if (req.tenantScope?.companyId) {
      filter.companyId = req.tenantScope.companyId;
      updateData.companyId = req.tenantScope.companyId;
    }
    if (req.tenantScope?.projectId) {
      filter.projectId = req.tenantScope.projectId;
      updateData.projectId = req.tenantScope.projectId;
    }

    const fitment = await Fitment.findOneAndUpdate(
      filter,
      updateData,
      { new: true, upsert: true, runValidators: true }
    );
    invalidateFitmentSummaryCache();
    res.json(fitment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getFitmentByEmployee, upsertFitment };
