import { useState } from 'react';
import { ROLES, areaOf } from '../../utils/roles';
import { findPartner } from '../../utils/erpHelpers';
import StokPenjualan from './mitra/StokPenjualan';
import PesanStok from './mitra/PesanStok';
import ReturMitra from './mitra/ReturMitra';
import TagihanMitra from './mitra/TagihanMitra';

export default function MitraView({ tab, data, setData, notify, user, goTab, refreshData }) {
  const isOwner = areaOf(user.role) === 'owner';
  const [picked, setPicked] = useState(data.partners[0]?.id);

  // Akun mitra memakai gerainya sendiri. Pemilik bebas memilih gerai yang ingin dilihat.
  const ownPartner = !isOwner && user.partnerId ? findPartner(data, user.partnerId) : null;
  const partner = ownPartner ?? findPartner(data, picked) ?? data.partners[0] ?? {
    id: user.partnerId || 'p1',
    name: 'Gerai Saya',
    type: 'Gerai',
    zone: 'Zona Pusat',
    sent: 0,
    sold: 0,
    returned: 0,
  };

  const actions = { data, setData, notify, user, goTab, partner, refreshData };
  const views = [StokPenjualan, PesanStok, ReturMitra, TagihanMitra];
  const View = views[tab];

  return (
    <>
      {isOwner && (
        <div className="row" style={{ marginBottom: 16 }}>
          <label htmlFor="vp" style={{ margin: 0 }}>
            Lihat sebagai gerai
          </label>
          <select
            id="vp"
            style={{ maxWidth: 260 }}
            value={partner.id}
            onChange={(e) => setPicked(e.target.value)}
          >
            {data.partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {View ? (
        <View {...actions} />
      ) : (
        <div className="empty">Mitra: tab "{ROLES.mitra.tabs[tab]}" belum dipindahkan</div>
      )}
    </>
  );
}
