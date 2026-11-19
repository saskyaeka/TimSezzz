import { useState } from 'react';
import { rp } from '../../../utils/formatters';
import { addLog } from '../../../utils/erpHelpers';

// Tab 2: Shift dan kas (tutup shift dengan setoran buta)
export default function ShiftKas({ data, setData, notify, user, goTab }) {
  const [counted, setCounted] = useState('');
  const { shift, sales, lastClose } = data.pos;

  if (!shift && !lastClose) {
    return <div className="empty">Belum ada shift. Buka shift dari tab Kasir.</div>;
  }

  if (!shift) {
    return (
      <div className="panel" style={{ maxWidth: 520 }}>
        <h2>Shift terakhir ditutup</h2>
        <div className="inv" style={{ marginTop: 12 }}>
          <div className="ln">
            <span>Kas seharusnya</span>
            <b className="num">{rp(lastClose.expected)}</b>
          </div>
          <div className="ln">
            <span>Kas dihitung kasir</span>
            <b className="num">{rp(lastClose.counted)}</b>
          </div>
          <div className="ln net">
            <span>Selisih</span>
            <span
              className="num"
              style={{ color: lastClose.diff === 0 ? 'var(--good)' : 'var(--bad)' }}
            >
              {lastClose.diff > 0 ? '+' : ''}
              {rp(lastClose.diff)}
            </span>
          </div>
        </div>
        <button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => goTab(0)}>
          Kembali ke kasir
        </button>
      </div>
    );
  }

  const cash = sales.filter((s) => s.pay === 'tunai').reduce((a, s) => a + s.total, 0);
  const qris = sales.filter((s) => s.pay === 'qris').reduce((a, s) => a + s.total, 0);

  const closeShift = () => {
    if (counted === '' || !(Number(counted) >= 0)) {
      return notify('Isi jumlah uang di laci dulu');
    }
    const value = Number(counted);
    const expected = shift.open + cash;
    const diff = value - expected;
    setData((d) =>
      addLog(
        {
          ...d,
          pos: { ...d.pos, lastClose: { expected, counted: value, diff }, shift: null, cart: {} },
        },
        'kas',
        `Shift ditutup, selisih ${rp(diff)}`,
        user.name
      )
    );
    setCounted('');
  };

  return (
    <div className="grid g2">
      <div className="panel">
        <h2>Shift berjalan</h2>
        <div className="inv" style={{ marginTop: 12 }}>
          <div className="ln">
            <span>Modal awal</span>
            <b className="num">{rp(shift.open)}</b>
          </div>
          <div className="ln">
            <span>Transaksi</span>
            <b className="num">{sales.length}</b>
          </div>
          <div className="ln">
            <span>Penjualan non-tunai</span>
            <b className="num">{rp(qris)}</b>
          </div>
        </div>
        <p className="muted small">
          Total kas yang seharusnya ada disembunyikan sampai Anda menyetor hitungan.
        </p>
      </div>
      <div className="panel">
        <h2>Tutup shift (setoran buta)</h2>
        <p className="muted small" style={{ margin: '4px 0 12px' }}>
          Hitung uang di laci, isi jumlahnya, lalu sistem membandingkan.
        </p>
        <div className="field">
          <label htmlFor="counted">Uang tunai di laci (Rp)</label>
          <input
            id="counted"
            type="number"
            min="0"
            step="500"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
          />
        </div>
        <button type="button" className="btn primary" onClick={closeShift}>
          Tutup shift dan setor
        </button>
      </div>
    </div>
  );
}
