import { dstr } from '../../../utils/formatters';
import { addLog, findPartner } from '../../../utils/erpHelpers';

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
    </>
  );
}
