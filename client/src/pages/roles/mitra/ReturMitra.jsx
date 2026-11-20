import { useState } from 'react';
import { dstr, nf } from '../../../utils/formatters';
import { stockOf } from '../../../utils/erpHelpers';
import erpService from '../../../api/erpService';

// Label status retur: [warna, teks]
const STATUS = {
  menunggu: ['warn', 'Menunggu konfirmasi'],
  dikonfirmasi: ['good', 'Dikonfirmasi'],
  ditolak: ['bad', 'Ditolak'],
};

// Tab 3: Ajukan retur bakpau yang tidak terjual
export default function ReturMitra({ data, user, partner, refreshData }) {
  const [qty, setQty] = useState('');
  const [msg, setMsg] = useState(null); // { text, kind }
  const mine = (data.claims || []).filter((c) => (c.p === partner.id || c.partner_id === partner.id));
  const pending = mine.filter((c) => c.status === 'menunggu').reduce((a, c) => a + Number(c.qty || 0), 0);
  const available = stockOf(partner) - pending;

  const send = async (e) => {
    e.preventDefault();
    const q = Number(qty);
    if (!Number.isInteger(q) || q < 1) {
      return setMsg({ kind: 'bad', text: 'Isi jumlah butir (bilangan bulat, minimal 1).' });
    }
    if (q > available) {
      return setMsg({
        kind: 'bad',
        text: `Jumlah melebihi stok gerai yang belum diretur (${available} butir).`,
      });
    }

    try {
      if (user?.role === 'partner') {
        await erpService.createPartnerClaim({ quantity: q });
      }

      setMsg({ kind: 'good', text: 'Retur berhasil dikirim ke database. Menunggu konfirmasi pemilik.' });
      setQty('');
      if (typeof refreshData === 'function') refreshData();
    } catch (err) {
      setMsg({ kind: 'bad', text: err.message || 'Gagal mengirim retur ke server' });
    }
  };

  return (
    <div className="grid g2">
      <form className="panel" onSubmit={send} noValidate>
        <h2>Retur bakpau tidak terjual</h2>
        <p className="muted small" style={{ margin: '4px 0 12px' }}>
          Isi jumlah bakpau yang tidak terjual dan dikembalikan ke pemilik. Tagihan hanya dihitung
          dari bakpau yang terjual.
        </p>
        <p className="small" style={{ marginBottom: 12 }}>
          Stok di gerai sekarang <b className="num">{nf(stockOf(partner))}</b> butir
          {pending > 0 && (
            <>
              , <b className="num">{nf(pending)}</b> butir sedang menunggu konfirmasi
            </>
          )}
          .
        </p>
        <div className="field">
          <label htmlFor="cq">Jumlah retur (butir)</label>
          <input
            id="cq"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
        <button type="submit" className="btn primary">
          Kirim retur
        </button>
      </form>
      <div className="panel">
        <h2>Retur saya</h2>
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
              {mine.map((c) => (
                <tr key={c.id}>
                  <td>{dstr(c.date)}</td>
                  <td className="r num">{c.qty}</td>
                  <td>
                    <span className={`pill ${STATUS[c.status][0]}`}>{STATUS[c.status][1]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">
            Belum ada retur. Isi formulir di samping bila ada bakpau yang tidak terjual.
          </div>
        )}
      </div>
    </div>
  );
}
