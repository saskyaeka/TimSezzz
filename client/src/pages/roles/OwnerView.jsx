import { ROLES } from '../../utils/roles';
import Ringkasan from './owner/Ringkasan';
import MitraHarga from './owner/MitraHarga';
import AsetDapur from './owner/AsetDapur';
import Persetujuan from './owner/Persetujuan';
import Settlement from './owner/Settlement';

export default function OwnerView({ tab, data, setData, notify, user }) {
  const actions = { data, setData, notify, user };

  if (tab === 0) return <Ringkasan data={data} />;
  if (tab === 1) return <MitraHarga {...actions} />;
  if (tab === 2) return <AsetDapur {...actions} />;
  if (tab === 3) return <Persetujuan {...actions} />;
  if (tab === 4) return <Settlement data={data} />;

  return <div className="empty">Pemilik: tab "{ROLES.owner.tabs[tab]}" belum dipindahkan</div>;
}
