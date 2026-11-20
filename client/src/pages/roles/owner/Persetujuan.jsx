import { dstr, nf } from '../../../utils/formatters';
import { ORDER_STATUS, findPartner } from '../../../utils/erpHelpers';
import erpService from '../../../api/erpService';

// Label status riwayat retur: [warna, teks]
const RESULT = { dikonfirmasi: ['good', 'Dikonfirmasi'], ditolak: ['bad', 'Ditolak'] };

// Tab 4: Persetujuan retur
export default function Persetujuan({ data, notify, refreshData }) {
  const claims = data.claims || [];
  const orders = data.orders || [];
  const open = claims.filter((c) => c.status === 'menunggu');
  const done = claims.filter((c) => c.status !== 'menunggu');

  // decision: 'dikonfirmasi' atau 'ditolak'
  const review = async (claimId, decision) => {
    try {
      await erpService.reviewClaim(claimId, decision);
      notify(`Retur berhasil ${decision} di database`);
      if (typeof refreshData === 'function') refreshData();
    } catch (err) {
      notify(err.message || `Gagal memproses keputusan retur`);
    }
  };

  const openOrders = orders.filter((o) => o.status === 'menunggu');
  const doneOrders = orders.filter((o) => o.status !== 'menunggu');

  // decision: 'disetujui' atau 'ditolak'. Pesanan yang disetujui masuk manifes kurir.
  const reviewOrder = async (orderId, decision) => {
    try {
      await erpService.reviewOrder(orderId, decision);
      notify(`Pesanan berhasil ${decision} di database`);
      if (typeof refreshData === 'function') refreshData();
    } catch (err) {
      notify(err.message || `Gagal memproses keputusan pesanan`);
    }
  };

  return (
    <>
      <div className="panel">
        <h2>Retur menunggu konfirmasi</h2>
        <p className="muted small" style={{ margin: '4px 0 14px' }}>
          Mitra melaporkan bakpau yang tidak terjual dan dikembalikan ke Anda. Setelah dikonfirmasi,
          stok gerai berkurang dan tagihan hanya dihitung dari bakpau yang terjual.
        </p>
        {open.length ? (
          open.map((c) => {
            const partnerName = findPartner(data, c.p || c.partner_id)?.name || c.partner_name || 'Gerai';
            return (
              <div
                key={c.id}
                className="row sp"
                style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}
              >
                <div>
                  <b>{partnerName}</b> mengembalikan <b className="num">{c.qty}</b>{' '}
                  butir tidak terjual
                  <br />
                  <span className="muted small">diajukan {dstr(c.date || c.claim_date)}</span>
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="btn primary sm"
                    onClick={() => review(c.id, 'dikonfirmasi')}
                  >
                    Konfirmasi diterima
                  </button>
                  <button
                    type="button"
                    className="btn sm danger"
                    onClick={() => review(c.id, 'ditolak')}
                  >
                    Tolak
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty">Tidak ada retur yang menunggu.</div>
        )}
      </div>

      {done.length > 0 && (
        <div className="panel">
          <h2>Riwayat retur</h2>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Mitra</th>
                  <th className="r">Butir</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {done.map((c) => {
                  const partnerName = findPartner(data, c.p || c.partner_id)?.name || c.partner_name || 'Gerai';
                  return (
                    <tr key={c.id}>
                      <td>{partnerName}</td>
                      <td className="r num">{c.qty}</td>
                      <td>
                        <span className={`pill ${RESULT[c.status] ? RESULT[c.status][0] : 'idle'}`}>
                          {RESULT[c.status] ? RESULT[c.status][1] : c.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel">
        <h2>Pesanan stok dari mitra</h2>
        <p className="muted small" style={{ margin: '4px 0 14px' }}>
          Pesanan yang disetujui otomatis masuk ke manifes rute kurir.
        </p>
        {openOrders.length ? (
          openOrders.map((o) => {
            const partnerObj = findPartner(data, o.p || o.partner_id);
            const partnerName = partnerObj?.name || o.partner_name || 'Gerai';
            const partnerZone = partnerObj?.zone || o.zone || 'Zona Pusat';
            return (
              <div
                key={o.id}
                className="row sp"
                style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}
              >
                <div>
                  <b>{partnerName}</b> memesan <b className="num">{nf(o.qty)}</b>{' '}
                  butir
                  <br />
                  <span className="muted small">
                    {partnerZone} · diajukan {dstr(o.date || o.order_date)}
                    {o.note ? ' · ' + o.note : ''}
                  </span>
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="btn primary sm"
                    onClick={() => reviewOrder(o.id, 'disetujui')}
                  >
                    Setujui
                  </button>
                  <button
                    type="button"
                    className="btn sm danger"
                    onClick={() => reviewOrder(o.id, 'ditolak')}
                  >
                    Tolak
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="empty">Tidak ada pesanan yang menunggu.</div>
        )}
        {doneOrders.length > 0 && (
          <div className="scroll" style={{ marginTop: 14 }}>
            <table>
              <thead>
                <tr>
                  <th>Mitra</th>
                  <th className="r">Butir</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {doneOrders.map((o) => {
                  const partnerName = findPartner(data, o.p || o.partner_id)?.name || o.partner_name || 'Gerai';
                  return (
                    <tr key={o.id}>
                      <td>{partnerName}</td>
                      <td className="r num">{nf(o.qty)}</td>
                      <td>
                        <span className={`pill ${ORDER_STATUS[o.status] ? ORDER_STATUS[o.status][0] : 'idle'}`}>
                          {ORDER_STATUS[o.status] ? ORDER_STATUS[o.status][1] : o.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
