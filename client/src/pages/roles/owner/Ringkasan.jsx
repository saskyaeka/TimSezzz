// [INTEGRASI BACKEND: Penanganan nilai aman untuk rank, maxSold, dan metrik rantai pasok agar tidak crash saat data belum termuat]
import { rp, nf, pct } from '../../../utils/formatters';
import { floating, inTransit, coldStock, hpp, settle, stockOf } from '../../../utils/erpHelpers';

// Tab 1: Ringkasan
export default function Ringkasan({ data }) {
  const partners = data?.partners || [];
  const ingredients = data?.ingredients || [];
  const batches = data?.batches || [];
  const claims = data?.claims || [];
  const ledger = data?.ledger || [];
  const posRev = data?.pos?.revenue || 0;
  const posUnits = data?.pos?.units || 0;
  const priceMitra = data?.price?.mitra || 9000;

  const f = floating(data);
  const tr = inTransit(data);
  const c = coldStock(data);
  const totSent = partners.reduce((a, p) => a + (p.sent || 0), 0);
  const totRet = partners.reduce((a, p) => a + (p.returned || 0), 0);
  const partnerNet = partners.reduce((a, p) => a + (settle(data, p)?.net || 0), 0);
  const soldAll = partners.reduce((a, p) => a + (p.sold || 0), 0);
  const omzet = partners.reduce((a, p) => a + (p.sold || 0) * priceMitra, 0) + posRev;
  const cost = (hpp(data)?.per || 0) * (soldAll + posUnits);
  const laba = partnerNet + posRev - cost;

  // [INTEGRASI BACKEND: Pastikan array rank tidak menyebabkan TypeError jika kosong]
  const rank = [...partners].sort((a, b) => (b.sold || 0) - (a.sold || 0));
  const maxSold = rank[0]?.sold || 1;
  const raw = ingredients.filter((i) => Number(i.stock || 0) <= Number(i.rop || 0)).length;

  return (
    <>
      <div className="panel">
        <h2>Rantai pasok hari ini</h2>
        <p className="muted small" style={{ margin: '4px 0 18px' }}>
          Dari bahan baku sampai gerai mitra. Angka berubah saat dapur, kurir, kasir, dan mitra
          mencatat transaksi ke database.
        </p>
        <div className="chain">
          <div className={raw ? 'node' : 'node live'}>
            <div className="dot" />
            <div className="v num">
              {ingredients.length - raw}/{ingredients.length}
            </div>
            <div className="l">Bahan di atas batas pesan ulang</div>
          </div>
          <div className="node">
            <div className="dot" />
            <div className="v num">{batches.length}</div>
            <div className="l">Batch aktif</div>
          </div>
          <div className="node live">
            <div className="dot" />
            <div className="v num">{nf(c)}</div>
            <div className="l">Butir di cold storage</div>
          </div>
          <div className={tr ? 'node live' : 'node'}>
            <div className="dot" />
            <div className="v num">{nf(tr)}</div>
            <div className="l">Butir di jalan</div>
          </div>
          <div className="node live">
            <div className="dot" />
            <div className="v num">{nf(f)}</div>
            <div className="l">Stok mengambang di mitra</div>
          </div>
        </div>
      </div>

      <div className="grid g4">
        <div className="kpi hot">
          <div className="v num">{rp(omzet)}</div>
          <div className="l">Omzet kotor periode ini</div>
        </div>
        <div className="kpi">
          <div className="v num">{rp(laba)}</div>
          <div className="l">Laba kotor estimasi (HPP {rp(hpp(data)?.per || 0)}/butir)</div>
        </div>
        <div className="kpi">
          <div className="v num">{pct(totSent > 0 ? totRet / totSent : 0)}</div>
          <div className="l">Rasio retur seluruh jaringan</div>
        </div>
        <div className="kpi">
          <div className="v num">{claims.filter((x) => x.status === 'menunggu').length}</div>
          <div className="l">Retur menunggu konfirmasi</div>
        </div>
      </div>

      <div className="grid g-main">
        <div className="panel">
          <h2>Peringkat gerai</h2>
          {rank.length > 0 ? (
            <div className="stack" style={{ marginTop: 14, gap: 14 }}>
              {rank.map((p, i) => {
                const w = p.sent > 0 ? (p.returned || 0) / p.sent : 0;
                return (
                  <div key={p.id}>
                    <div className="row sp">
                      <b>
                        {i + 1}. {p.name}
                      </b>
                      <span className="num small muted">
                        {nf(p.sold || 0)} terjual · stok {nf(stockOf(p))}
                      </span>
                    </div>
                    <div className="bar" style={{ margin: '6px 0' }}>
                      <i style={{ width: `${Math.min(100, ((p.sold || 0) / maxSold) * 100)}%` }} />
                    </div>
                    <div className="row small muted">
                      <span>Rasio retur {pct(w)}</span>
                      <div className={w > 0.08 ? 'bar waste hi' : 'bar waste'} style={{ width: 90 }}>
                        <i style={{ width: `${Math.min(100, (w / 0.15) * 100)}%` }} />
                      </div>
                      {w > 0.08 && <span className="pill bad">Evaluasi penempatan</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty" style={{ marginTop: 14 }}>
              Belum ada data gerai mitra terdaftar di database.
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Buku besar stok</h2>
          <p className="muted small" style={{ margin: '4px 0 12px' }}>
            Mutasi terbaru dari log audit sistem.
          </p>
          {ledger.length ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {ledger.slice(0, 8).map((l, i) => {
                const dateObj = l.t instanceof Date ? l.t : new Date(l.t);
                const timeStr = !isNaN(dateObj.getTime())
                  ? dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                  : '';
                return (
                  <li
                    key={i}
                    className="small"
                    style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}
                  >
                    <span className="muted num">{timeStr}</span> &nbsp;{l.text}
                    {l.by && <span className="muted"> · {l.by}</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="empty">
              Belum ada mutasi tercatat di database.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
