import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (!token) {
      navigate('/login');
      return;
    }

    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (err) {
        console.error('Gagal parse user:', err);
      }
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div style={{ padding: '30px', fontFamily: 'sans-serif' }}>
      <h1>Dashboard Paolotory Enterprise</h1>
      <p>Halo, <b>{user?.name || 'User'}</b>! Role Anda: <b>{user?.role || 'Staff'}</b></p>
      <button
        onClick={handleLogout}
        style={{
          padding: '8px 16px',
          backgroundColor: '#e53935',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        Keluar (Logout)
      </button>
    </div>
  );
}