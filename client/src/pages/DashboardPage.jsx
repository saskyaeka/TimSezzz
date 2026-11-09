import { useCallback, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import Navbar from '../layout/Navbar';
import Toast from '../components/Toast';
import { ROLES, ACCESS, ROLE_HEADS } from '../utils/roles';
import { getInitialData } from '../api/erpService';
import OwnerView from './roles/OwnerView';
import ProduksiView from './roles/ProduksiView';
import KasirView from './roles/KasirView';
import KurirView from './roles/KurirView';
import MitraView from './roles/MitraView';

// Area kerja -> komponen tampilannya
const VIEWS = {
  owner: OwnerView,
  produksi: ProduksiView,
  kasir: KasirView,
  pengantar: KurirView,
  mitra: MitraView,
};

function readUser() {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
}

function toggleTheme() {
  const root = document.documentElement;
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const current = root.dataset.theme || (dark ? 'dark' : 'light');
  root.dataset.theme = current === 'dark' ? 'light' : 'dark';
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [user] = useState(readUser);
  const allowedRoles = (user && ACCESS[user.role]) || [];
  const [activeRole, setActiveRole] = useState(allowedRoles[0]);
  const [tabs, setTabs] = useState({});
  const [data, setData] = useState(getInitialData);
  const [toast, setToast] = useState('');
  const closeToast = useCallback(() => setToast(''), []);

  if (!localStorage.getItem('token') || !user || allowedRoles.length === 0) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const View = VIEWS[activeRole];
  const tab = tabs[activeRole] ?? 0;

  return (
    <div className="app">
      <Navbar
        user={user}
        allowedRoles={allowedRoles}
        activeRole={activeRole}
        onSelectRole={setActiveRole}
        onLogout={handleLogout}
        onToggleTheme={toggleTheme}
      />
      <main>
        <div className="top">
          <div>
            <h1>{ROLES[activeRole].label}</h1>
            <p>{ROLE_HEADS[activeRole]}</p>
          </div>
        </div>
        <div className="tabs" role="tablist">
          {ROLES[activeRole].tabs.map((name, i) => (
            <button
              key={name}
              type="button"
              className="tab"
              role="tab"
              aria-selected={i === tab}
              onClick={() => setTabs({ ...tabs, [activeRole]: i })}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="stack" role="tabpanel">
          <View tab={tab} data={data} setData={setData} notify={setToast} user={user} />
        </div>
      </main>
      <Toast message={toast} onClose={closeToast} />
    </div>
  );
}
