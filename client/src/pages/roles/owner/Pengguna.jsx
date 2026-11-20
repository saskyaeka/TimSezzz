// [INTEGRASI BACKEND: Halaman manajemen pengguna terhubung langsung ke PostgreSQL API]
import { useState } from 'react';
import { ROLES, areaOf } from '../../../utils/roles';
import { addLog } from '../../../utils/erpHelpers';
import erpService from '../../../api/erpService';

const STATUS = {
  aktif: ['good', 'Aktif'],
  nonaktif: ['idle', 'Nonaktif'],
  pending: ['warn', 'Menunggu'],
};

// Peran akun memakai nama peran di server
const ALL_ROLES = ['owner', 'kitchen', 'pos', 'courier', 'partner'];
const NEW_ROLES = ['pos', 'kitchen', 'courier', 'partner'];
const roleLabel = (role) => ROLES[areaOf(role)]?.label || role;

// Hak akses per peran: 1 = boleh, 0 = tidak, teks = catatan
const MATRIX = [
  ['Ringkasan, konfirmasi retur, settlement, aset', [1, 0, 0, 0, 0]],
  ['Kelola pengguna, harga mitra, dan harga kasir', [1, 0, 0, 0, 0]],
  ['Bahan baku, produksi, batch', [1, 1, 0, 0, 0]],
  ['Kasir dan shift', [1, 0, 1, 0, 0]],
  ['Manifes rute dan e-POD', [1, 0, 0, 1, 0]],
  ['Portal gerai: stok, penjualan, retur, tagihan', [1, 0, 0, 0, 'Gerai sendiri']],
];

// Tab 6: Pengguna (buat akun, atur peran, aktifkan atau nonaktifkan)
export default function Pengguna({ data, setData, notify, user, refreshData }) {
  const firstPartner = data.partners[0]?.id ?? '';
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'pos',
    partner: firstPartner,
  });
  const [msg, setMsg] = useState(null); // { text, kind }
  const [submitting, setSubmitting] = useState(false);

  const setField = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const updateUser = (email, change) =>
    setData((d) => ({ ...d, users: d.users.map((u) => (u.email === email ? change(u) : u)) }));

  // [INTEGRASI BACKEND: Membuat akun baru dan menyimpannya secara permanen ke PostgreSQL via POST /api/owner/users]
  const create = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const fail = (text) => setMsg({ kind: 'bad', text });

    if (name.length < 2) return fail('Isi nama lengkap, minimal 2 karakter.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return fail('Isi email yang valid, contoh nama@usaha.id.');
    if (form.password.length < 8) return fail('Kata sandi minimal 8 karakter.');
    if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password))
      return fail('Kata sandi harus mengandung kombinasi huruf dan angka.');
    if (!NEW_ROLES.includes(form.role)) return fail('Pilih peran.');
    if (form.role === 'partner' && !form.partner) {
      return fail('Pilih gerai untuk akun mitra.');
    }
    if (data.users.some((u) => u.email === email)) {
      return fail('Email ini sudah dipakai akun lain.');
    }

    setSubmitting(true);
    setMsg(null);
    try {
      const res = await erpService.createUser({
        name,
        email,
        password: form.password,
        role: form.role,
        partnerId: form.role === 'partner' ? form.partner : undefined,
      });

      const newUser = res?.data?.user || {
        email,
        name,
        role: form.role,
        status: 'aktif',
        partner_id: form.partner,
      };

      setData((d) =>
        addLog(
          { ...d, users: [...d.users.filter((u) => u.email !== email), newUser] },
          'pengguna',
          `Akun ${name} (${roleLabel(form.role)}) berhasil disimpan ke database`,
          user.name
        )
      );

      if (typeof refreshData === 'function') {
        refreshData();
      }

      setForm({ name: '', email: '', password: '', role: 'pos', partner: firstPartner });
      setMsg({ kind: 'good', text: `Akun ${name} berhasil dibuat dan tersimpan di database! Email: ${email}` });
    } catch (err) {
      setMsg({ kind: 'bad', text: err.message || 'Gagal menyimpan akun ke database.' });
    } finally {
      setSubmitting(false);
    }
  };

  // [INTEGRASI BACKEND: Mengubah peran akun di database PostgreSQL via PATCH /api/owner/users/:email]
  const changeRole = async (u, role) => {
    try {
      await erpService.updateUser(u.email, {
        role,
        partnerId: role === 'partner' ? (u.partner || u.partner_id || firstPartner) : null,
      });
      updateUser(u.email, (x) => {
        const next = { ...x, role };
        if (role === 'partner') next.partner = x.partner || firstPartner;
        else delete next.partner;
        return next;
      });
      notify(`Peran ${u.name} berhasil diperbarui menjadi ${roleLabel(role)}`);
      if (typeof refreshData === 'function') refreshData();
    } catch (err) {
      notify(err.message || 'Gagal memperbarui peran di server');
    }
  };

  // [INTEGRASI BACKEND: Mengubah penautan gerai mitra di database PostgreSQL via PATCH /api/owner/users/:email]
  const changePartner = async (u, partner) => {
    try {
      await erpService.updateUser(u.email, { partnerId: partner });
      updateUser(u.email, (x) => ({ ...x, partner, partner_id: partner }));
      notify(`Gerai untuk ${u.name} berhasil diperbarui di database`);
      if (typeof refreshData === 'function') refreshData();
    } catch (err) {
      notify(err.message || 'Gagal memperbarui gerai di server');
    }
  };

  // [INTEGRASI BACKEND: Mengaktifkan atau menonaktifkan akun di database via PATCH /api/owner/users/:email]
  const setStatus = async (u, status) => {
    try {
      await erpService.updateUser(u.email, { status });
      updateUser(u.email, (x) => ({ ...x, status }));
      notify(status === 'aktif' ? `${u.name} diaktifkan di database` : `${u.name} dinonaktifkan di database`);
      if (typeof refreshData === 'function') refreshData();
    } catch (err) {
      notify(err.message || 'Gagal mengubah status di server');
    }
  };

  return (
    <>
      <form className="panel" style={{ maxWidth: 640 }} onSubmit={create} noValidate>
        <h2>Buat akun baru</h2>
        <p className="muted small" style={{ margin: '4px 0 12px' }}>
          Akun langsung tersimpan di database dan berstatus aktif. Berikan email dan kata sandi ini kepada staf terkait.
        </p>
        <div className="grid g2">
          <div className="field">
            <label htmlFor="uaName">Nama lengkap</label>
            <input id="uaName" autoComplete="off" value={form.name} onChange={setField('name')} />
          </div>
          <div className="field">
            <label htmlFor="uaEmail">Email</label>
            <input
              id="uaEmail"
              type="email"
              autoComplete="off"
              value={form.email}
              onChange={setField('email')}
            />
          </div>
          <div className="field">
            <label htmlFor="uaPass">Kata sandi (minimal 8 karakter, huruf & angka)</label>
            <input
              id="uaPass"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={setField('password')}
            />
          </div>
          <div className="field">
            <label htmlFor="uaRole">Peran</label>
            <select id="uaRole" value={form.role} onChange={setField('role')}>
              {NEW_ROLES.map((k) => (
                <option key={k} value={k}>
                  {roleLabel(k)}
                </option>
              ))}
            </select>
          </div>
          {form.role === 'partner' && (
            <div className="field">
              <label htmlFor="uaPartner">Gerai</label>
              <select id="uaPartner" value={form.partner} onChange={setField('partner')}>
                {data.partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {msg && (
          <div className={`msg ${msg.kind}`} role="alert">
            {msg.text}
          </div>
        )}
        <button type="submit" className="btn primary" disabled={submitting}>
          {submitting ? 'Menyimpan ke database...' : 'Buat akun'}
        </button>
      </form>

      <div className="panel">
        <h2>Pengguna Terdaftar</h2>
        <p className="muted small" style={{ margin: '4px 0 8px' }}>
          Data diambil langsung dari tabel pengguna di PostgreSQL. Atur peran dan aktifkan/nonaktifkan akun.
        </p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Nama</th>
                <th>Peran</th>
                <th>Gerai</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => {
                const me = u.email === user.email;
                const userStatus = STATUS[u.status] || ['idle', u.status || 'Tidak diketahui'];
                return (
                  <tr key={u.email}>
                    <td>
                      <b>{u.name}</b>
                      {me && <span className="small muted"> (Anda)</span>}
                      <div className="small muted">{u.email}</div>
                    </td>
                    <td>
                      {u.role === 'owner' || me ? (
                        roleLabel(u.role)
                      ) : (
                        <select
                          className="mini"
                          value={u.role}
                          aria-label={`Peran ${u.name}`}
                          onChange={(e) => changeRole(u, e.target.value)}
                        >
                          {ALL_ROLES.map((k) => (
                            <option key={k} value={k}>
                              {roleLabel(k)}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      {u.role === 'partner' ? (
                        <select
                          className="mini"
                          value={u.partner || u.partner_id || ''}
                          aria-label={`Gerai ${u.name}`}
                          onChange={(e) => changePartner(u, e.target.value)}
                        >
                          <option value="">-- Pilih gerai --</option>
                          {data.partners.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`pill ${userStatus[0]}`}>{userStatus[1]}</span>
                    </td>
                    <td className="r">
                      {!me && u.status === 'aktif' && (
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => setStatus(u, 'nonaktif')}
                        >
                          Nonaktifkan
                        </button>
                      )}
                      {!me && u.status !== 'aktif' && (
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => setStatus(u, 'aktif')}
                        >
                          Aktifkan
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>Hak akses per peran</h2>
        <div className="scroll" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>Area</th>
                <th className="r">Pemilik</th>
                <th className="r">Produksi</th>
                <th className="r">Kasir</th>
                <th className="r">Kurir</th>
                <th className="r">Mitra</th>
              </tr>
            </thead>
            <tbody>
              {MATRIX.map(([area, cells]) => (
                <tr key={area}>
                  <td>{area}</td>
                  {cells.map((x, i) => (
                    <td className="r" key={i}>
                      {x === 1 && (
                        <span className="chk" aria-label="Boleh">
                          ✓
                        </span>
                      )}
                      {x === 0 && (
                        <span className="muted" aria-label="Tidak boleh">
                          –
                        </span>
                      )}
                      {x !== 1 && x !== 0 && <span className="small">{x}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
