import { useEffect, useRef, useState } from 'react';

// Hentikan semua aliran kamera yang sedang aktif
function stopStream(ref) {
  if (ref.current) ref.current.getTracks().forEach((t) => t.stop());
  ref.current = null;
}

// Bukti serah terima (e-POD): foto langsung dari kamera, koordinat GPS, lalu konfirmasi
export default function PodForm({ onConfirm, coldAvailable, qty }) {
  const [photo, setPhoto] = useState('');
  const [photoAt, setPhotoAt] = useState('');
  const [camOn, setCamOn] = useState(false);
  const [gps, setGps] = useState('');
  const [gpsText, setGpsText] = useState('Belum dicatat');
  const [msg, setMsg] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Tampilkan aliran kamera di elemen video saat kamera menyala
  useEffect(() => {
    const video = videoRef.current;
    if (camOn && video && streamRef.current) {
      video.srcObject = streamRef.current;
      video.play().catch(() => {});
    }
  }, [camOn]);

  // Matikan kamera saat form ditutup
  useEffect(() => () => stopStream(streamRef), []);

  const openCam = async () => {
    setPhoto('');
    stopStream(streamRef);
    setCamOn(false);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return setMsg(
        'Kamera tidak didukung di perangkat atau browser ini. Buka lewat https atau gunakan browser lain.'
      );
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      setCamOn(true);
      setMsg('');
    } catch {
      setMsg('Kamera tidak bisa dibuka. Beri izin kamera lalu coba lagi.');
    }
  };

  const cancelCam = () => {
    stopStream(streamRef);
    setCamOn(false);
  };

  const shoot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      return setMsg('Kamera belum siap. Tunggu sebentar lalu coba lagi.');
    }
    const k = Math.min(1, 900 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * k);
    canvas.height = Math.round(video.videoHeight * k);
    const g = canvas.getContext('2d');
    g.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Cap waktu (dan koordinat bila ada) di bagian bawah foto
    const now = new Date();
    const stamp = now.toLocaleString('id-ID') + (gps ? ' · ' + gps : '');
    const fs = Math.max(12, Math.round(canvas.width / 32));
    g.fillStyle = 'rgba(0,0,0,.55)';
    g.fillRect(0, canvas.height - fs * 1.9, canvas.width, fs * 1.9);
    g.fillStyle = '#fff';
    g.font = fs + 'px sans-serif';
    g.textBaseline = 'middle';
    g.fillText(stamp, fs * 0.6, canvas.height - fs * 0.95);

    setPhoto(canvas.toDataURL('image/jpeg', 0.75));
    setPhotoAt(now.toISOString());
    stopStream(streamRef);
    setCamOn(false);
    setMsg('');
  };

  const readGps = () => {
    if (!navigator.geolocation) return setGpsText('Perangkat tidak mendukung GPS');
    setGpsText('Mencari lokasi…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const text = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        setGps(text);
        setGpsText(text);
      },
      () => setGpsText('Lokasi tidak bisa diakses. Beri izin lokasi lalu coba lagi.'),
      { timeout: 8000 }
    );
  };

  const confirm = () => {
    if (!photo) return setMsg('Ambil foto langsung dari kamera dulu sebelum konfirmasi.');
    if (qty > coldAvailable)
      return setMsg(`Cold storage hanya ${coldAvailable} butir. Muatan tidak cukup.`);
    stopStream(streamRef);

    let latitude = null;
    let longitude = null;
    if (gps && gps.includes(',')) {
      const parts = gps.split(',').map((s) => parseFloat(s.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        latitude = parts[0];
        longitude = parts[1];
      }
    }

    onConfirm({ photo, photoAt, latitude, longitude });
  };

  return (
    <div
      style={{
        marginTop: 12,
        padding: 14,
        background: 'var(--steam)',
        borderRadius: 8,
      }}
    >
      <h3>Bukti serah terima (e-POD)</h3>
      <p className="small muted" style={{ margin: '2px 0 10px' }}>
        Foto barang yang diterima gerai langsung dari kamera sebagai bukti serah terima. Waktu foto
        dicantumkan otomatis.
      </p>
      <label>Foto konfirmasi penerimaan</label>
      {photo && (
        <>
          <img className="pod-photo" src={photo} alt="Foto bukti serah terima" />
          <div className="row" style={{ margin: '8px 0 4px' }}>
            <button type="button" className="btn sm" onClick={openCam}>
              Foto ulang
            </button>
          </div>
        </>
      )}
      {!photo && camOn && (
        <>
          <video ref={videoRef} className="pod-photo" autoPlay playsInline muted />
          <div className="row" style={{ margin: '8px 0 4px', gap: 10 }}>
            <button type="button" className="btn sm primary" onClick={shoot}>
              Ambil gambar
            </button>
            <button type="button" className="link" onClick={cancelCam}>
              Batal
            </button>
          </div>
        </>
      )}
      {!photo && !camOn && (
        <>
          <div className="row" style={{ margin: '6px 0 4px' }}>
            <button type="button" className="btn" onClick={openCam}>
              Buka kamera
            </button>
          </div>
          <div className="small muted">
            Foto hanya bisa diambil langsung dari kamera saat pengantaran. Unggah dari galeri tidak
            tersedia.
          </div>
        </>
      )}
      <div className="grid g2" style={{ margin: '12px 0' }}>
        <div className="field">
          <label>Lokasi</label>
          <button type="button" className="btn" style={{ width: '100%' }} onClick={readGps}>
            Catat koordinat GPS
          </button>
          <div className="small muted" style={{ marginTop: 4 }}>
            {gpsText}
          </div>
        </div>
      </div>
      {msg && <div className="msg bad">{msg}</div>}
      <button type="button" className="btn primary" onClick={confirm}>
        Konfirmasi penerimaan
      </button>
    </div>
  );
}
