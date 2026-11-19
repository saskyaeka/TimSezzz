import { rp, nf } from '../../../utils/formatters';
import { settle } from '../../../utils/erpHelpers';

// Tab 5: Settlement seluruh mitra
export default function Settlement({ data }) {
  const totalSold = data.partners.reduce((a, p) => a + p.sold, 0);
  const totalReturned = data.partners.reduce((a, p) => a + p.returned, 0);
  const totalNet = data.partners.reduce((a, p) => a + settle(data, p).net, 0);

  return (
    <div className="panel">
      <h2>Settlement seluruh mitra</h2>
      <p className="muted small" style={{ margin: '4px 0 12px' }}>
        Setoran = bakpau terjual × harga mitra ({rp(data.price.mitra)}/butir). Bakpau retur
        dikembalikan ke pemilik dan tidak ditagih.
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Mitra</th>
              <th className="r">Terjual</th>
              <th className="r">Retur dikembalikan</th>
              <th className="r">Setoran ke pemilik</th>
            </tr>
          </thead>
          <tbody>
            {data.partners.map((p) => (
              <tr key={p.id}>
                <td>
                  <b>{p.name}</b>
                </td>
                <td className="r num">{nf(p.sold)} butir</td>
                <td className="r num">{nf(p.returned)} butir</td>
                <td className="r num">
                  <b>{rp(settle(data, p).net)}</b>
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <b>Total</b>
              </td>
              <td className="r num">
                <b>{nf(totalSold)} butir</b>
              </td>
              <td className="r num">
                <b>{nf(totalReturned)} butir</b>
              </td>
              <td className="r num">
                <b>{rp(totalNet)}</b>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
