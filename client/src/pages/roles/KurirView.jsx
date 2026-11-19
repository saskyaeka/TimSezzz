import { useState } from 'react';
import PodForm from './kurir/PodForm';
import { ROLES } from '../../utils/roles';
import { TODAY, dstr, nf } from '../../utils/formatters';
import { addLog, coldStock, consumeCold, findPartner, inTransit } from '../../utils/erpHelpers';

export default function KurirView({ tab, data, setData, notify, user }) {
  const [openId, setOpenId] = useState(null); // manifes yang form serah terimanya terbuka

  if (tab !== 0) {
    return <div className="empty">Kurir: tab "{ROLES.pengantar.tabs[tab]}" belum dipindahkan</div>;
  }

  const zones = [...new Set(data.manifest.map((m) => findPartner(data, m.p).zone))];
  const left = data.manifest.filter((m) => !m.done).length;
  const need = inTransit(data);
  const cold = coldStock(data);

  // Konfirmasi serah terima: stok cold storage berkurang, stok gerai bertambah
  const confirmDelivery = (m, proof) => {
    const partner = findPartner(data, m.p);
    setData((d) =>
      addLog(
        {
          ...d,
          batches: consumeCold(d.batches, m.qty),
          partners: d.partners.map((p) => (p.id === m.p ? { ...p, sent: p.sent + m.qty } : p)),
          manifest: d.manifest.map((x) =>
            x.id === m.id ? { ...x, done: true, photo: proof.photo, photoAt: proof.photoAt } : x
          ),
        },
        'kirim',
        `${m.qty} butir diterima ${partner.name} (e-POD foto kamera)`,
        user.name
      )
    );
    setOpenId(null);
    notify(`Serah terima ke ${partner.name} tercatat`);
  };

  return (
    <>
      <div className="row sp" style={{ marginBottom: 14 }}>
        <div>
          <h2>Rute pagi, {dstr(TODAY)}</h2>
          <span className="muted small">
            {left} dari {data.manifest.length} titik belum diantar · {nf(need)} butir dimuat dari
            cold storage
          </span>
        </div>
      </div>
      {need > cold && (
        <div className="msg warn">
          Cold storage hanya {cold} butir, kurang dari muatan {need}. Hubungi manajer dapur.
        </div>
      )}
      <div className="stack">
        {zones.map((z) => (
          <div className="panel" key={z}>
            <h3 style={{ marginBottom: 6 }}>{z}</h3>
            {data.manifest
              .filter((m) => findPartner(data, m.p).zone === z)
              .map((m) => {
                const p = findPartner(data, m.p);
                const open = openId === m.id;
                return (
                  <div key={m.id} style={{ padding: '12px 0', borderTop: '1px solid var(--line)' }}>
                    <div className="row sp">
                      <div>
                        <b>{p.name}</b>
                        <div className="small muted">{p.type}</div>
                      </div>
                      <div className="row">
                        <b className="num">{m.qty} butir</b>
                        {m.done ? (
                          <span className="pill good">Terkirim</span>
                        ) : (
                          <button
                            type="button"
                            className="btn sm primary"
                            onClick={() => setOpenId(open ? null : m.id)}
                          >
                            {open ? 'Tutup' : 'Serah terima'}
                          </button>
                        )}
                      </div>
                    </div>
                    {open && !m.done && (
                      <PodForm
                        qty={m.qty}
                        coldAvailable={cold}
                        onConfirm={(proof) => confirmDelivery(m, proof)}
                      />
                    )}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </>
  );
}
