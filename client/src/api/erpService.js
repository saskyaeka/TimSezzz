// [INTEGRASI BACKEND: Menghubungkan client ke REST API backend PostgreSQL]
import { apiClient } from './apiClient';
import { TODAY, addDays, batchNo, toDate } from '../utils/formatters';
import { findIngredient, stdUse } from '../utils/erpHelpers';

const withQuery = (path, params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.append(key, value);
    }
  });
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
};

// Helper mapper entitas agar seragam di seluruh UI
export const mapBatch = (b) => {
  const made = toDate(b.made_date || b.made) || new Date();
  const exp = toDate(b.exp_date || b.exp) || addDays(made, 30);
  const qty = Number(b.qty ?? 0);
  const left = Number(b.left_qty ?? b.left ?? qty);
  return {
    ...b,
    id: b.id,
    made_date: b.made_date || made.toISOString().split('T')[0],
    exp_date: b.exp_date || exp.toISOString().split('T')[0],
    made,
    exp,
    qty,
    left_qty: left,
    left,
    hpp: Number(b.hpp ?? b.hpp_per_unit ?? 0),
  };
};

export const mapOrder = (o) => ({
  ...o,
  id: o.id,
  p: o.partner_id || o.p,
  partner_id: o.partner_id || o.p,
  qty: Number(o.qty ?? 0),
  date: toDate(o.order_date || o.date) || new Date(),
  order_date: o.order_date,
  status: o.status || 'menunggu',
  note: o.note || '',
});

export const mapClaim = (c) => ({
  ...c,
  id: c.id,
  p: c.partner_id || c.p,
  partner_id: c.partner_id || c.p,
  qty: Number(c.qty ?? 0),
  date: toDate(c.claim_date || c.date) || new Date(),
  claim_date: c.claim_date,
  status: c.status || 'menunggu',
  photoUrl: c.photo_url || c.photoUrl || '',
  photo: c.photo_url || c.photoUrl || '',
});

export const mapManifest = (m) => ({
  ...m,
  id: m.id,
  p: m.partner_id || m.p,
  partner_id: m.partner_id || m.p,
  partner_name: m.partner_name || m.name || '',
  type: m.type || 'Gerai',
  zone: m.zone || 'Zona Pusat',
  qty: Number(m.qty ?? m.quantity ?? 0),
  done: m.status === 'terkirim' || Boolean(m.is_done ?? m.done),
  is_done: m.status === 'terkirim' || Boolean(m.is_done ?? m.done),
  photo: m.photo_url || m.photo || '',
  photo_url: m.photo_url || m.photo || '',
});

export const mapAsset = (a) => ({
  ...a,
  id: a.id,
  name: a.name,
  loc: a.location || a.loc || '',
  location: a.location || a.loc || '',
  cond: a.condition || a.cond || 'Baik',
  condition: a.condition || a.cond || 'Baik',
  scan: toDate(a.last_inspected_at || a.scan) || new Date(),
  flag: Boolean(a.writeoff_approved ?? a.flag),
  writeoff_approved: Boolean(a.writeoff_approved ?? a.flag),
});

export const mapProductionToUsage = (pr) => ({
  t: toDate(pr.created_at) || new Date(),
  mode: pr.usage_mode || 'auto',
  resep: pr.recipe_count,
  qty: pr.yield_qty,
  batch: pr.batch_id,
  by: pr.created_by || 'Dapur',
  note: pr.note || '',
  items: (pr.items || []).map((it) => ({
    id: it.ingredientId,
    name: it.ingredientName || it.ingredientId,
    unit: it.unit || 'g',
    used: Number(it.quantityUsed || 0),
    std: Number(it.standardQuantity || 0),
  })),
});

function seedUsage(data, days, mode, resep, note, tweak) {
  const made = addDays(TODAY, -days);
  const bomYield = data?.recipe?.yield || data?.bom?.yield || 60;
  const bomItems = data?.bom?.items || [];
  return {
    t: made,
    mode,
    resep,
    qty: resep * bomYield,
    batch: batchNo(made, 1),
    by: 'Manajer Dapur',
    note,
    items: bomItems.map(([id]) => {
      const ing = findIngredient(data, id);
      const std = stdUse(data, id, resep);
      const used = tweak && tweak[id] ? +(std + tweak[id]).toFixed(3) : std;
      return { id, name: ing?.name || id, unit: ing?.unit || 'g', used, std };
    }),
  };
}

// Kerangka state awal
export function getInitialData() {
  const data = {
    partners: [],
    users: [],
    ingredients: [],
    batches: [],
    manifest: [],
    manifests: [],
    claims: [],
    orders: [],
    assets: [],
    ledger: [],
    productions: [],
    purchaseOrders: [],
    pos: { shift: null, cart: {}, sales: [], pay: 'tunai', lastClose: null, revenue: 0, units: 0 },
    podDraft: null,
    price: { mitra: 9000, kasir: 12000 },
    recipe: { yield: 60, opex: 45000, bom: {} },
    bom: {
      name: 'Bakpau ayam kecap',
      yield: 60,
      opex: 45000,
      items: [
        ['tepung', 6000],
        ['gula', 1200],
        ['ragi', 80],
        ['ayam', 4000],
        ['bumbu', 500],
        ['plastik', 60],
      ],
    },
    shift: null,
    posProducts: [],
    sales: [],
    partnerInventory: null,
    settlement: null,
    dashboard: null,
    usage: [],
  };

  data.usage = [
    seedUsage(data, 2, 'auto', 3, '', null),
    seedUsage(data, 4, 'manual', 2, 'Adonan lebih basah, tepung ditambah', { tepung: 800, ragi: 10 }),
  ];

  return data;
}

// [INTEGRASI BACKEND: Tarik & petakan data dari database PostgreSQL sesuai peran pengguna]
export async function fetchRoleData(role) {
  const base = getInitialData();
  let currentUser = null;
  try {
    const rawUser = localStorage.getItem('user');
    if (rawUser) currentUser = JSON.parse(rawUser);
  } catch {
    // Abaikan jika parsing gagal
  }

  if (role === 'owner') {
    const [
      dashRes,
      partnersRes,
      usersRes,
      pricesRes,
      assetsRes,
      ordersRes,
      claimsRes,
      manifestsRes,
      ingRes,
      batchesRes,
      recipeRes,
      logsRes,
      posProdRes,
      poRes,
      prodRes,
    ] = await Promise.all([
      apiClient('/owner/dashboard').catch(() => ({ data: null })),
      apiClient('/owner/partners').catch(() => ({ data: { partners: [] } })),
      apiClient('/owner/users').catch(() => ({ data: { users: [] } })),
      apiClient('/owner/prices').catch(() => ({ data: null })),
      apiClient('/owner/assets').catch(() => ({ data: { assets: [] } })),
      apiClient('/owner/orders').catch(() => ({ data: { orders: [] } })),
      apiClient('/owner/claims').catch(() => ({ data: { claims: [] } })),
      apiClient('/owner/manifests').catch(() => ({ data: { manifests: [] } })),
      apiClient('/kitchen/ingredients').catch(() => ({ data: { ingredients: [] } })),
      apiClient('/kitchen/batches').catch(() => ({ data: { batches: [] } })),
      apiClient('/kitchen/recipe').catch(() => ({ data: null })),
      apiClient('/owner/audit-logs').catch(() => ({ data: { auditLogs: [] } })),
      apiClient('/pos/products').catch(() => ({ data: { products: [] } })),
      apiClient('/kitchen/purchase-orders').catch(() => ({ data: { purchaseOrders: [] } })),
      apiClient('/kitchen/production').catch(() => ({ data: { productions: [] } })),
    ]);

    const rawPrices = pricesRes?.data?.prices || pricesRes?.data || {};
    const rawRecipe = recipeRes?.data?.recipe || recipeRes?.data || {};
    const bomMap = {};
    const bomItemsList = [];
    if (Array.isArray(rawRecipe.items)) {
      rawRecipe.items.forEach((item) => {
        const id = item.ingredient_id || item.id;
        const qty = Number(item.qty_per_recipe ?? item.qty ?? item.quantity ?? 0);
        bomMap[id] = qty;
        bomItemsList.push([id, qty]);
      });
    } else if (rawRecipe.bom && typeof rawRecipe.bom === 'object') {
      Object.assign(bomMap, rawRecipe.bom);
      Object.entries(rawRecipe.bom).forEach(([id, qty]) => {
        bomItemsList.push([id, Number(qty)]);
      });
    }

    const mappedManifests = (manifestsRes?.data?.manifests || []).map(mapManifest);
    const mappedPartners = (partnersRes?.data?.partners || []).map((p) => ({
      ...p,
      sent: Number(p.sent ?? 0),
      sold: Number(p.sold ?? 0),
      returned: Number(p.returned ?? 0),
    }));

    const mappedIngredients = (ingRes?.data?.ingredients || []).map((ing) => ({
      ...ing,
      stock: Number(ing.stock ?? 0),
      rop: Number(ing.rop ?? ing.reorder_point ?? 0),
      price: Number(ing.price ?? ing.unit_price ?? 0),
    }));

    const mappedBatches = (batchesRes?.data?.batches || []).map(mapBatch);
    const mappedAssets = (assetsRes?.data?.assets || []).map(mapAsset);
    const mappedOrders = (ordersRes?.data?.orders || []).map(mapOrder);
    const mappedClaims = (claimsRes?.data?.claims || []).map(mapClaim);

    const mappedUsers = (usersRes?.data?.users || []).map((u) => ({
      ...u,
      partner: u.partner_id || u.partner || '',
    }));

    const rawLogs = logsRes?.data?.auditLogs || logsRes?.data?.logs || [];
    const mappedLedger = rawLogs.map((log) => ({
      t: toDate(log.created_at) || new Date(),
      text: log.detail || log.description || log.action || 'Aktivitas sistem',
      by: log.actor_email || log.actor_name || '',
    }));

    const rawProductions = prodRes?.data?.productions || [];
    const mappedUsage = rawProductions.length
      ? rawProductions.map(mapProductionToUsage)
      : base.usage;

    const dash = dashRes?.data || {};

    return {
      ...base,
      dashboard: dash,
      partners: mappedPartners,
      users: mappedUsers,
      price: {
        mitra: Number(rawPrices.partner_price ?? rawPrices.mitra ?? 9000),
        kasir: Number(rawPrices.central_price ?? rawPrices.kasir ?? 12000),
      },
      pos: {
        ...base.pos,
        revenue: Number(dash?.pos?.revenue ?? dash?.posRevenue ?? 0),
        units: Number(dash?.pos?.units ?? dash?.posUnits ?? 0),
      },
      assets: mappedAssets,
      orders: mappedOrders,
      claims: mappedClaims,
      manifests: mappedManifests,
      manifest: mappedManifests,
      ingredients: mappedIngredients,
      batches: mappedBatches,
      purchaseOrders: poRes?.data?.purchaseOrders || [],
      productions: rawProductions,
      usage: mappedUsage,
      recipe: {
        yield: Number(rawRecipe.yield ?? rawRecipe.yield_qty ?? 60),
        opex: Number(rawRecipe.opex ?? rawRecipe.opex_per_recipe ?? 45000),
        bom: bomMap,
      },
      bom: {
        ...base.bom,
        yield: Number(rawRecipe.yield ?? rawRecipe.yield_qty ?? 60),
        opex: Number(rawRecipe.opex ?? rawRecipe.opex_per_recipe ?? 45000),
        items: bomItemsList.length ? bomItemsList : base.bom.items,
      },
      posProducts: posProdRes?.data?.products || [],
      ledger: mappedLedger.length ? mappedLedger : base.ledger,
    };
  }

  if (role === 'kitchen') {
    const [ingRes, recipeRes, batchesRes, poRes, prodRes, movRes] = await Promise.all([
      apiClient('/kitchen/ingredients').catch(() => ({ data: { ingredients: [] } })),
      apiClient('/kitchen/recipe').catch(() => ({ data: null })),
      apiClient('/kitchen/batches').catch(() => ({ data: { batches: [] } })),
      apiClient('/kitchen/purchase-orders').catch(() => ({ data: { purchaseOrders: [] } })),
      apiClient('/kitchen/production').catch(() => ({ data: { productions: [] } })),
      apiClient('/kitchen/movements').catch(() => ({ data: { movements: [] } })),
    ]);

    const rawRecipe = recipeRes?.data?.recipe || {};
    const bomMap = {};
    const bomItemsList = [];
    if (Array.isArray(rawRecipe.items)) {
      rawRecipe.items.forEach((item) => {
        const id = item.ingredient_id || item.id;
        const qty = Number(item.quantity ?? item.qty ?? 0);
        bomMap[id] = qty;
        bomItemsList.push([id, qty]);
      });
    }

    const mappedIngredients = (ingRes?.data?.ingredients || []).map((ing) => ({
      ...ing,
      stock: Number(ing.stock ?? 0),
      rop: Number(ing.rop ?? ing.reorder_point ?? 0),
      price: Number(ing.price ?? ing.unit_price ?? 0),
    }));

    const rawProductions = prodRes?.data?.productions || [];
    const mappedUsage = rawProductions.length
      ? rawProductions.map(mapProductionToUsage)
      : base.usage;

    return {
      ...base,
      ingredients: mappedIngredients,
      recipe: {
        yield: Number(rawRecipe.yield ?? 60),
        opex: Number(rawRecipe.opex ?? 45000),
        bom: bomMap,
      },
      bom: {
        ...base.bom,
        yield: Number(rawRecipe.yield ?? 60),
        opex: Number(rawRecipe.opex ?? 45000),
        items: bomItemsList.length ? bomItemsList : base.bom.items,
      },
      batches: (batchesRes?.data?.batches || []).map(mapBatch),
      purchaseOrders: poRes?.data?.purchaseOrders || [],
      productions: rawProductions,
      usage: mappedUsage,
      ledger: (movRes?.data?.movements || []).map((m) => ({
        t: toDate(m.created_at) || new Date(),
        text: `${m.ingredient_name || m.ingredient_id}: ${m.quantity_delta > 0 ? '+' : ''}${m.quantity_delta} ${m.unit || ''} (${m.reason || 'Mutasi'})`,
        by: m.created_by || '',
      })),
    };
  }

  if (role === 'pos') {
    const [prodRes, shiftRes] = await Promise.all([
      apiClient('/pos/products').catch(() => ({ data: { products: [] } })),
      apiClient('/pos/shifts/current').catch(() => ({ data: { shift: null } })),
    ]);

    let sales = [];
    const activeShift = shiftRes?.data?.shift || null;
    if (activeShift?.id) {
      const salesRes = await apiClient(`/pos/shifts/${activeShift.id}/sales`).catch(() => ({
        data: { sales: [] },
      }));
      sales = salesRes?.data?.sales || [];
    }

    const posProducts = prodRes?.data?.products || [];
    return {
      ...base,
      posProducts,
      shift: activeShift,
      pos: {
        ...base.pos,
        shift: activeShift ? { open: Number(activeShift.opening_cash || 0), ...activeShift } : null,
        sales,
      },
      sales,
    };
  }

  if (role === 'courier') {
    const manifestsRes = await apiClient('/logistics/manifests').catch(() => ({
      data: { manifests: [] },
    }));

    const rawManifests = manifestsRes?.data?.manifests || [];
    const mappedManifests = rawManifests.map(mapManifest);

    // Kumpulkan info gerai dari manifes agar KurirView tidak crash saat filter zona
    const courierPartners = [];
    const seenPartnerIds = new Set();
    for (const m of mappedManifests) {
      const pId = m.partner_id || m.p;
      if (pId && !seenPartnerIds.has(pId)) {
        seenPartnerIds.add(pId);
        courierPartners.push({
          id: pId,
          name: m.partner_name || pId,
          type: m.type || 'Gerai',
          zone: m.zone || 'Zona Pusat',
          sent: 0,
          sold: 0,
          returned: 0,
        });
      }
    }

    return {
      ...base,
      partners: courierPartners,
      manifests: mappedManifests,
      manifest: mappedManifests,
    };
  }

  if (role === 'partner') {
    const [invRes, salesRes, ordersRes, claimsRes, setRes] = await Promise.all([
      apiClient('/partner/inventory').catch(() => ({ data: null })),
      apiClient('/partner/sales').catch(() => ({ data: { sales: [] } })),
      apiClient('/partner/orders').catch(() => ({ data: { orders: [] } })),
      apiClient('/partner/claims').catch(() => ({ data: { claims: [] } })),
      apiClient('/partner/settlement').catch(() => ({ data: null })),
    ]);

    const inv = invRes?.data?.inventory || {};
    const partnerId = inv.partnerId || currentUser?.partnerId || 'p1';
    const partnerObj = {
      id: partnerId,
      name: inv.partnerName || inv.name || currentUser?.name || 'Gerai Saya',
      type: inv.type || 'Gerai Titip-Jual',
      zone: inv.zone || 'Zona Pusat',
      sent: Number(inv.sent || 0),
      sold: Number(inv.sold || 0),
      returned: Number(inv.returned || 0),
    };

    return {
      ...base,
      partners: [partnerObj],
      partnerInventory: inv,
      sales: salesRes?.data?.sales || [],
      orders: (ordersRes?.data?.orders || []).map(mapOrder),
      claims: (claimsRes?.data?.claims || []).map(mapClaim),
      settlement: setRes?.data?.settlement || setRes?.data || null,
    };
  }

  return base;
}

// [INTEGRASI BACKEND: Kumpulan fungsi CRUD lengkap ke endpoint backend]
export const erpService = {
  getInitialData,
  fetchRoleData,

  // === OWNER ===
  getOwnerDashboard: () => apiClient('/owner/dashboard'),
  getAuditLogs: (params) => apiClient(withQuery('/owner/audit-logs', params)),
  getPartners: (params) => apiClient(withQuery('/owner/partners', params)),
  createPartner: (body) => apiClient('/owner/partners', { method: 'POST', body }),
  updatePartner: (partnerId, body) => apiClient(`/owner/partners/${partnerId}`, { method: 'PATCH', body }),
  getPartnerInventoryByOwner: (partnerId) => apiClient(`/owner/partners/${partnerId}/inventory`),
  getPartnerSalesByOwner: (partnerId, params) => apiClient(withQuery(`/owner/partners/${partnerId}/sales`, params)),
  getPartnerSettlementByOwner: (partnerId, params) => apiClient(withQuery(`/owner/partners/${partnerId}/settlement`, params)),
  getSettlements: (params) => apiClient(withQuery('/owner/settlements', params)),
  getPrices: () => apiClient('/owner/prices'),
  updatePrices: (body) => apiClient('/owner/prices', { method: 'PATCH', body }),
  getAssets: () => apiClient('/owner/assets'),
  createAsset: (body) => apiClient('/owner/assets', { method: 'POST', body }),
  updateAsset: (assetId, body) => apiClient(`/owner/assets/${assetId}`, { method: 'PATCH', body }),
  approveAssetWriteoff: (assetId) => apiClient(`/owner/assets/${assetId}/approve-writeoff`, { method: 'POST' }),
  getUsers: (params) => apiClient(withQuery('/owner/users', params)),
  createUser: (body) => apiClient('/owner/users', { method: 'POST', body }),
  updateUser: (email, body) => apiClient(`/owner/users/${encodeURIComponent(email)}`, { method: 'PATCH', body }),
  getOwnerOrders: (params) => apiClient(withQuery('/owner/orders', params)),
  reviewOrder: (orderId, decision) => apiClient(`/owner/orders/${orderId}/review`, { method: 'PATCH', body: { decision } }),
  getOwnerClaims: (params) => apiClient(withQuery('/owner/claims', params)),
  reviewClaim: (claimId, decision) => apiClient(`/owner/claims/${claimId}/review`, { method: 'PATCH', body: { decision } }),
  getOwnerManifests: (params) => apiClient(withQuery('/owner/manifests', params)),
  createManualManifest: (body) => apiClient('/owner/manifests', { method: 'POST', body }),
  cancelManifest: (manifestId) => apiClient(`/owner/manifests/${manifestId}/cancel`, { method: 'POST' }),

  // === KITCHEN ===
  getIngredients: (params) => apiClient(withQuery('/kitchen/ingredients', params)),
  createIngredient: (body) => apiClient('/kitchen/ingredients', { method: 'POST', body }),
  updateIngredient: (ingredientId, body) => apiClient(`/kitchen/ingredients/${ingredientId}`, { method: 'PATCH', body }),
  getRecipe: () => apiClient('/kitchen/recipe'),
  updateRecipe: (body) => apiClient('/kitchen/recipe', { method: 'PUT', body }),
  getBatches: () => apiClient('/kitchen/batches'),
  getInventoryMovements: (params) => apiClient(withQuery('/kitchen/movements', params)),
  getPurchaseOrders: (params) => apiClient(withQuery('/kitchen/purchase-orders', params)),
  createPurchaseOrder: (body) => apiClient('/kitchen/purchase-orders', { method: 'POST', body }),
  receivePurchaseOrder: (orderId) => apiClient(`/kitchen/purchase-orders/${orderId}/receive`, { method: 'POST' }),
  getProductions: (params) => apiClient(withQuery('/kitchen/production', params)),
  createProduction: (body) => apiClient('/kitchen/production', { method: 'POST', body }),
  createIngredientAdjustment: (body) => apiClient('/kitchen/adjustments', { method: 'POST', body }),

  // === POS ===
  getPosProducts: () => apiClient('/pos/products'),
  getCurrentShift: () => apiClient('/pos/shifts/current'),
  openShift: (openingCash) => apiClient('/pos/shifts/open', { method: 'POST', body: { openingCash } }),
  closeShift: (countedCash) => apiClient('/pos/shifts/close', { method: 'POST', body: { countedCash } }),
  getShiftSales: (shiftId, params) => apiClient(withQuery(`/pos/shifts/${shiftId}/sales`, params)),
  checkoutPos: (body) => apiClient('/pos/sales', { method: 'POST', body }),
  reportSpoilage: (body) => apiClient('/pos/spoilage', { method: 'POST', body }),

  // === LOGISTICS ===
  getLogisticsManifests: (params) => apiClient(withQuery('/logistics/manifests', params)),
  claimManifest: (manifestId) => apiClient(`/logistics/manifests/${manifestId}/claim`, { method: 'POST' }),
  confirmDelivery: (manifestId, body) => apiClient(`/logistics/manifests/${manifestId}/deliver`, { method: 'POST', body }),

  // === PARTNER ===
  getPartnerInventory: () => apiClient('/partner/inventory'),
  getPartnerSales: (params) => apiClient(withQuery('/partner/sales', params)),
  createPartnerSale: (quantity) => apiClient('/partner/sales', { method: 'POST', body: { quantity } }),
  getPartnerOrders: (params) => apiClient(withQuery('/partner/orders', params)),
  createPartnerOrder: (body) => apiClient('/partner/orders', { method: 'POST', body }),
  getPartnerClaims: (params) => apiClient(withQuery('/partner/claims', params)),
  createPartnerClaim: (body) => apiClient('/partner/claims', { method: 'POST', body }),
  getPartnerSettlement: (params) => apiClient(withQuery('/partner/settlement', params)),
};

export default erpService;
