const API_URL = import.meta.env.VITE_API_URL || '/api';
async function request(path, options) {
  const token = localStorage.getItem('gbiweb_token');
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...options });
  } catch {
    throw new Error('API belum berjalan. Jalankan npm run dev dan pastikan MySQL XAMPP aktif.');
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request gagal.' }));
    const failure = new Error(error.message);
    failure.status = response.status;
    throw failure;
  }
  return response.status === 204 ? null : response.json();
}
export const api = {
  login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  players: async (search = '', status = 'active') => {
    const players = await request(`/players?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`);
    return players.map((player) => ({ ...player, isActive: Boolean(Number(player.isActive)) }));
  },
  createPlayer: (name, photoUrl = null) => request('/players', { method: 'POST', body: JSON.stringify({ name, photoUrl }) }),
  updatePlayer: (id, data) => request(`/players/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePlayer: (id) => request(`/players/${id}`, { method: 'DELETE' }),
  matches: (params = '') => request(`/matches${params}`),
  createMatch: (data) => request('/matches', { method: 'POST', body: JSON.stringify(data) }),
  overview: (type = '') => request(`/stats/overview${type ? `?type=${encodeURIComponent(type)}` : ''}`)
};
