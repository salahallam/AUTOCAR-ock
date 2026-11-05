import jwt from 'jsonwebtoken';
export function requireAdmin(req,res,next) {
  const token = req.cookies?.admin_token;
  if (!token) return res.status(401).json({ error: 'Authentification requise.' });
  try { req.admin = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.clearCookie('admin_token'); return res.status(401).json({ error: 'Session expirée.' }); }
}
