import 'dotenv/config';
import argon2 from 'argon2';
import { pool } from './db.js';
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (minimum 12 characters) in environment.');
  process.exit(1);
}
try {
  const hash = await argon2.hash(ADMIN_PASSWORD);
  await pool.query(`INSERT INTO admins(email,password_hash) VALUES($1,$2)
    ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,is_active=TRUE`, [ADMIN_EMAIL.toLowerCase(), hash]);
  console.log('Admin account created/updated.');
} catch(e) { console.error(e); process.exitCode=1; }
finally { await pool.end(); }
