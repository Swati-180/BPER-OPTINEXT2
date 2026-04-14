const Fitment = require('../models/Fitment');

const getFitmentByEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const fitment = await Fitment.findOne({ employeeId });
    if (!fitment) return res.status(404).json({ message: 'Fitment profile not found' });
    res.json(fitment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const upsertFitment = async (req, res) => {
  try {
    const { employeeId } = req.body;
    const fitment = await Fitment.findOneAndUpdate(
      { employeeId },
      req.body,
      { new: true, upsert: true, runValidators: true }
    );
    res.json(fitment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getFitmentByEmployee, upsertFitment };
