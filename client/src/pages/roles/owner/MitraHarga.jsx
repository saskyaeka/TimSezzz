import { useState } from 'react';
import { rp, nf } from '../../../utils/formatters';
import { stockOf, addLog } from '../../../utils/erpHelpers';

// Tab 2: Mitra & harga
export default function MitraHarga({ data, setData, notify, user }) {
  return (
    <>
      <PriceSettings data={data} setData={setData} notify={notify} user={user} />
      <PartnerTable data={data} />
      <AddPartnerForm data={data} setData={setData} user={user} />
    </>
  );
}

function PriceSettings({ data, setData, notify, user }) {
  const { mitra, kasir } = data.price;

  // Dipanggil saat kolom harga ditinggalkan (blur) atau Enter, seperti event "change" di prototipe
  const commit = (key) => (e) => {
    const v = Math.round(Number(e.target.value));
    const newMitra = key === 'mitra' ? v : mitra;
    const newKasir = key === 'kasir' ? v : kasir;

    if (!(v >= 1000 && v <= 100000)) {
      notify('Harga harus antara Rp1.000 dan Rp100.000');
    } else if (newKasir < newMitra) {
      notify('Harga kasir tidak boleh lebih rendah dari harga mitra');
    } else if (v !== data.price[key]) {
      setData((d) =>
        addLog(
          { ...d, price: { ...d.price, [key]: v } },
          'harga',
          `Harga ${key} menjadi ${rp(v)}/butir`,
          user.name
        )
      );
      notify('Harga diperbarui');
      return;
    }
    e.target.value = data.price[key]; // kembalikan ke harga yang berlaku
  };

  const blurOnEnter = (e) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };

  return (
    <div className="panel">
      <h2>Pengaturan harga bakpau</h2>
      <p className="muted small" style={{ margin: '4px 0 12px' }}>
        Harga per butir. Mitra membeli dengan harga mitra, pembeli langsung membayar harga kasir.
        Harga baru langsung dipakai di tagihan mitra dan transaksi kasir berikutnya.
      </p>
      <div className="grid g2" style={{ maxWidth: 560 }}>
        <div className="field">
          <label htmlFor="pm">Harga mitra (Rp/butir)</label>
          <input
            id="pm"
            key={mitra}
            type="number"
            min="1000"
            max="100000"
            step="500"
            defaultValue={mitra}
            onBlur={commit('mitra')}
            onKeyDown={blurOnEnter}
          />
        </div>
        <div className="field">
          <label htmlFor="pk">Harga kasir / pembeli langsung (Rp/butir)</label>
          <input
            id="pk"
            key={kasir}
            type="number"
            min="1000"
            max="100000"
            step="500"
            defaultValue={kasir}
            onBlur={commit('kasir')}
            onKeyDown={blurOnEnter}
          />
        </div>
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        Selisih {rp(kasir - mitra)} per butir (
        {mitra ? Math.round(((kasir - mitra) / mitra) * 100) : 0}% di atas harga mitra). Paket beku
        di kasir mengikuti harga kasir dengan diskon paket.
      </p>
    </div>
  );
}

function PartnerTable({ data }) {
  return (
    <div className="panel">
      <h2>Daftar mitra</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Mitra</th>
              <th>Jenis</th>
              <th>Zona</th>
              <th className="r">Terkirim</th>
              <th className="r">Terjual</th>
              <th className="r">Stok di gerai</th>
              <th className="r">Nilai terjual</th>
            </tr>
          </thead>
          <tbody>
            {data.partners.map((p) => (
              <tr key={p.id}>
                <td>
                  <b>{p.name}</b>
                </td>
                <td>{p.type}</td>
                <td>{p.zone}</td>
                <td className="r num">{nf(p.sent)}</td>
                <td className="r num">{nf(p.sold)}</td>
                <td className="r num">
                  {nf(stockOf(p))}{' '}
                  {stockOf(p) < 10 && <span className="pill warn">Hampir habis</span>}
                </td>
                <td className="r num">{rp(p.sold * data.price.mitra)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const EMPTY_FORM = { name: '', type: 'Kedai kopi', zone: 'Zona Selatan', pin: '', qty: '0' };
const TYPES = [
  'Kedai kopi',
  'Kantin sekolah',
  'Kantin perkantoran',
  'Minimarket lokal',
  'Toko oleh-oleh',
];
const ZONES = ['Zona Selatan', 'Zona Pusat', 'Zona Utara', 'Zona Timur'];

function AddPartnerForm({ data, setData, user }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [msg, setMsg] = useState(null); // { text, kind: 'good' | 'bad' }

  const setField = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    const name = form.name.trim();
    const pin = form.pin.trim();
    const qty = Number(form.qty || 0);

    if (name.length < 3) return setMsg({ kind: 'bad', text: 'Isi nama gerai, minimal 3 huruf.' });
    if (data.partners.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      return setMsg({ kind: 'bad', text: 'Nama gerai ini sudah ada.' });
    }
    if (!/^\d{4}$/.test(pin)) return setMsg({ kind: 'bad', text: 'PIN gerai harus 4 angka.' });
    if (!Number.isInteger(qty) || qty < 0) {
      return setMsg({ kind: 'bad', text: 'Pasokan awal harus bilangan bulat, boleh 0.' });
    }

    const id = 'x' + Date.now().toString(36);
    const partner = {
      id,
      name,
      type: form.type,
      zone: form.zone,
      sent: 0,
      sold: 0,
      returned: 0,
      pin,
    };
    const trip = { id: 'm' + Date.now().toString(36), p: id, qty, done: false };
    const text = `Mitra baru: ${name}${qty ? `, pasokan awal ${qty} butir dijadwalkan` : ''}`;

    setData((d) =>
      addLog(
        {
          ...d,
          partners: [...d.partners, partner],
          manifest: qty > 0 ? [...d.manifest, trip] : d.manifest,
        },
        'mitra',
        text,
        user.name
      )
    );
    setForm(EMPTY_FORM);
    setMsg({ kind: 'good', text: `${name} ditambahkan.` });
  };

  return (
    <form className="panel" style={{ maxWidth: 640 }} onSubmit={handleSubmit} noValidate>
      <h2>Tambah mitra</h2>
      <p className="muted small" style={{ margin: '4px 0 12px' }}>
        Mitra baru bisa dipilih saat reseller mendaftar akun.
      </p>
      <div className="grid g2">
        <div className="field">
          <label htmlFor="apN">Nama gerai</label>
          <input id="apN" value={form.name} onChange={setField('name')} />
        </div>
        <div className="field">
          <label htmlFor="apT">Jenis</label>
          <select id="apT" value={form.type} onChange={setField('type')}>
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="apZ">Zona pengantaran</label>
          <select id="apZ" value={form.zone} onChange={setField('zone')}>
            {ZONES.map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="apP">PIN gerai (4 angka)</label>
          <input
            id="apP"
            inputMode="numeric"
            maxLength={4}
            value={form.pin}
            onChange={setField('pin')}
          />
        </div>
        <div className="field">
          <label htmlFor="apQ">Pasokan awal (butir, opsional)</label>
          <input
            id="apQ"
            type="number"
            min="0"
            step="1"
            value={form.qty}
            onChange={setField('qty')}
          />
        </div>
      </div>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
      <button type="submit" className="btn primary">
        Simpan mitra
      </button>
    </form>
  );
}
