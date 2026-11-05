import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';

export default function App() {
  return (
    <Routes>
      {/* Rute Publik */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Rute Dashboard */}
      <Route path="/dashboard" element={<DashboardPage />} />

      {/* Default redirect jika rute tidak ditemukan */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
