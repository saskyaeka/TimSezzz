import { useState } from 'react';
import { ROLES, areaOf } from '../../../utils/roles';
import { addLog } from '../../../utils/erpHelpers';

const STATUS = { aktif: ['good', 'Aktif'], nonaktif: ['idle', 'Nonaktif'] };

// Peran akun memakai nama peran di server
const ALL_ROLES = ['owner', 'kitchen', 'pos', 'courier', 'partner'];
const NEW_ROLES = ['pos', 'kitchen', 'courier', 'partner'];
const roleLabel = (role) => ROLES[areaOf(role)].label;

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
export default function Pengguna({ data, setData, notify, user }) {
  const firstPartner = data.partners[0]?.id ?? '';
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'pos',
    partner: firstPartner,
  });
  const [msg, setMsg] = useState(null); // { text, kind }

  const setField = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const updateUser = (email, change) =>
    setData((d) => ({ ...d, users: d.users.map((u) => (u.email === email ? change(u) : u)) }));

  const create = (e) => {
    e.preventDefault();
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const fail = (text) => setMsg({ kind: 'bad', text });

    if (name.length < 3) return fail('Isi nama lengkap, minimal 3 huruf.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return fail('Isi email yang valid, contoh nama@usaha.id.');
    if (form.password.length < 8) return fail('Kata sandi minimal 8 karakter.');
    if (!NEW_ROLES.includes(form.role)) return fail('Pilih peran.');
    if (form.role === 'partner' && !data.partners.some((p) => p.id === form.partner)) {
      return fail('Pilih gerai untuk akun mitra.');
    }
    if (data.users.some((u) => u.email === email))
      return fail('Email ini sudah dipakai akun lain.');

    // Kata sandi hanya diperiksa di sini dan tidak disimpan. Nanti dikirim ke server.
    const account = { email, name, role: form.role, status: 'aktif' };
    if (form.role === 'partner') account.partner = form.partner;
    setData((d) =>
      addLog(
        { ...d, users: [...d.users, account] },
        'pengguna',
        `Akun ${name} (${roleLabel(form.role)}) dibuat`,
        user.name
      )
    );
    setForm({ name: '', email: '', password: '', role: 'pos', partner: firstPartner });
    setMsg({ kind: 'good', text: `Akun ${name} dibuat. Email: ${email}` });
  };

  const changeRole = (u, role) => {
    updateUser(u.email, (x) => {
      const next = { ...x, role };
      if (role === 'partner') next.partner = x.partner || firstPartner;
      else delete next.partner;
      return next;
    });
    notify('Akses ' + u.name + ' diperbarui');
  };
  const changePartner = (u, partner) => {
    updateUser(u.email, (x) => ({ ...x, partner }));
    notify('Akses ' + u.name + ' diperbarui');
  };
  const setStatus = (u, status) => {
    updateUser(u.email, (x) => ({ ...x, status }));
    notify(status === 'aktif' ? `${u.name} aktif` : `${u.name} dinonaktifkan`);
  };

  return (
    <>
      <form className="panel" style={{ maxWidth: 640 }} onSubmit={create} noValidate>
        <h2>Buat akun baru</h2>
        <p className="muted small" style={{ margin: '4px 0 12px' }}>
          Akun langsung aktif. Berikan email dan kata sandi ini kepada orang yang bersangkutan.
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
            <label htmlFor="uaPass">Kata sandi (minimal 8 karakter)</label>
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
        <button type="submit" className="btn primary">
          Buat akun
        </button>
      </form>

      <div className="panel">
        <h2>Pengguna</h2>
        <p className="muted small" style={{ margin: '4px 0 8px' }}>
          Atur peran dan nonaktifkan akun yang tidak lagi bertugas.
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
                          value={u.partner}
                          aria-label={`Gerai ${u.name}`}
                          onChange={(e) => changePartner(u, e.target.value)}
                        >
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
                      <span className={`pill ${STATUS[u.status][0]}`}>{STATUS[u.status][1]}</span>
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
