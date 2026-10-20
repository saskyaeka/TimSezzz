const BASE_URL = '/api';

export async function apiClient(endpoint, { body, ...customConfig } = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    method: body ? 'POST' : 'GET',
    ...customConfig,
    headers: {
      ...headers,
      ...customConfig.headers,
    },
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, config);

  // Ambil teks mentah terlebih dahulu untuk menghindari JSON crash jika body kosong
  const text = await response.text();
  let data = {};
  
  try {
    data = text ? JSON.parse(text) : {};
  } catch (err) {
    console.error('Format respons bukan JSON:', text);
    throw new Error('Respons dari server tidak valid.');
  }

  if (!response.ok) {
    throw new Error(data.message || `Terjadi kesalahan (Status ${response.status})`);
  }

  return data;
}