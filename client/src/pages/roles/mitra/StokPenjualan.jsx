import { useState } from 'react';
import { TODAY, dstr, nf } from '../../../utils/formatters';
import { addLog, stockOf } from '../../../utils/erpHelpers';
import erpService from '../../../api/erpService';

// Tab 1: Stok di gerai dan catat penjualan harian
export default function StokPenjualan({ data, setData, user, partner, goTab, refreshData }) {
  const [qty, setQty] = useState('');
  const [msg, setMsg] = useState(null); // { text, kind }
  const stock = stockOf(partner);
  const incoming = (data.manifest || data.manifests || [])
    .filter((m) => (m.p === partner.id || m.partner_id === partner.id) && !m.done)
    .reduce((a, m) => a + Number(m.qty || 0), 0);

  const save = async (e) => {
    e.preventDefault();
    const q = Number(qty);
    if (qty === '') return setMsg({ kind: 'bad', text: 'Isi jumlah butir yang terjual.' });
    if (!Number.isInteger(q)) return setMsg({ kind: 'bad', text: 'Jumlah harus bilangan bulat.' });
    if (q <= 0) return setMsg({ kind: 'bad', text: 'Jumlah penjualan harus lebih dari 0.' });
    if (q > stock) {
      return setMsg({
        kind: 'bad',
        text: `Laporan ditolak: terjual ${q} butir melebihi stok ${stock} butir di gerai.`,
      });
    }

    try {
      if (user.role === 'partner') {
        await erpService.createPartnerSale(q);
      }

      setData((d) =>
        addLog(
          {
            ...d,
            partners: d.partners.map((p) => (p.id === partner.id ? { ...p, sold: p.sold + q } : p)),
          },
          'jual',
          `${partner.name} melaporkan ${q} butir terjual (tersimpan di database)`,
          user.name
        )
      );
      setMsg({ kind: 'good', text: `Tersimpan di database. Sisa stok sekarang ${stock - q} butir.` });
      setQty('');
      if (typeof refreshData === 'function') refreshData();
    } catch (err) {
      setMsg({ kind: 'bad', text: err.message || 'Gagal menyimpan penjualan di server' });
    }
  };

  return (
    <>
      <div className="grid g3">
        <div className="kpi hot">
          <div className="v num">{nf(stock)}</div>
          <div className="l">Stok di gerai sekarang</div>
        </div>
        <div className="kpi">
          <div className="v num">{nf(partner.sold)}</div>
          <div className="l">Terjual periode ini</div>
        </div>
        <div className="kpi">
          <div className="v num">{nf(incoming)}</div>
          <div className="l">
            {incoming ? 'Pasokan dalam perjalanan' : 'Tidak ada pasokan di jalan'}
          </div>
        </div>
      </div>
      {stock < 40 && (
        <div className="msg warn">
          Stok tinggal {stock} butir. Dapur pusat sudah dijadwalkan restok.{' '}
          <button type="button" className="link" onClick={() => goTab(1)}>
            Pesan stok sekarang
          </button>
        </div>
      )}
      <form className="panel" style={{ maxWidth: 520 }} onSubmit={save} noValidate>
        <h2>Catat penjualan harian</h2>
        <p className="muted small" style={{ margin: '4px 0 12px' }}>
          Jumlah bakpau yang terjual hari ini, {dstr(TODAY)}.
        </p>
        <div className="field">
          <label htmlFor="soldQty">Terjual hari ini (butir)</label>
          <input
            id="soldQty"
            type="number"
            step="1"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
        <button type="submit" className="btn primary">
          Simpan penjualan
        </button>
      </form>
    </>
  );
}
