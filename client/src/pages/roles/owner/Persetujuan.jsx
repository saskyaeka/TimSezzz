import { dstr, nf } from '../../../utils/formatters';
import { ORDER_STATUS, addLog, findPartner, newId } from '../../../utils/erpHelpers';

// Label status riwayat retur: [warna, teks]
const RESULT = { dikonfirmasi: ['good', 'Dikonfirmasi'], ditolak: ['bad', 'Ditolak'] };

// Tab 4: Persetujuan retur
export default function Persetujuan({ data, setData, notify, user }) {
  const open = data.claims.filter((c) => c.status === 'menunggu');
  const done = data.claims.filter((c) => c.status !== 'menunggu');

  // decision: 'dikonfirmasi' atau 'ditolak'
  const review = (claimId, decision) => {
    const claim = data.claims.find((c) => c.id === claimId);
    const partner = findPartner(data, claim.p);

    setData((d) => {
      let next = {
        ...d,
        claims: d.claims.map((c) => (c.id === claimId ? { ...c, status: decision } : c)),
      };
      if (decision === 'dikonfirmasi') {
        next = {
          ...next,
          partners: next.partners.map((p) =>
            p.id === claim.p ? { ...p, returned: p.returned + claim.qty } : p
          ),
        };
        next = addLog(
          next,
          'retur',
          `Retur ${claim.qty} butir dari ${partner.name} dikonfirmasi diterima`,
          user.name
        );
      }
      return next;
    });
    notify(`Retur ${decision}`);
  };

  const openOrders = data.orders.filter((o) => o.status === 'menunggu');
  const doneOrders = data.orders.filter((o) => o.status !== 'menunggu');

  // decision: 'disetujui' atau 'ditolak'. Pesanan yang disetujui masuk manifes kurir.
  const reviewOrder = (orderId, decision) => {
    const order = data.orders.find((o) => o.id === orderId);
    const partner = findPartner(data, order.p);
    const trip = { id: newId('m'), p: order.p, qty: order.qty, done: false };

    setData((d) => {
      const next = {
        ...d,
        orders: d.orders.map((o) => (o.id === orderId ? { ...o, status: decision } : o)),
      };
      if (decision !== 'disetujui') return next;
      return addLog(
        { ...next, manifest: [...next.manifest, trip] },
        'pesanan',
        `Pesanan ${order.qty} butir dari ${partner.name} disetujui, masuk manifes kurir`,
        user.name
      );
    });
    notify(`Pesanan ${decision}`);
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
          open.map((c) => (
            <div
              key={c.id}
              className="row sp"
              style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}
            >
              <div>
                <b>{findPartner(data, c.p).name}</b> mengembalikan <b className="num">{c.qty}</b>{' '}
                butir tidak terjual
                <br />
                <span className="muted small">diajukan {dstr(c.date)}</span>
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
          ))
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
                {done.map((c) => (
                  <tr key={c.id}>
                    <td>{findPartner(data, c.p).name}</td>
                    <td className="r num">{c.qty}</td>
                    <td>
                      <span className={`pill ${RESULT[c.status][0]}`}>{RESULT[c.status][1]}</span>
                    </td>
                  </tr>
                ))}
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
          openOrders.map((o) => (
            <div
              key={o.id}
              className="row sp"
              style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}
            >
              <div>
                <b>{findPartner(data, o.p).name}</b> memesan <b className="num">{nf(o.qty)}</b>{' '}
                butir
                <br />
                <span className="muted small">
                  {findPartner(data, o.p).zone} · diajukan {dstr(o.date)}
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
          ))
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
                {doneOrders.map((o) => (
                  <tr key={o.id}>
                    <td>{findPartner(data, o.p).name}</td>
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
          </div>
        )}
      </div>
    </>
  );
}
