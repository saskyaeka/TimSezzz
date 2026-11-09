import { ROLES } from '../../utils/roles';
import Ringkasan from './owner/Ringkasan';
import MitraHarga from './owner/MitraHarga';

export default function OwnerView({ tab, data, setData, notify, user }) {
  if (tab === 0) return <Ringkasan data={data} />;
  if (tab === 1) return <MitraHarga data={data} setData={setData} notify={notify} user={user} />;

  return <div className="empty">Pemilik: tab "{ROLES.owner.tabs[tab]}" belum dipindahkan</div>;
}
