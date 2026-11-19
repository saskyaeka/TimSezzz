import { rp } from '../../../utils/formatters';
import { settle } from '../../../utils/erpHelpers';

// Tab 4: Tagihan pasokan gerai
export default function TagihanMitra({ data, notify, partner }) {
  const s = settle(data, partner);

  const copySummary = () => {
    const text =
      `Tagihan ${partner.name}, Oktober 2026\n` +
      `Penjualan (${partner.sold} x ${rp(data.price.mitra)}): ${rp(s.gross)}\n` +
      `Retur dikembalikan: ${partner.returned} butir (tidak ditagih)\n` +
      `Setoran bersih: ${rp(s.net)}`;
    const fail = () => notify('Tidak bisa menyalin. Salin manual dari tabel.');
    try {
      navigator.clipboard.writeText(text).then(() => notify('Ringkasan tagihan disalin'), fail);
    } catch {
      fail();
    }
  };

  return (
    <div className="panel" style={{ maxWidth: 560 }}>
      <h2>Tagihan pasokan</h2>
      <p className="muted small" style={{ margin: '4px 0 14px' }}>
        {partner.name} · periode Oktober 2026 (berjalan)
      </p>
      <div className="inv">
        <div className="ln">
          <span>
            Penjualan ({partner.sold} butir × harga mitra {rp(data.price.mitra)})
          </span>
          <b className="num">{rp(s.gross)}</b>
        </div>
        <div className="ln">
          <span>Retur dikembalikan ke pemilik ({partner.returned} butir)</span>
          <b className="num">tidak ditagih</b>
        </div>
        <div className="ln net">
          <span>Setoran bersih</span>
          <span className="num">{rp(s.net)}</span>
        </div>
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <button type="button" className="btn primary" onClick={copySummary}>
          Salin ringkasan tagihan
        </button>
      </div>
    </div>
  );
}
