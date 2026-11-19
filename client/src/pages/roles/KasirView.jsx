import { ROLES } from '../../utils/roles';
import KasirPos from './kasir/KasirPos';
import ShiftKas from './kasir/ShiftKas';

export default function KasirView({ tab, data, setData, notify, user, goTab }) {
  const actions = { data, setData, notify, user, goTab };

  if (tab === 0) return <KasirPos {...actions} />;
  if (tab === 1) return <ShiftKas {...actions} />;

  return <div className="empty">Kasir: tab "{ROLES.kasir.tabs[tab]}" belum dipindahkan</div>;
}
