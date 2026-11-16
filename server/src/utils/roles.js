export const ACCESS = {
  owner: ['owner', 'produksi', 'kasir', 'pengantar', 'mitra'],
  produksi: ['produksi'],
  kasir: ['kasir'],
  pengantar: ['pengantar'],
  mitra: ['mitra'],
};

export function hasRoleAccess(userRole, targetArea) {
  const allowed = ACCESS[userRole] || [];
  return allowed.includes(targetArea);
}