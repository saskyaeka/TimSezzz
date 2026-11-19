import { TODAY, dstr } from '../../../utils/formatters';
import { addLog } from '../../../utils/erpHelpers';

// Kategori aset: [warna label, keterangan]
const ASSET_CAT = {
  Baik: ['good', 'Kondisi prima, siap dipakai produksi.'],
  Layak: ['warn', 'Masih bisa dipakai, perlu dipantau dan dirawat.'],
  'Tidak layak': ['bad', 'Sebaiknya diganti atau dihapus dari daftar aset.'],
};
const CATS = Object.keys(ASSET_CAT);

// Tab 3: Aset dapur
export default function AsetDapur({ data, setData, notify, user }) {
  // Ubah kategori satu aset setelah pemeriksaan
  const setCondition = (id, cond) => {
    const asset = data.assets.find((a) => a.id === id);
    setData((d) =>
      addLog(
        {
          ...d,
          assets: d.assets.map((a) => (a.id === id ? { ...a, cond, scan: TODAY, flag: false } : a)),
        },
        'aset',
        `${asset.name} dikategorikan ${cond}`,
        user.name
      )
    );
    notify(`${asset.name}: ${cond}`);
  };

  // Setujui penghapusan aset yang tidak layak
  const approveWriteoff = (id) => {
    const asset = data.assets.find((a) => a.id === id);
    setData((d) =>
      addLog(
        { ...d, assets: d.assets.map((a) => (a.id === id ? { ...a, flag: true } : a)) },
        'aset',
        `Penghapusan ${asset.name} disetujui`,
        user.name
      )
    );
    notify(`Penghapusan ${asset.name} disetujui`);
  };

  return (
    <>
      <div className="panel">
        <h2>Aset perlengkapan dapur</h2>
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          Daftar peralatan produksi dan gudang milik usaha. Pemilik hanya memasok bakpau ke mitra;
          perlengkapan gerai tidak disediakan. Ubah kategori setelah pemeriksaan.
        </p>
      </div>

      <div className="grid g3">
        {CATS.map((k) => (
          <div key={k} className={k === 'Baik' ? 'kpi hot' : 'kpi'}>
            <div className="v num">{data.assets.filter((x) => x.cond === k).length}</div>
            <div className="l">{k}</div>
          </div>
        ))}
      </div>

      {CATS.map((k) => {
        const list = data.assets.filter((x) => x.cond === k);
        if (!list.length) return null;
        return (
          <div className="panel" key={k}>
            <div className="row sp">
              <h2>{k}</h2>
              <span className={`pill ${ASSET_CAT[k][0]}`}>{list.length} item</span>
            </div>
            <p className="muted small" style={{ margin: '4px 0 8px' }}>
              {ASSET_CAT[k][1]}
            </p>
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Kode</th>
                    <th>Perlengkapan</th>
                    <th>Lokasi</th>
                    <th>Kategori</th>
                    <th>Pemeriksaan terakhir</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((a) => (
                    <tr key={a.id}>
                      <td className="num">
                        <b>{a.id}</b>
                      </td>
                      <td>{a.name}</td>
                      <td>{a.loc}</td>
                      <td>
                        <select
                          className="mini"
                          value={a.cond}
                          aria-label={`Kategori ${a.name}`}
                          onChange={(e) => setCondition(a.id, e.target.value)}
                        >
                          {CATS.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </td>
                      <td>{dstr(a.scan)}</td>
                      <td className="r">
                        {a.flag && <span className="pill idle">Penghapusan disetujui</span>}
                        {!a.flag && a.cond === 'Tidak layak' && (
                          <button
                            type="button"
                            className="btn sm danger"
                            onClick={() => approveWriteoff(a.id)}
                          >
                            Setujui penghapusan
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}
