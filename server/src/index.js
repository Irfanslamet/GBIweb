import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import crypto from 'node:crypto';
import { pool } from './db.js';

const app = express();
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((origin) => origin.trim());
app.use(cors({ origin: (origin, callback) => {
  if (!origin || allowedOrigins.includes(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return callback(null, true);
  return callback(null, false);
} }));
app.use(express.json({ limit: '5mb' }));

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const authSecret = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
const passwordKey = (password, salt) => new Promise((resolve, reject) => {
  crypto.scrypt(password, salt, 64, (error, derivedKey) => error ? reject(error) : resolve(`${salt}:${derivedKey.toString('hex')}`));
});
const createToken = (userId) => {
  const payload = `${userId}.${Date.now() + 1000 * 60 * 60 * 24 * 7}`;
  const signature = crypto.createHmac('sha256', authSecret).update(payload).digest('hex');
  return `${payload}.${signature}`;
};
const verifyToken = (token) => {
  const [userId, expiresAt, signature] = String(token || '').split('.');
  const payload = `${userId}.${expiresAt}`;
  const expected = crypto.createHmac('sha256', authSecret).update(payload).digest('hex');
  if (!userId || !expiresAt || !signature || Number(expiresAt) < Date.now() || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return Number(userId);
};
const requireAuth = (req, res, next) => {
  const userId = verifyToken(req.headers.authorization?.replace(/^Bearer\s+/i, ''));
  if (!userId) return res.status(401).json({ message: 'Sesi login tidak valid atau sudah berakhir.' });
  req.userId = userId;
  next();
};
const usersTableReady = pool.query(`CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
)`);
const playerPhotoReady = pool.query(`SELECT COUNT(*) AS total
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'players' AND COLUMN_NAME = 'photo_url'`)
  .then(async ([rows]) => {
    if (!Number(rows[0].total)) await pool.query('ALTER TABLE players ADD COLUMN photo_url LONGTEXT NULL');
  });

app.get('/api/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
}));

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  await usersTableReady;
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6) {
    return res.status(400).json({ message: 'Nama, email yang valid, dan password minimal 6 karakter wajib diisi.' });
  }
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = await passwordKey(password, salt);
    const [result] = await pool.query('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', [name, email, passwordHash]);
    res.status(201).json({ token: createToken(result.insertId), user: { id: result.insertId, name, email } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Email sudah terdaftar. Silakan login.' });
    throw error;
  }
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  await usersTableReady;
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const [rows] = await pool.query('SELECT id, name, email, password_hash AS passwordHash FROM users WHERE email = ? LIMIT 1', [email]);
  const user = rows[0];
  if (!user) return res.status(401).json({ message: 'Email atau password salah.' });
  const [salt, expectedHash] = user.passwordHash.split(':');
  const actualHash = await passwordKey(password, salt);
  if (actualHash.split(':')[1] !== expectedHash) return res.status(401).json({ message: 'Email atau password salah.' });
  res.json({ token: createToken(user.id), user: { id: user.id, name: user.name, email: user.email } });
}));

app.use('/api/players', requireAuth);
app.use('/api/matches', requireAuth);
app.use('/api/stats', requireAuth);

app.get('/api/players', asyncRoute(async (req, res) => {
  await playerPhotoReady;
  const search = String(req.query.search || '').trim();
  const status = ['active', 'inactive', 'all'].includes(req.query.status) ? req.query.status : 'active';
  const statusClause = status === 'all' ? '' : `AND p.is_active = ${status === 'active' ? 1 : 0}`;
  const [rows] = await pool.query(
    `SELECT p.id, p.name, p.photo_url AS photoUrl, p.is_active AS isActive,
      COUNT(DISTINCT m.id) AS matches,
      COALESCE(SUM(m.winner_team = mt.team_label), 0) AS wins,
      COUNT(DISTINCT m.id) - COALESCE(SUM(m.winner_team = mt.team_label), 0) AS losses,
      COALESCE(ROUND(SUM(m.winner_team = mt.team_label) / NULLIF(COUNT(DISTINCT m.id), 0) * 100, 1), 0) AS winRate
     FROM players p
     LEFT JOIN match_teams mt ON p.id IN (mt.player1_id, mt.player2_id)
     LEFT JOIN matches m ON m.id = mt.match_id
     WHERE p.name LIKE ? ${statusClause}
     GROUP BY p.id, p.name, p.photo_url, p.is_active
     ORDER BY p.name`,
    [`%${search}%`]
  );
  res.json(rows);
}));

app.post('/api/players', asyncRoute(async (req, res) => {
  await playerPhotoReady;
  const name = String(req.body.name || '').trim();
  const photoUrl = typeof req.body.photoUrl === 'string' ? req.body.photoUrl : null;
  if (!name || name.length > 100) return res.status(400).json({ message: 'Nama pemain wajib diisi (maksimal 100 karakter).' });
  if (photoUrl && photoUrl.length > 3000000) return res.status(400).json({ message: 'Ukuran foto terlalu besar. Maksimal 2 MB.' });
  try {
    const [result] = await pool.query('INSERT INTO players (name, photo_url) VALUES (?, ?)', [name, photoUrl]);
    res.status(201).json({ id: result.insertId, name, photoUrl, isActive: true });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Nama pemain sudah terdaftar.' });
    throw error;
  }
}));

app.patch('/api/players/:id', asyncRoute(async (req, res) => {
  await playerPhotoReady;
  const name = String(req.body.name || '').trim();
  const photoUrl = typeof req.body.photoUrl === 'string' ? req.body.photoUrl : null;
  const isActive = typeof req.body.isActive === 'boolean' ? req.body.isActive : null;
  if (!name || name.length > 100) return res.status(400).json({ message: 'Nama pemain wajib diisi.' });
  if (photoUrl && photoUrl.length > 3000000) return res.status(400).json({ message: 'Ukuran foto terlalu besar. Maksimal 2 MB.' });
  const [result] = await pool.query(
    'UPDATE players SET name = ?, photo_url = ?, is_active = COALESCE(?, is_active) WHERE id = ?',
    [name, photoUrl, isActive, req.params.id]
  );
  if (!result.affectedRows) return res.status(404).json({ message: 'Pemain tidak ditemukan.' });
  res.json({ id: Number(req.params.id), name, photoUrl, isActive: isActive === null ? undefined : isActive });
}));

app.delete('/api/players/:id', asyncRoute(async (req, res) => {
  const [result] = await pool.query('UPDATE players SET is_active = 0 WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Pemain tidak ditemukan.' });
  res.status(204).end();
}));

function validateMatch(body) {
  const type = body.matchType;
  const players = body.teams;
  if (!['SINGLE', 'DOUBLE'].includes(type) || !players?.TEAM_A || !players?.TEAM_B) return 'Data tim pertandingan tidak lengkap.';
  const required = type === 'DOUBLE' ? ['player1', 'player2'] : ['player1'];
  const ids = [];
  for (const team of ['TEAM_A', 'TEAM_B']) {
    for (const key of required) {
      const id = Number(players[team][key]);
      if (!Number.isInteger(id) || id < 1) return 'Semua pemain harus dipilih.';
      ids.push(id);
    }
  }
  if (new Set(ids).size !== ids.length) return 'Pemain yang sama tidak dapat dipilih dua kali.';
  const scores = body.scores;
  if (!Array.isArray(scores) || scores.length < 2 || scores.length > 3) return 'Pertandingan harus memiliki 2 atau 3 set.';
  const winsA = scores.filter((s) => Number(s.teamA) > Number(s.teamB)).length;
  const winsB = scores.filter((s) => Number(s.teamB) > Number(s.teamA)).length;
  if (winsA === winsB || Math.max(winsA, winsB) < 2) return 'Skor harus menentukan pemenang dalam maksimal 3 set.';
  if (scores.some((s) => !Number.isInteger(Number(s.teamA)) || !Number.isInteger(Number(s.teamB)) || Number(s.teamA) < 0 || Number(s.teamB) < 0 || Number(s.teamA) === Number(s.teamB))) return 'Skor setiap set harus valid dan tidak boleh seri.';
  return null;
}

app.post('/api/matches', asyncRoute(async (req, res) => {
  const validationError = validateMatch(req.body);
  if (validationError) return res.status(400).json({ message: validationError });
  const { matchType, matchDate, notes, teams, scores } = req.body;
  const winnerTeam = scores.filter((s) => Number(s.teamA) > Number(s.teamB)).length > scores.filter((s) => Number(s.teamB) > Number(s.teamA)).length ? 'TEAM_A' : 'TEAM_B';
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [match] = await connection.query('INSERT INTO matches (match_type, match_date, notes, winner_team) VALUES (?, ?, ?, ?)', [matchType, matchDate, notes || null, winnerTeam]);
    const matchId = match.insertId;
    for (const label of ['TEAM_A', 'TEAM_B']) {
      await connection.query('INSERT INTO match_teams (match_id, team_label, player1_id, player2_id) VALUES (?, ?, ?, ?)', [matchId, label, teams[label].player1, matchType === 'DOUBLE' ? teams[label].player2 : null]);
    }
    for (let i = 0; i < scores.length; i += 1) {
      await connection.query('INSERT INTO match_scores (match_id, set_number, score_team_a, score_team_b) VALUES (?, ?, ?, ?)', [matchId, i + 1, scores[i].teamA, scores[i].teamB]);
    }
    await connection.commit();
    res.status(201).json({ id: matchId, winnerTeam });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

const matchSelect = `
  SELECT m.id, m.match_type AS matchType, m.match_date AS matchDate, m.notes, m.winner_team AS winnerTeam,
    GROUP_CONCAT(DISTINCT CASE WHEN mt.team_label = 'TEAM_A' THEN CONCAT(p1.name, IFNULL(CONCAT(' + ', p2.name), '')) END) AS teamA,
    GROUP_CONCAT(DISTINCT CASE WHEN mt.team_label = 'TEAM_B' THEN CONCAT(p1.name, IFNULL(CONCAT(' + ', p2.name), '')) END) AS teamB,
    GROUP_CONCAT(DISTINCT CONCAT(ms.score_team_a, '-', ms.score_team_b) ORDER BY ms.set_number SEPARATOR ', ') AS score
  FROM matches m
  JOIN match_teams mt ON mt.match_id = m.id
  JOIN players p1 ON p1.id = mt.player1_id
  LEFT JOIN players p2 ON p2.id = mt.player2_id
  JOIN match_scores ms ON ms.match_id = m.id`;

app.get('/api/matches', asyncRoute(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const type = ['SINGLE', 'DOUBLE'].includes(req.query.type) ? req.query.type : null;
  const [rows] = await pool.query(`${matchSelect} WHERE (? IS NULL OR m.match_type = ?) GROUP BY m.id, m.match_type, m.match_date, m.notes, m.winner_team HAVING (? = '' OR teamA LIKE CONCAT('%', ?, '%') OR teamB LIKE CONCAT('%', ?, '%')) ORDER BY m.match_date DESC, m.id DESC LIMIT 100`, [type, type, search, search, search]);
  res.json(rows);
}));

app.get('/api/stats/overview', asyncRoute(async (req, res) => {
  const type = ['SINGLE', 'DOUBLE'].includes(req.query.type) ? req.query.type : null;
  const [[summary]] = await pool.query(`SELECT COUNT(*) AS totalMatches, SUM(match_type = 'SINGLE') AS singles, SUM(match_type = 'DOUBLE') AS doubles FROM matches`);
  const [[bestPairing]] = await pool.query(`
    SELECT CONCAT(pa.name, ' + ', pb.name) AS name,
      COUNT(*) AS matches,
      SUM(m.winner_team = mt.team_label) AS wins,
      ROUND(SUM(m.winner_team = mt.team_label) / COUNT(*) * 100, 1) AS winRate
    FROM match_teams mt
    JOIN matches m ON m.id = mt.match_id AND m.match_type = 'DOUBLE'
    JOIN players pa ON pa.id = LEAST(mt.player1_id, mt.player2_id)
    JOIN players pb ON pb.id = GREATEST(mt.player1_id, mt.player2_id)
    WHERE pa.is_active = 1 AND pb.is_active = 1
    GROUP BY LEAST(mt.player1_id, mt.player2_id), GREATEST(mt.player1_id, mt.player2_id), pa.name, pb.name
    ORDER BY winRate DESC, wins DESC, matches DESC, name
    LIMIT 1`);
  const [leaderboard] = type === 'DOUBLE'
    ? await pool.query(`
      SELECT CONCAT(LEAST(mt.player1_id, mt.player2_id), '-', GREATEST(mt.player1_id, mt.player2_id)) AS id,
        CONCAT(p1.name, ' + ', p2.name) AS name, COUNT(*) AS matches,
        SUM(m.winner_team = mt.team_label) AS wins,
        COUNT(*) - SUM(m.winner_team = mt.team_label) AS losses,
        ROUND(SUM(m.winner_team = mt.team_label) / COUNT(*) * 100, 1) AS winRate
      FROM match_teams mt
      JOIN matches m ON m.id = mt.match_id AND m.match_type = 'DOUBLE'
      JOIN players p1 ON p1.id = LEAST(mt.player1_id, mt.player2_id)
      JOIN players p2 ON p2.id = GREATEST(mt.player1_id, mt.player2_id)
      WHERE p1.is_active = 1 AND p2.is_active = 1
      GROUP BY LEAST(mt.player1_id, mt.player2_id), GREATEST(mt.player1_id, mt.player2_id), p1.name, p2.name
      ORDER BY winRate DESC, wins DESC, matches DESC, name LIMIT 10`)
    : await pool.query(`
      SELECT p.id, p.name, COUNT(*) AS matches,
        SUM(m.winner_team = mt.team_label) AS wins,
        COUNT(*) - SUM(m.winner_team = mt.team_label) AS losses,
        ROUND(SUM(m.winner_team = mt.team_label) / COUNT(*) * 100, 1) AS winRate,
        SUM(m.match_type = 'SINGLE' AND m.winner_team = mt.team_label) AS singleWins,
        SUM(m.match_type = 'SINGLE' AND m.winner_team <> mt.team_label) AS singleLosses,
        SUM(m.match_type = 'DOUBLE' AND m.winner_team = mt.team_label) AS doubleWins,
        SUM(m.match_type = 'DOUBLE' AND m.winner_team <> mt.team_label) AS doubleLosses,
        (SELECT DATE_FORMAT(m2.match_date, '%d %b %Y')
          FROM matches m2 JOIN match_teams mt2 ON mt2.match_id = m2.id
          WHERE p.id IN (mt2.player1_id, mt2.player2_id)
          ORDER BY m2.match_date DESC, m2.id DESC LIMIT 1) AS lastMatchDate,
        (SELECT (SELECT GROUP_CONCAT(CONCAT(ms2.score_team_a, '-', ms2.score_team_b) ORDER BY ms2.set_number SEPARATOR ', ')
                 FROM match_scores ms2 WHERE ms2.match_id = m2.id)
          FROM matches m2 JOIN match_teams mt2 ON mt2.match_id = m2.id
          WHERE p.id IN (mt2.player1_id, mt2.player2_id)
          ORDER BY m2.match_date DESC, m2.id DESC LIMIT 1) AS lastMatchScore
      FROM players p JOIN match_teams mt ON p.id IN (mt.player1_id, mt.player2_id)
      JOIN matches m ON m.id = mt.match_id AND (? IS NULL OR m.match_type = ?)
      WHERE p.is_active = 1 GROUP BY p.id ORDER BY winRate DESC, wins DESC, matches DESC, p.name LIMIT 10`, [type, type]);
  res.json({ summary: { totalMatches: Number(summary.totalMatches || 0), singles: Number(summary.singles || 0), doubles: Number(summary.doubles || 0) }, bestPairing: bestPairing || null, leaderboard });
}));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
});

export default app;
export { app };

if (!process.env.VERCEL) {
  app.listen(Number(process.env.PORT || 3000), () => console.log(`GBIWeb API listening on port ${process.env.PORT || 3000}`));
}
