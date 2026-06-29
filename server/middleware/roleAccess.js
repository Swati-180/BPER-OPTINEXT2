module.exports = function requireRoles(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const role = String(req.user.role || '').toLowerCase();
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    next();
  };
};
