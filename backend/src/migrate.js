import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
const here = path.dirname(fileURLToPath(import.meta.url));
try {
  const dir = path.join(here, '../migrations');
  const files = (await fs.readdir(dir)).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) { await pool.query(await fs.readFile(path.join(dir, file), 'utf8')); console.log(`Applied ${file}`); }
  console.log('Database migrations completed.');
} catch (e) { console.error(e); process.exitCode = 1; }
finally { await pool.end(); }
