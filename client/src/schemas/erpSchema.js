import { z } from 'zod';

// Skema validasi pesanan stok dari mitra
export const partnerOrderSchema = z.object({
  quantity: z.number().int().min(1, 'Jumlah pesanan minimal 1 butir'),
  note: z.string().max(500, 'Catatan maksimal 500 karakter').optional(),
});

// Skema validasi klaim retur dari mitra
export const partnerClaimSchema = z.object({
  quantity: z.number().int().min(1, 'Jumlah retur minimal 1 butir'),
  photoUrl: z.string().url('URL foto retur tidak valid').optional().or(z.literal('')),
});

// Skema validasi laporan penjualan mitra
export const partnerSaleSchema = z.object({
  quantity: z.number().int().min(1, 'Jumlah penjualan minimal 1 butir'),
});

// Skema validasi shift kasir
export const openShiftSchema = z.object({
  openingCash: z.number().min(0, 'Modal awal kasir tidak boleh negatif'),
});

export const closeShiftSchema = z.object({
  countedCash: z.number().min(0, 'Uang kas terhitung tidak boleh negatif'),
});

// Skema validasi transaksi checkout POS
export const posCheckoutSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.enum(['hangat', 'pack6', 'pack12']),
        quantity: z.number().int().min(1, 'Jumlah produk minimal 1'),
      })
    )
    .min(1, 'Pesanan harus berisi minimal 1 produk'),
  paymentMethod: z.enum(['tunai', 'qris']),
  receivedAmount: z.number().optional(),
});

// Skema validasi tambah mitra baru
export const createPartnerSchema = z.object({
  name: z.string().min(3, 'Nama gerai minimal 3 huruf').max(100),
  type: z.string().min(1, 'Jenis gerai wajib dipilih').max(50),
  zone: z.string().min(1, 'Zona gerai wajib dipilih').max(50),
  pin: z.string().regex(/^\d{4}$/, 'PIN gerai harus terdiri dari 4 angka'),
  address: z.string().max(500).optional(),
  initialQty: z.number().int().min(0).optional(),
});

// Skema validasi bahan baku
export const createIngredientSchema = z.object({
  id: z.string().min(2, 'ID bahan minimal 2 karakter').max(50),
  name: z.string().min(2, 'Nama bahan minimal 2 karakter').max(100),
  unit: z.string().min(1, 'Satuan wajib diisi').max(10),
  price: z.number().min(0, 'Harga beli tidak boleh negatif'),
  stock: z.number().min(0).optional(),
  rop: z.number().min(0).optional(),
});

// Skema validasi produksi (SPK)
export const productionRunSchema = z.object({
  recipeCount: z.number().int().min(1, 'Jumlah resep minimal 1'),
  usageMode: z.enum(['auto', 'manual']),
  note: z.string().max(500).optional(),
  items: z.record(z.string(), z.number().min(0)).optional(),
});
