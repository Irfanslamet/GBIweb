import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api';
import './styles.css';

const NAV = [['overview', 'Overview', '▦'], ['record', 'Record match', '+'], ['leaderboard', 'Leaderboard', '♛'], ['players', 'Players', '♙'], ['add-player', 'Add players', '＋'], ['history', 'Match history', '◷']];
const initialForm = { matchType: 'SINGLE', matchDate: new Date().toISOString().slice(0, 10), notes: '', teams: { TEAM_A: { player1: '', player2: '' }, TEAM_B: { player1: '', player2: '' } }, scores: [{ teamA: '', teamB: '' }, { teamA: '', teamB: '' }] };

function App() {
  const [user, setUser] = useState(() => localStorage.getItem('gbiweb_token') ? JSON.parse(localStorage.getItem('gbiweb_user') || 'null') : null);
  const [page, setPage] = useState('overview');
  const [players, setPlayers] = useState([]);
  const [overview, setOverview] = useState({ summary: {}, leaderboard: [] });
  const [matches, setMatches] = useState([]);
  const [error, setError] = useState('');
  const refresh = async () => {
    try { setError(''); const [p, o, m] = await Promise.all([api.players(), api.overview(), api.matches()]); setPlayers(p); setOverview(o); setMatches(m); }
    catch (e) { if (e.status === 401) { localStorage.removeItem('gbiweb_token'); localStorage.removeItem('gbiweb_user'); setUser(null); } else setError(e.message); }
  };
  useEffect(() => { if (user) refresh(); }, [user]);
  const authenticate = (result) => { localStorage.setItem('gbiweb_token', result.token); localStorage.setItem('gbiweb_user', JSON.stringify(result.user)); setUser(result.user); };
  if (!user) return <AuthScreen onAuthenticated={authenticate} />;
  const pageTitle = NAV.find(([key]) => key === page)?.[1] || 'Overview';
  const headerInfo = {
    overview: ['THURSDAY, 18 JUL 2024  /  COMMUNITY COURT', `Good evening, ${user.name}.`, 'Here’s how your badminton community is performing.'],
    record: ['MATCH CENTER  /  NEW MATCH', 'Record a match', 'Capture the result and keep your community stats moving.'],
    leaderboard: ['ANALYTICS  /  RANKINGS', 'Leaderboard', 'See who is setting the pace across the community.'],
    players: ['COMMUNITY  /  PLAYER DIRECTORY', 'Players', 'Manage your community roster and player profiles.'],
    history: ['MATCH CENTER  /  ARCHIVE', 'Match history', 'Every result, score, and pairing in one place.']
  }[page] || ['MATCH CENTER / 2024', pageTitle, ''];
  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark" /> <b>GBIWEB</b></div>
      <div className="workspace">MATCH CENTER / 2024</div>
      <nav>{NAV.map(([key, label, icon]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}><span>{icon}</span>{label}</button>)}</nav>
      <div className="sidebar-bottom"><span>Need help?</span><b>{user.name}</b><button onClick={() => { localStorage.removeItem('gbiweb_token'); localStorage.removeItem('gbiweb_user'); setUser(null); }}>↪ &nbsp; Sign out</button></div>
    </aside>
    <main>
      {page !== 'add-player' && <header><div className="header-copy"><div className="eyebrow">{headerInfo[0]}</div><h1>{headerInfo[1]}</h1><p>{headerInfo[2]}</p></div><div className="header-actions"><button className="period-button">▣ &nbsp; Last 30 days&nbsp;⌄</button><button className="button primary" onClick={() => setPage('record')}>+ Record match</button></div></header>}
      {error && <div className="alert">{error}. Pastikan MySQL dan API server sudah berjalan.</div>}
      {page === 'overview' && <Overview data={overview} matches={matches} onRecord={() => setPage('record')} onLeaderboard={() => setPage('leaderboard')} />}
      {page === 'record' && <RecordMatch players={players} onSaved={async () => { await refresh(); setPage('overview'); }} />}
      {page === 'leaderboard' && <Leaderboard rows={overview.leaderboard} />}
      {page === 'players' && <Players rows={players} onChanged={refresh} onAdd={() => setPage('add-player')} />}
      {page === 'add-player' && <AddPlayers rows={players} onChanged={refresh} onBack={() => setPage('players')} />}
      {page === 'history' && <History rows={matches} />}
    </main>
  </div>;
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const register = mode === 'register';
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try { onAuthenticated(await api[register ? 'register' : 'login'](form)); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <div className="auth-shell"><div className="auth-card">
    <div className="auth-brand"><span className="brand-mark" /><b>GBIWEB</b></div>
    <div className="auth-hero"><div className="auth-eyebrow">{register ? 'JOIN THE COMMUNITY' : 'WELCOME BACK'}</div><h1>{register ? 'Build your match history.' : 'Your next win starts here.'}</h1><p>{register ? 'Create an account and make every game count.' : 'Sign in to track matches, players, and progress in one place.'}</p></div>
    <form className="auth-form" onSubmit={submit}>
      {register && <label className="auth-field"><span>FULL NAME</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" required /></label>}
      <label className="auth-field"><span>EMAIL ADDRESS</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" required /></label>
      <label className="auth-field"><span>PASSWORD</span><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={register ? 'Create a password' : 'Enter your password'} minLength="6" required /></label>
      {!register && <div className="auth-options"><label><input type="checkbox" /> <span>Remember me</span></label><button type="button">Forgot password?</button></div>}
      {error && <div className="form-feedback error">{error}</div>}
      <button className="button primary auth-submit" disabled={busy}>{busy ? 'Please wait...' : register ? 'Create my account  ↗' : 'Sign in to GBIWeb  ↗'}</button>
    </form>
    {register && <div className="auth-note">✦ <span>You can add players instantly during match entry.</span></div>}
    {!register && <><div className="auth-divider"><span />OR CONTINUE WITH<span /></div><div className="auth-social"><button type="button">Google</button><button type="button">Apple</button></div></>}
    <p className="auth-switch">{register ? 'Already have an account?' : 'New to GBIWeb?'} <button onClick={() => { setMode(register ? 'login' : 'register'); setError(''); }}>{register ? 'Sign in' : 'Create an account'}</button></p>
  </div></div>;
}

function Stat({ label, value, accent }) { return <div className="stat"><span>{label}</span><strong className={accent ? 'accent' : ''}>{value ?? 0}</strong></div>; }
function Overview({ data, matches, onRecord, onLeaderboard }) { return <section className="overview-page">
  <div className="stats-grid"><Stat label="TOTAL MATCHES" value={data.summary.totalMatches} accent /><Stat label="ACTIVE PLAYERS" value={data.leaderboard.length} /><Stat label="BEST PAIRING" value={data.bestPairing?.name || '—'} /></div>
  <div className="analytics-grid"><div className="card trend-card"><div className="card-head"><div><h2>Top win rate</h2><small>Top 4 players ranked by current win rate</small></div><span className="muted">● Win rate</span></div><div className="top-winrate-chart">{data.leaderboard.slice(0, 4).map((row, index) => <div className="top-winrate-row" key={row.id}><span className="top-winrate-rank">{String(index + 1).padStart(2, '0')}</span><span className="top-winrate-name">{row.name}</span><span className="top-winrate-track"><span style={{ width: `${Math.min(Number(row.winRate) || 0, 100)}%` }} /></span><strong className="accent">{row.winRate}%</strong></div>)}{!data.leaderboard.length && <div className="empty">Belum ada data win rate.</div>}</div></div><div className="card overview-leaderboard"><div className="card-head"><div><h2>Top performers</h2><small>Ranked by win rate</small></div><button className="text-button" onClick={onLeaderboard}>View all →</button></div>{data.leaderboard.slice(0, 4).map((row, i) => <div className="leader-row performer-row" key={row.id}><span className="rank">{String(i + 1).padStart(2, '0')}</span><span className="avatar">{row.name.slice(0, 2).toUpperCase()}</span><div className="grow"><b>{row.name}</b><small>Single {Number(row.singleWins || 0)}W–{Number(row.singleLosses || 0)}L · Double {Number(row.doubleWins || 0)}W–{Number(row.doubleLosses || 0)}L</small><small className="last-match">Last match · {row.lastMatchDate && row.lastMatchScore ? `${row.lastMatchDate} · ${row.lastMatchScore}` : '—'}</small></div><strong className="accent">{row.winRate}%</strong></div>)}</div></div>
  <div className="card recent-card"><div className="card-head"><div><div className="eyebrow">ACTIVITY</div><h2>Recent matches</h2></div><button className="button primary" onClick={onRecord}>+ Record match</button></div><MatchList rows={matches.slice(0, 5)} /></div>
</section>; }
function Leaderboard({ rows }) { const [filter, setFilter] = useState(''); const [filteredRows, setFilteredRows] = useState(rows); const [error, setError] = useState(''); useEffect(() => { let active = true; if (!filter) { setFilteredRows(rows); return () => { active = false; }; } api.overview(filter).then((result) => { if (active) { setFilteredRows(result.leaderboard); setError(''); } }).catch((err) => { if (active) setError(err.message); }); return () => { active = false; }; }, [filter, rows]); const subjectLabel = filter === 'DOUBLE' ? 'PAIR' : 'PLAYER'; return <section className="screen-page"><div className="screen-toolbar"><div className="filter-pills"><button className={!filter ? 'selected' : ''} onClick={() => setFilter('')}>ALL MATCHES</button><button className={filter === 'SINGLE' ? 'selected' : ''} onClick={() => setFilter('SINGLE')}>SINGLE</button><button className={filter === 'DOUBLE' ? 'selected' : ''} onClick={() => setFilter('DOUBLE')}>DOUBLE</button></div><button className="button primary">Export report</button></div>{error && <div className="alert">{error}</div>}<div className="card leaderboard-card"><div className="table"><div className="table-row table-head"><span>RANK</span><span>{subjectLabel}</span><span>MATCHES</span><span>WIN / LOSS</span><span>WIN RATE</span></div>{filteredRows.map((r, i) => <div className="table-row" key={r.id}><span className="rank">{String(i + 1).padStart(2, '0')}</span><span><b>{r.name}</b></span><span>{r.matches}</span><span>{r.wins}W - {r.losses}L</span><strong className="accent">{r.winRate}%</strong></div>)}{!filteredRows.length && <div className="empty">Belum ada data leaderboard.</div>}</div></div></section>; }
function MatchList({ rows }) { return <div>{rows.length ? rows.map((m) => <div className="match-row" key={m.id}><span className="match-type">{m.matchType}</span><div className="grow"><b>{m.teamA} <em>vs</em> {m.teamB}</b><small>{m.matchDate} · {m.score}</small></div><strong className={m.winnerTeam === 'TEAM_A' ? 'winner' : 'winner right'}>{m.winnerTeam === 'TEAM_A' ? 'Team A won' : 'Team B won'}</strong></div>) : <div className="empty">Belum ada pertandingan.</div>}</div>; }
function History({ rows }) { const [search, setSearch] = useState(''); const [type, setType] = useState(''); const filtered = rows.filter((m) => (!type || m.matchType === type) && `${m.teamA} ${m.teamB}`.toLowerCase().includes(search.toLowerCase())); return <section className="screen-page"><div className="screen-toolbar history-tools"><div className="toolbar"><input placeholder="Search player, pairing, or note..." value={search} onChange={(e) => setSearch(e.target.value)} /><select value={type} onChange={(e) => setType(e.target.value)}><option value="">All types ▾</option><option value="SINGLE">SINGLE</option><option value="DOUBLE">DOUBLE</option></select><button className="sort-button">Newest first ▾</button></div><button className="button primary">Export CSV</button></div><div className="card history-card"><div className="table-row table-head"><span>DATE</span><span>MATCH</span><span>SCORE</span><span>RESULT</span></div><div className="history-list">{filtered.length ? filtered.map((m) => <div className="table-row history-row" key={m.id}><span>{m.matchDate}</span><span><b>{m.teamA} <em>vs</em> {m.teamB}</b><small>{m.matchType}</small></span><span>{m.score}</span><strong className="accent">{m.winnerTeam === 'TEAM_A' ? 'Team A won' : 'Team B won'}</strong></div>) : <div className="empty">Belum ada pertandingan.</div>}</div></div></section>; }
function Players({ rows, onChanged, onAdd }) {
  const [allRows, setAllRows] = useState(rows);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [loadError, setLoadError] = useState('');
  const load = async () => { try { setAllRows(await api.players(search, status)); setLoadError(''); } catch (error) { setLoadError(error.message); } };
  useEffect(() => { load(); }, [search, status]);
  const save = async (data) => {
    try {
      setLoadError('');
      await api.updatePlayer(data.id, { ...data, isActive: Boolean(data.isActive) });
      setSelected(null);
      await load();
      await onChanged();
    } catch (error) {
      setLoadError(error.message);
    }
  };
  return <section className="screen-page players-page"><div className="screen-toolbar"><div className="toolbar"><input placeholder="Search by player name..." value={search} onChange={(e) => setSearch(e.target.value)} /><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All players ▾</option><option value="active">Active players ▾</option><option value="inactive">Inactive players ▾</option></select></div><button className="button primary" onClick={onAdd}>+ Add player</button></div>{loadError && <div className="alert">{loadError}</div>}<div className="player-stats"><Stat label="TOTAL PLAYERS" value={allRows.length} accent /><Stat label="ACTIVE PLAYERS" value={allRows.filter((p) => p.isActive).length} /><Stat label="AVG WIN RATE" value={allRows.length ? `${(allRows.reduce((total, p) => total + Number(p.winRate || 0), 0) / allRows.length).toFixed(1)}%` : '—'} /><Stat label="TOP PLAYER" value={allRows[0]?.name || '—'} /></div><div className="players-grid">{allRows.length ? allRows.map((p) => <div className={`player-card ${p.isActive ? '' : 'inactive'}`} key={p.id}><button className="player-card-main" onClick={() => setSelected(p)}>{p.photoUrl ? <img className="player-avatar" src={p.photoUrl} alt="" /> : <span className="player-avatar">{p.name.slice(0, 2).toUpperCase()}</span>}<b>{p.name}</b><small>{p.matches} matches · {p.wins}W - {p.losses}L</small><strong>{p.winRate}%</strong></button><div><span className="muted">{p.isActive ? 'Active roster' : 'Inactive'}</span><button type="button" className="icon-button" onClick={() => save({ ...p, isActive: !p.isActive })}>{p.isActive ? 'Deactivate' : 'Activate'}</button></div></div>) : <div className="card empty">Belum ada pemain pada filter ini.</div>}</div>{selected && <PlayerEditor player={selected} onClose={() => setSelected(null)} onSave={save} />}</section>;
}

function ImageCropper({ source, onCancel, onCrop }) {
  const canvasRef = useRef(null);
  const [image, setImage] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  useEffect(() => {
    const nextImage = new Image();
    nextImage.onload = () => setImage(nextImage);
    nextImage.src = source;
  }, [source]);
  useEffect(() => {
    if (!image || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    const size = 320;
    const scale = Math.max(size / image.width, size / image.height) * zoom;
    const width = image.width * scale;
    const height = image.height * scale;
    context.clearRect(0, 0, size, size);
    context.fillStyle = '#0b100e';
    context.fillRect(0, 0, size, size);
    context.drawImage(image, (size - width) / 2 + offsetX, (size - height) / 2 + offsetY, width, height);
  }, [image, zoom, offsetX, offsetY]);
  const crop = () => onCrop(canvasRef.current.toDataURL('image/jpeg', 0.82));
  return <div className="crop-backdrop"><div className="crop-card card">
    <div className="card-head"><div><div className="eyebrow">PROFILE PHOTO</div><h2>Adjust photo</h2></div><button type="button" className="close-button" onClick={onCancel}>×</button></div>
    <canvas className="crop-canvas" ref={canvasRef} width="320" height="320" />
    <div className="crop-controls">
      <label>Zoom<input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
      <label>Horizontal<input type="range" min="-100" max="100" value={offsetX} onChange={(event) => setOffsetX(Number(event.target.value))} /></label>
      <label>Vertical<input type="range" min="-100" max="100" value={offsetY} onChange={(event) => setOffsetY(Number(event.target.value))} /></label>
    </div>
    <div className="editor-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancel</button><button type="button" className="button primary" disabled={!image} onClick={crop}>Use this photo ↗</button></div>
  </div></div>;
}

function PlayerEditor({ player, onClose, onSave }) {
  const [name, setName] = useState(player.name);
  const [photoUrl, setPhotoUrl] = useState(player.photoUrl || null);
  const [cropSource, setCropSource] = useState(null);
  const [busy, setBusy] = useState(false);
  const choosePhoto = (event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 2 * 1024 * 1024) return; const reader = new FileReader(); reader.onload = () => setCropSource(String(reader.result)); reader.readAsDataURL(file); event.target.value = ''; };
  const submit = async (event) => { event.preventDefault(); setBusy(true); try { await onSave({ ...player, name: name.trim(), photoUrl }); } finally { setBusy(false); } };
  return <><div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="player-editor card" onSubmit={submit}><div className="card-head"><div><div className="eyebrow">PLAYER PROFILE</div><h2>Edit player</h2></div><button type="button" className="close-button" onClick={onClose}>×</button></div><div className="editor-preview">{photoUrl ? <img className="editor-avatar" src={photoUrl} alt="" /> : <span className="editor-avatar">{name.slice(0, 2).toUpperCase()}</span>}<div><b>{name || 'Player name'}</b><small>{player.matches} matches · {player.winRate}% win rate</small></div></div><label className="field-label" htmlFor="edit-player-name">FULL NAME</label><input id="edit-player-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength="100" /><label className="upload-button"><input type="file" accept="image/png,image/jpeg" onChange={choosePhoto} />↥ Change profile photo</label><div className="editor-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving...' : 'Save changes ↗'}</button></div></form></div>{cropSource && <ImageCropper source={cropSource} onCancel={() => setCropSource(null)} onCrop={(cropped) => { setPhotoUrl(cropped); setCropSource(null); }} />}</>;
}
function AddPlayers({ rows, onChanged, onBack }) { const [name, setName] = useState(''); const [photoUrl, setPhotoUrl] = useState(null); const [cropSource, setCropSource] = useState(null); const [busy, setBusy] = useState(false); const [feedback, setFeedback] = useState({ type: '', message: '' }); const choosePhoto = (event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 2 * 1024 * 1024) { setFeedback({ type: 'error', message: 'Ukuran foto maksimal 2 MB.' }); return; } const reader = new FileReader(); reader.onload = () => setCropSource(String(reader.result)); reader.readAsDataURL(file); event.target.value = ''; }; const add = async (e) => { e.preventDefault(); const trimmed = name.trim(); if (!trimmed) { setFeedback({ type: 'error', message: 'Masukkan nama pemain terlebih dahulu.' }); return; } setBusy(true); setFeedback({ type: '', message: '' }); try { await api.createPlayer(trimmed, photoUrl); setName(''); setPhotoUrl(null); await onChanged(); setFeedback({ type: 'success', message: `${trimmed} berhasil ditambahkan.` }); } catch (err) { setFeedback({ type: 'error', message: err.message }); } finally { setBusy(false); } }; return <><section className="add-player-page"><div className="add-player-header"><div><div className="eyebrow">COMMUNITY / PLAYER DIRECTORY</div><h2>Add a new player</h2><p>Create a player profile before the next game starts.</p></div><button className="cancel-button" onClick={onBack}>Cancel</button></div><div className="add-player-layout"><div className="card add-player-card"><div className="eyebrow">PLAYER DETAILS</div><div className="photo-upload">{photoUrl ? <img className="photo-placeholder" src={photoUrl} alt="" /> : <span className="photo-placeholder">＋</span>}<div><b>Profile photo</b><small>JPG or PNG · max 2 MB</small><label className="upload-button">↥ {photoUrl ? 'Change photo' : 'Upload photo'}<input type="file" accept="image/png,image/jpeg" onChange={choosePhoto} /></label></div></div><form onSubmit={add}><label className="field-label" htmlFor="player-name">FULL NAME</label><input id="player-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter player name" maxLength="100" autoFocus /><span className="field-hint">Use the name your team will recognize.</span>{feedback.message && <div className={`form-feedback ${feedback.type}`}>{feedback.message}</div>}<button className="button primary full" disabled={busy}>{busy ? 'Adding player...' : 'Create player  ↗'}</button></form></div><div className="card add-player-side"><div className="eyebrow">ACTIVE ROSTER</div><strong className="roster-count">{rows.length}</strong><span className="muted">players ready to play</span><div className="roster-preview">{rows.slice(0, 5).map((p) => <div className="roster-item" key={p.id}>{p.photoUrl ? <img className="avatar" src={p.photoUrl} alt="" /> : <span className="avatar">{p.name.slice(0, 2).toUpperCase()}</span>}<span>{p.name}</span></div>)}{!rows.length && <span className="muted">Your roster is empty.</span>}</div>{rows.length > 5 && <span className="muted">+ {rows.length - 5} more players</span>}</div></div></section>{cropSource && <ImageCropper source={cropSource} onCancel={() => setCropSource(null)} onCrop={(cropped) => { setPhotoUrl(cropped); setCropSource(null); }} />}</>; }
function RecordMatch({ players, onSaved }) { const [form, setForm] = useState(initialForm); const [busy, setBusy] = useState(false); const update = (key, value) => setForm((f) => ({ ...f, [key]: value })); const updateTeam = (team, key, value) => setForm((f) => ({ ...f, teams: { ...f.teams, [team]: { ...f.teams[team], [key]: value } } })); const updateScore = (i, key, value) => setForm((f) => ({ ...f, scores: f.scores.map((s, index) => index === i ? { ...s, [key]: value } : s) })); const submit = async (e) => { e.preventDefault(); setBusy(true); try { await api.createMatch(form); await onSaved(); } catch (err) { alert(err.message); } finally { setBusy(false); } }; const removeSet = () => setForm((f) => ({ ...f, scores: f.scores.slice(0, 2) })); return <section><form className="record-grid" onSubmit={submit}><div className="card form-card"><div className="tabs"><button type="button" className={form.matchType === 'SINGLE' ? 'selected' : ''} onClick={() => update('matchType', 'SINGLE')}>Singles</button><button type="button" className={form.matchType === 'DOUBLE' ? 'selected' : ''} onClick={() => update('matchType', 'DOUBLE')}>Doubles</button></div><div className="form-grid"><label>Date<input type="date" value={form.matchDate} onChange={(e) => update('matchDate', e.target.value)} required /></label><label>Notes<input value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Optional context" maxLength="255" /></label></div>{['TEAM_A', 'TEAM_B'].map((team) => <div className="team" key={team}><h3>{team === 'TEAM_A' ? 'Team A' : 'Team B'}</h3><div className="form-grid">{['player1', ...(form.matchType === 'DOUBLE' ? ['player2'] : [])].map((key) => <select key={key} value={form.teams[team][key]} onChange={(e) => updateTeam(team, key, e.target.value)} required><option value="">{key === 'player1' ? 'Select player' : 'Select partner'}</option>{players.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select>)}</div></div>)}<h3>Set scores</h3>{form.scores.map((score, i) => <div className="score-row" key={i}><span>Set {i + 1}</span><input type="number" min="0" max="99" placeholder="A" value={score.teamA} onChange={(e) => updateScore(i, 'teamA', e.target.value)} required /><b>—</b><input type="number" min="0" max="99" placeholder="B" value={score.teamB} onChange={(e) => updateScore(i, 'teamB', e.target.value)} required /></div>)}{form.scores.length === 2 && <button type="button" className="text-button" onClick={() => setForm((f) => ({ ...f, scores: [...f.scores, { teamA: '', teamB: '' }] }))}>+ Add third set</button>} {form.scores.length === 3 && <button type="button" className="text-button" onClick={removeSet}>Remove third set</button>}<button className="button primary full" disabled={busy}>{busy ? 'Saving...' : 'Save match ↗'}</button></div><aside className="card preview"><div className="eyebrow">MATCH PREVIEW</div><h2>{form.teams.TEAM_A.player1 ? players.find((p) => String(p.id) === String(form.teams.TEAM_A.player1))?.name : 'Team A'} <em>vs</em> {form.teams.TEAM_B.player1 ? players.find((p) => String(p.id) === String(form.teams.TEAM_B.player1))?.name : 'Team B'}</h2><p>Best of 3 · {form.matchType === 'DOUBLE' ? 'Doubles' : 'Singles'}</p></aside></form></section>; }
createRoot(document.getElementById('root')).render(<App />);
