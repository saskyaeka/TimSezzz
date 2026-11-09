import { rp, nf, pct } from '../../../utils/formatters';
import { floating, inTransit, coldStock, hpp, settle, stockOf } from '../../../utils/erpHelpers';

// Tab 1: Ringkasan
export default function Ringkasan({ data }) {
  const f = floating(data);
  const tr = inTransit(data);
  const c = coldStock(data);
  const totSent = data.partners.reduce((a, p) => a + p.sent, 0);
  const totRet = data.partners.reduce((a, p) => a + p.returned, 0);
  const partnerNet = data.partners.reduce((a, p) => a + settle(data, p).net, 0);
  const soldAll = data.partners.reduce((a, p) => a + p.sold, 0);
  const omzet = data.partners.reduce((a, p) => a + p.sold * data.price.mitra, 0) + data.pos.revenue;
  const cost = hpp(data).per * (soldAll + data.pos.units);
  const laba = partnerNet + data.pos.revenue - cost;
  const rank = [...data.partners].sort((a, b) => b.sold - a.sold);
  const maxSold = rank[0].sold;
  const raw = data.ingredients.filter((i) => i.stock <= i.rop).length;

  return (
    <>
      <div className="panel">
        <h2>Rantai pasok hari ini</h2>
        <p className="muted small" style={{ margin: '4px 0 18px' }}>
          Dari bahan baku sampai gerai mitra. Angka berubah saat dapur, kurir, kasir, dan mitra
          mencatat transaksi.
        </p>
        <div className="chain">
          <div className={raw ? 'node' : 'node live'}>
            <div className="dot" />
            <div className="v num">
              {data.ingredients.length - raw}/{data.ingredients.length}
            </div>
            <div className="l">Bahan di atas batas pesan ulang</div>
          </div>
          <div className="node">
            <div className="dot" />
            <div className="v num">{data.batches.length}</div>
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
          <div className="l">Laba kotor estimasi (HPP {rp(hpp(data).per)}/butir)</div>
        </div>
        <div className="kpi">
          <div className="v num">{pct(totRet / totSent)}</div>
          <div className="l">Rasio retur seluruh jaringan</div>
        </div>
        <div className="kpi">
          <div className="v num">{data.claims.filter((x) => x.status === 'menunggu').length}</div>
          <div className="l">Retur menunggu konfirmasi</div>
        </div>
      </div>

      <div className="grid g-main">
        <div className="panel">
          <h2>Peringkat gerai</h2>
          <div className="stack" style={{ marginTop: 14, gap: 14 }}>
            {rank.map((p, i) => {
              const w = p.returned / p.sent;
              return (
                <div key={p.id}>
                  <div className="row sp">
                    <b>
                      {i + 1}. {p.name}
                    </b>
                    <span className="num small muted">
                      {nf(p.sold)} terjual · stok {nf(stockOf(p))}
                    </span>
                  </div>
                  <div className="bar" style={{ margin: '6px 0' }}>
                    <i style={{ width: `${(p.sold / maxSold) * 100}%` }} />
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
        </div>

        <div className="panel">
          <h2>Buku besar stok</h2>
          <p className="muted small" style={{ margin: '4px 0 12px' }}>
            Mutasi terbaru, dicatat otomatis.
          </p>
          {data.ledger.length ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {data.ledger.slice(0, 8).map((l, i) => (
                <li
                  key={i}
                  className="small"
                  style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}
                >
                  <span className="muted num">
                    {l.t.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>{' '}
                  &nbsp;{l.text}
                  {l.by && <span className="muted"> · {l.by}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">
              Belum ada mutasi sesi ini. Jalankan SPK, kirim pasokan, atau catat penjualan untuk
              melihat jejaknya.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
