import { TODAY, dstr, nf } from '../../../utils/formatters';
import { coldStock } from '../../../utils/erpHelpers';

// Tab 3: Batch produk beku dan kedaluwarsa
export default function BatchKedaluwarsa({ data }) {
  const sorted = [...data.batches].sort((a, b) => a.exp - b.exp);

  return (
    <div className="panel">
      <div className="row sp">
        <h2>Batch produk beku</h2>
        <b className="num">{nf(coldStock(data))} butir tersedia</b>
      </div>
      <div className="scroll" style={{ marginTop: 8 }}>
        <table>
          <thead>
            <tr>
              <th>Nomor batch</th>
              <th>Tanggal produksi</th>
              <th>Kedaluwarsa</th>
              <th className="r">Hasil</th>
              <th className="r">Sisa</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => {
              const days = Math.round((b.exp - TODAY) / 864e5);
              return (
                <tr key={b.id}>
                  <td className="num">
                    <b>{b.id}</b>
                  </td>
                  <td>{dstr(b.made)}</td>
                  <td>{dstr(b.exp)}</td>
                  <td className="r num">{b.qty}</td>
                  <td className="r num">{b.left}</td>
                  <td>
                    {b.left === 0 && <span className="pill idle">Habis</span>}
                    {b.left > 0 && days < 14 && <span className="pill warn">Kirim lebih dulu</span>}
                    {b.left > 0 && days >= 14 && (
                      <span className="pill good">{days} hari lagi</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small" style={{ marginBottom: 0 }}>
        Pengiriman mengambil batch yang paling dekat kedaluwarsa lebih dulu.
      </p>
    </div>
  );
}
