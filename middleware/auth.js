// middleware/auth.js

module.exports = function (req, res, next) {
  const token = req.headers['authorization'];

  if (!token || token !== `Bearer ${process.env.API_SECRET}`) {
    return res.status(401).json({ message: 'No autorizado' });
  }

  next();
};
