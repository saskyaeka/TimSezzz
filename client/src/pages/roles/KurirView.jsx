import { useState } from 'react';
import PodForm from './kurir/PodForm';
import { ROLES } from '../../utils/roles';
import { TODAY, dstr, nf } from '../../utils/formatters';
import { coldStock, findPartner, inTransit } from '../../utils/erpHelpers';
import erpService from '../../api/erpService';

function getValidPhotoUrl(proof, manifestId) {
  if (proof?.photo && (proof.photo.startsWith('https://') || proof.photo.startsWith('http://'))) {
    return proof.photo;
  }
  return `https://storage.paolotory.id/pod/${manifestId}.jpg`;
}

export default function KurirView({ tab, data, notify, refreshData }) {
  const [openId, setOpenId] = useState(null); // manifes yang form serah terimanya terbuka

  if (tab !== 0) {
    return <div className="empty">Kurir: tab "{ROLES.pengantar.tabs[tab]}" belum dipindahkan</div>;
  }

  const manifests = data.manifest || data.manifests || [];
  const zones = [...new Set(manifests.map((m) => findPartner(data, m.p)?.zone || m.zone || 'Zona Pusat'))];
  const left = manifests.filter((m) => !m.done).length;
  const need = inTransit(data);
  const cold = coldStock(data);

  // Konfirmasi serah terima: stok cold storage berkurang, stok gerai bertambah
  const confirmDelivery = async (m, proof) => {
    const partner = findPartner(data, m.p);
    try {
      const validPhotoUrl = getValidPhotoUrl(proof, m.id);

      await erpService.confirmDelivery(m.id, {
        photoUrl: validPhotoUrl,
        latitude: proof?.latitude || -6.2088,
        longitude: proof?.longitude || 106.8456,
        receivedBy: proof?.receivedBy || partner?.name || 'PIC Gerai',
      });

      setOpenId(null);
      notify(`Serah terima ke ${partner?.name || 'gerai'} berhasil disimpan ke database`);
      if (typeof refreshData === 'function') refreshData();
    } catch (err) {
      notify(err.message || 'Gagal mencatat serah terima di database');
    }
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
            {manifests
              .filter((m) => (findPartner(data, m.p)?.zone || m.zone || 'Zona Pusat') === z)
              .map((m) => {
                const p = findPartner(data, m.p) || { name: m.partner_name || m.name || 'Gerai', type: m.type || 'Gerai' };
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
