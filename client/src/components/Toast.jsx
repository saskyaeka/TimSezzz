import { useEffect } from 'react';

// Pesan singkat yang muncul di bawah layar lalu hilang sendiri setelah 2,6 detik.
// message  : teks pesan ('' = tidak tampil)
// onClose  : fungsi yang dipanggil saat waktu habis, untuk mengosongkan pesan
export default function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, 2600);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
}
