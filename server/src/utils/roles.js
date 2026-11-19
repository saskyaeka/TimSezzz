const ROLES = ['owner', 'kitchen', 'pos', 'courier', 'partner'];

const ACCESS = {
  owner: ['owner', 'kitchen', 'pos', 'courier', 'partner'],
  kitchen: ['kitchen'],
  pos: ['pos'],
  courier: ['courier'],
  partner: ['partner'],
};

function hasRoleAccess(userRole, targetArea) {
  const allowed = ACCESS[userRole] || [];
  return allowed.includes(targetArea);
}

module.exports = {
  ROLES,
  ACCESS,
  hasRoleAccess,
};
