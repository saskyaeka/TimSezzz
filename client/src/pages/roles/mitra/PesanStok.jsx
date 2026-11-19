import { useState } from 'react';
import { TODAY, dstr, nf } from '../../../utils/formatters';
import { ORDER_STATUS, addLog, stockOf } from '../../../utils/erpHelpers';

// Tab 2: Pesan stok ke pemilik
export default function PesanStok({ data, setData, user, partner }) {
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState(null); // { text, kind }
  const mine = data.orders.filter((o) => o.p === partner.id);

  const send = (e) => {
    e.preventDefault();
    const q = Number(qty);
    if (!Number.isInteger(q) || q < 1) {
      return setMsg({ kind: 'bad', text: 'Isi jumlah pesanan (bilangan bulat, minimal 1).' });
    }
    const order = {
      id: 'o' + Date.now().toString(36),
      p: partner.id,
      qty: q,
      note: note.trim(),
      status: 'menunggu',
      date: TODAY,
    };
    setData((d) =>
      addLog(
        { ...d, orders: [order, ...d.orders] },
        'pesanan',
        `${partner.name} memesan ${q} butir`,
        user.name
      )
    );
    setMsg({ kind: 'good', text: 'Pesanan terkirim. Menunggu persetujuan pemilik.' });
    setQty('');
    setNote('');
  };

  return (
    <div className="grid g2">
      <form className="panel" onSubmit={send} noValidate>
        <h2>Pesan stok bakpau</h2>
        <p className="muted small" style={{ margin: '4px 0 12px' }}>
          Stok di gerai sekarang <b className="num">{nf(stockOf(partner))}</b> butir. Pesanan yang
          disetujui pemilik langsung masuk manifes kurir.
        </p>
        <div className="field">
          <label htmlFor="oq">Jumlah pesanan (butir)</label>
          <input
            id="oq"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="on">Catatan (opsional)</label>
          <input
            id="on"
            placeholder="Contoh: butuh sebelum akhir pekan"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
        <button type="submit" className="btn primary">
          Kirim pesanan
        </button>
      </form>
      <div className="panel">
        <h2>Pesanan saya</h2>
        {mine.length ? (
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th className="r">Butir</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {mine.map((o) => (
                <tr key={o.id}>
                  <td>
                    {dstr(o.date)}
                    {o.note && <div className="small muted">{o.note}</div>}
                  </td>
                  <td className="r num">{nf(o.qty)}</td>
                  <td>
                    <span className={`pill ${ORDER_STATUS[o.status][0]}`}>
                      {ORDER_STATUS[o.status][1]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">
            Belum ada pesanan. Isi formulir di samping untuk memesan stok.
          </div>
        )}
      </div>
    </div>
  );
}
