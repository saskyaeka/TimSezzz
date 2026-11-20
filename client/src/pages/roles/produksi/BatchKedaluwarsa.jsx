import { TODAY, dstr, nf, toDate } from '../../../utils/formatters';
import { coldStock } from '../../../utils/erpHelpers';

// Tab 3: Batch produk beku dan kedaluwarsa
export default function BatchKedaluwarsa({ data }) {
  const batches = data?.batches || [];
  const sorted = [...batches].sort((a, b) => {
    const timeA = toDate(a.exp || a.exp_date)?.getTime() || 0;
    const timeB = toDate(b.exp || b.exp_date)?.getTime() || 0;
    return timeA - timeB;
  });

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
              const expObj = toDate(b.exp || b.exp_date);
              const madeObj = toDate(b.made || b.made_date);
              const days = expObj ? Math.round((expObj.getTime() - TODAY.getTime()) / 864e5) : 0;
              const leftQty = Number(b.left_qty ?? b.left ?? b.qty ?? 0);
              const totalQty = Number(b.qty ?? 0);

              return (
                <tr key={b.id}>
                  <td className="num">
                    <b>{b.id}</b>
                  </td>
                  <td>{dstr(madeObj)}</td>
                  <td>{dstr(expObj)}</td>
                  <td className="r num">{nf(totalQty)}</td>
                  <td className="r num">{nf(leftQty)}</td>
                  <td>
                    {leftQty === 0 && <span className="pill idle">Habis</span>}
                    {leftQty > 0 && days < 14 && <span className="pill warn">Kirim lebih dulu ({days} hr)</span>}
                    {leftQty > 0 && days >= 14 && (
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
        Pengiriman mengambil batch yang paling dekat kedaluwarsa lebih dulu (prinsip FEFO).
      </p>
    </div>
  );
}
