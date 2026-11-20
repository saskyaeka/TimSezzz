import { useState } from 'react';
import { diffTxt, nf, nf2, rp } from '../../../utils/formatters';
import { findIngredient, hpp, stdUse } from '../../../utils/erpHelpers';
import erpService from '../../../api/erpService';

// Tab 2: Catat produksi (SPK) dan pengurangan bahan baku
export default function ProduksiSpk({ data, refreshData }) {
  const [qty, setQty] = useState('1'); // jumlah resep
  const [mode, setMode] = useState('auto'); // 'auto' atau 'manual'
  const [manual, setManual] = useState(null); // pemakaian manual per bahan
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState(null); // { text, kind }

  const q = Number(qty);
  const valid = Number.isInteger(q) && q >= 1;
  const recipes = valid ? q : 0;
  const butir = recipes * (data.recipe?.yield || data.bom?.yield || 60);
  const needs = (data.bom?.items || []).map((item) => {
    const id = Array.isArray(item) ? item[0] : (item.ingredient_id || item.id);
    return { id, std: stdUse(data, id, recipes) };
  });
  const manualBase = manual ?? Object.fromEntries(needs.map((n) => [n.id, n.std]));
  const usedFor = (n) => (mode === 'manual' ? Number(manualBase[n.id]) || 0 : n.std);
  const isManual = mode === 'manual';

  const mat = needs.reduce((a, n) => a + usedFor(n) * findIngredient(data, n.id).price, 0);
  const hppActual = recipes ? (mat + (data.recipe?.opex || data.bom?.opex || 45000) * recipes) / butir : 0;
  const short = needs
    .filter((n) => usedFor(n) > findIngredient(data, n.id).stock + 1e-9)
    .map((n) => findIngredient(data, n.id).name);

  const changeQty = (e) => {
    setQty(e.target.value);
    setManual(null);
  };
  const changeMode = (m) => {
    setMode(m);
    setManual(null);
  };
  const changeManual = (id, value) =>
    setManual({ ...manualBase, [id]: value === '' ? 0 : Math.max(0, Number(value)) });

  const run = async () => {
    if (!valid) {
      return setMsg({
        kind: 'bad',
        text: 'Isi jumlah resep yang diproduksi (bilangan bulat, minimal 1).',
      });
    }
    if (short.length)
      return setMsg({ kind: 'bad', text: `Stok tidak cukup untuk ${short.join(', ')}.` });
    if (needs.every((n) => usedFor(n) === 0)) {
      return setMsg({ kind: 'bad', text: 'Isi pemakaian minimal satu bahan.' });
    }

    try {
      const payload = {
        recipeCount: recipes,
        usageMode: mode,
        note: note.trim() || undefined,
      };
      if (mode === 'manual') {
        payload.items = Object.fromEntries(needs.map((n) => [n.id, usedFor(n)]));
      }

      const res = await erpService.createProduction(payload);
      const prod = res?.data?.production;
      const batchId = prod?.batch?.id || 'BPK';

      setMsg({
        kind: 'good',
        text: `Batch ${batchId} (${recipes} resep, ${prod?.yieldQty || butir} butir) berhasil diproduksi ke cold storage database.`,
      });
      setManual(null);
      setNote('');
      if (typeof refreshData === 'function') refreshData();
    } catch (err) {
      setMsg({ kind: 'bad', text: err.message || 'Gagal memproses produksi di server' });
    }
  };

  return (
    <div className="grid g-main" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)' }}>
      <div className="panel">
        <h2>Catat produksi</h2>
        <p className="muted small" style={{ margin: '4px 0 14px' }}>
          Bakpau jadi masuk cold storage sebagai batch baru.
        </p>
        <div className="field">
          <label htmlFor="pq">Jumlah resep diproduksi</label>
          <input id="pq" type="number" min="1" step="1" value={qty} onChange={changeQty} />
          <div className="small muted" style={{ marginTop: 4 }}>
            1 resep = {data.bom.yield} butir{recipes ? ` · hasil ${nf(butir)} butir` : ''}
          </div>
        </div>
        <div className="field">
          <label id="pmlab">Cara mengurangi bahan baku</label>
          <div className="seg" role="group" aria-labelledby="pmlab">
            <button
              type="button"
              className="segbtn"
              aria-pressed={!isManual}
              onClick={() => changeMode('auto')}
            >
              <b>Otomatis</b>
              <span>Takaran resep × jumlah resep</span>
            </button>
            <button
              type="button"
              className="segbtn"
              aria-pressed={isManual}
              onClick={() => changeMode('manual')}
            >
              <b>Manual</b>
              <span>Isi sendiri tiap bahan</span>
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="pn">Catatan (opsional)</label>
          <input
            id="pn"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Contoh: adonan lebih basah"
          />
        </div>
        <div className="kpi hot" style={{ marginBottom: 12 }}>
          <div className="l">HPP aktual per butir</div>
          <div className="v num">{rp(hppActual)}</div>
          <div className="small muted">Standar resep {rp(hpp(data).per)}</div>
        </div>
        {short.length > 0 && (
          <div className="msg bad">
            Stok tidak cukup untuk {short.join(', ')}. Terbitkan PO bahan atau kurangi pemakaian.
          </div>
        )}
        {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
        <button type="button" className="btn primary lg" style={{ width: '100%' }} onClick={run}>
          Catat produksi dan kurangi bahan
        </button>
      </div>

      <div className="panel">
        <h2>Pengurangan bahan baku</h2>
        <p className="muted small" style={{ margin: '4px 0 8px' }}>
          {isManual
            ? 'Mode manual: ubah angka pemakaian sesuai kondisi di dapur. Selisih dari resep ikut dicatat.'
            : `Mode otomatis: bahan dikurangi sesuai takaran resep untuk setiap resep yang diproduksi (1 resep = ${data.bom.yield} butir).`}
        </p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Bahan</th>
                <th className="r">Sesuai resep</th>
                <th className="r">Terpakai</th>
                {isManual && <th className="r">Selisih</th>}
                <th className="r">Stok</th>
                <th className="r">Sisa</th>
              </tr>
            </thead>
            <tbody>
              {needs.map((n) => {
                const ing = findIngredient(data, n.id);
                const used = usedFor(n);
                const rest = ing.stock - used;
                return (
                  <tr key={n.id}>
                    <td>{ing.name}</td>
                    <td className="r num">
                      {nf2(n.std)} {ing.unit}
                    </td>
                    <td className="r">
                      {isManual ? (
                        <input
                          className="mini num"
                          type="number"
                          min="0"
                          step="any"
                          value={manualBase[n.id]}
                          aria-label={`Terpakai ${ing.name} (${ing.unit})`}
                          onChange={(e) => changeManual(n.id, e.target.value)}
                        />
                      ) : (
                        <span className="num">
                          {nf2(used)} {ing.unit}
                        </span>
                      )}
                    </td>
                    {isManual && <td className="r num">{diffTxt(used - n.std, ing.unit)}</td>}
                    <td className="r num">{nf2(ing.stock)}</td>
                    <td
                      className="r num"
                      style={rest < 0 ? { color: 'var(--bad)', fontWeight: 600 } : undefined}
                    >
                      {nf2(rest)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
