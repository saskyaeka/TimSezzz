import { dstr } from '../../../utils/formatters';
import erpService from '../../../api/erpService';

// Kategori aset: [warna label, keterangan]
const ASSET_CAT = {
  Baik: ['good', 'Kondisi prima, siap dipakai produksi.'],
  Layak: ['warn', 'Masih bisa dipakai, perlu dipantau dan dirawat.'],
  'Tidak layak': ['bad', 'Sebaiknya diganti atau dihapus dari daftar aset.'],
};
const CATS = Object.keys(ASSET_CAT);

// Tab 3: Aset dapur
export default function AsetDapur({ data, notify, refreshData }) {
  // Ubah kategori satu aset setelah pemeriksaan
  const setCondition = async (id, cond) => {
    const asset = (data.assets || []).find((a) => a.id === id);
    try {
      await erpService.updateAsset(id, { condition: cond });
      notify(`${asset?.name || id}: status kondisi ${cond} disimpan ke database`);
      if (typeof refreshData === 'function') refreshData();
    } catch (err) {
      notify(err.message || 'Gagal mengubah kondisi aset di server');
    }
  };

  // Setujui penghapusan aset yang tidak layak
  const approveWriteoff = async (id) => {
    const asset = (data.assets || []).find((a) => a.id === id);
    try {
      await erpService.approveAssetWriteoff(id);
      notify(`Penghapusan ${asset?.name || id} disetujui di database`);
      if (typeof refreshData === 'function') refreshData();
    } catch (err) {
      notify(err.message || 'Gagal menyetujui penghapusan aset');
    }
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
