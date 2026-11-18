import { ROLES } from '../../utils/roles';
import BahanBaku from './produksi/BahanBaku';
import ProduksiSpk from './produksi/ProduksiSpk';
import BatchKedaluwarsa from './produksi/BatchKedaluwarsa';
import CatatanPengurangan from './produksi/CatatanPengurangan';

export default function ProduksiView({ tab, data, setData, notify, user }) {
  const actions = { data, setData, notify, user };

  if (tab === 0) return <BahanBaku {...actions} />;
  if (tab === 1) return <ProduksiSpk {...actions} />;
  if (tab === 2) return <BatchKedaluwarsa data={data} />;
  if (tab === 3) return <CatatanPengurangan {...actions} />;

  return <div className="empty">Produksi: tab "{ROLES.produksi.tabs[tab]}" belum dipindahkan</div>;
}
