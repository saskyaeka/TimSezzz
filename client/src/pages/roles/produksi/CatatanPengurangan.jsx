import { useState } from 'react';
import { diffTxt, fmtT, nf, nf2 } from '../../../utils/formatters';
import erpService from '../../../api/erpService';

const REASONS = ['Tumpah / rusak', 'Kedaluwarsa', 'Selisih stock opname', 'Lainnya'];

// Teks selisih pemakaian dari resep untuk satu catatan
function varianceText(u) {
  if (!u.items || !u.items.length) return '—';
  if (u.items[0] && u.items[0].std === null) return '—';
  const diffs = u.items
    .filter((i) => Math.abs(i.used - i.std) > 1e-9)
    .map((i) => `${i.name} ${diffTxt(i.used - i.std, i.unit)}`);
  return diffs.length ? diffs.join(', ') : 'Sesuai resep';
}

// Tab 4: Catatan pengurangan bahan baku dan pengurangan manual
export default function CatatanPengurangan({ data, refreshData }) {
  const [ingId, setIngId] = useState(data.ingredients[0]?.id || '');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState(null); // { text, kind }

  const submit = async (e) => {
    e.preventDefault();
    const ing = data.ingredients.find((i) => i.id === ingId);
    if (!ing) return setMsg({ kind: 'bad', text: 'Pilih bahan baku terlebih dahulu.' });
    const q = Number(qty);

    if (!(q > 0)) return setMsg({ kind: 'bad', text: 'Isi jumlah yang lebih dari 0.' });
    if (q > ing.stock + 1e-9) {
      return setMsg({
        kind: 'bad',
        text: `Jumlah melebihi stok ${ing.name} (${nf2(ing.stock)} ${ing.unit}).`,
      });
    }

    try {
      await erpService.createIngredientAdjustment({
        ingredientId: ingId,
        quantity: q,
        reason,
        note: note.trim() || undefined,
      });

      setMsg({
        kind: 'good',
        text: `${ing.name} dikurangi ${nf2(q)} ${ing.unit} (${reason}). Tercatat di database.`,
      });
      setQty('');
      setNote('');
      if (typeof refreshData === 'function') refreshData();
    } catch (err) {
      setMsg({ kind: 'bad', text: err.message || 'Gagal menyimpan penyesuaian di server' });
    }
  };

  return (
    <>
      <div className="panel">
        <h2>Catatan pengurangan bahan baku</h2>
        <p className="muted small" style={{ margin: '4px 0 8px' }}>
          Setiap pengurangan tercatat, baik otomatis dari produksi maupun manual.
        </p>
        {data.usage.length ? (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Cara</th>
                  <th>Keterangan</th>
                  <th>Bahan terpakai</th>
                  <th>Selisih dari resep</th>
                  <th>Oleh</th>
                </tr>
              </thead>
              <tbody>
                {data.usage.map((u, i) => (
                  <tr key={i}>
                    <td className="small">{fmtT(u.t)}</td>
                    <td>
                      {u.mode === 'auto' ? (
                        <span className="pill good">Otomatis</span>
                      ) : (
                        <span className="pill warn">Manual</span>
                      )}
                    </td>
                    <td>
                      {u.qty ? (
                        <>
                          Produksi {nf(u.resep)} resep ({nf(u.qty)} butir)
                          <div className="small muted num">{u.batch}</div>
                        </>
                      ) : (
                        u.reason
                      )}
                      {u.note && <div className="small muted">{u.note}</div>}
                    </td>
                    <td className="small">
                      {u.items.map((x) => `${x.name} ${nf2(x.used)} ${x.unit}`).join(', ')}
                    </td>
                    <td className="small">{varianceText(u)}</td>
                    <td className="small">{u.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">Belum ada pengurangan bahan baku.</div>
        )}
      </div>

      <form className="panel" style={{ maxWidth: 560 }} onSubmit={submit} noValidate>
        <h2>Kurangi bahan tanpa produksi</h2>
        <p className="muted small" style={{ margin: '4px 0 12px' }}>
          Untuk bahan yang tumpah, rusak, kedaluwarsa, atau selisih saat stock opname.
        </p>
        <div className="grid g2">
          <div className="field">
            <label htmlFor="mcI">Bahan</label>
            <select id="mcI" value={ingId} onChange={(e) => setIngId(e.target.value)}>
              {data.ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.unit})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="mcQ">Jumlah dikurangi</label>
            <input
              id="mcQ"
              type="number"
              min="0"
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="mcR">Alasan</label>
          <select id="mcR" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="mcN">Catatan (opsional)</label>
          <input id="mcN" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
        <button type="submit" className="btn primary">
          Catat pengurangan
        </button>
      </form>
    </>
  );
}
