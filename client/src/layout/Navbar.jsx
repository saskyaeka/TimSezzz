import { ROLES } from '../utils/roles';

export default function Navbar({
  user,
  allowedRoles,
  activeRole,
  onSelectRole,
  onLogout,
  onToggleTheme,
}) {
  return (
    <aside>
      <div className="brand">
        <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
          <rect
            x="3"
            y="17"
            width="28"
            height="12"
            rx="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          />
          <path
            d="M7 17c0-6 4-10 10-10s10 4 10 10"
            fill="var(--steam)"
            stroke="currentColor"
            strokeWidth="2.2"
          />
          <path
            d="M12 4c-1.5 1.5 1.5 2.5 0 4M20 3c-1.5 1.5 1.5 2.5 0 4"
            stroke="var(--accent)"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
        <div>
          <b>PAOLOTORY</b>
          <small>Enterprise</small>
        </div>
      </div>

      <div>
        <div className="rolehead" id="rolehead">
          {allowedRoles.length > 1 ? 'Area kerja' : 'Area kerja Anda'}
        </div>
        <div className="roles" role="group" aria-labelledby="rolehead">
          {allowedRoles.map((key) => (
            <button
              key={key}
              type="button"
              className="role"
              aria-pressed={activeRole === key}
              onClick={() => onSelectRole(key)}
            >
              {ROLES[key].label}
              <span>{ROLES[key].sub}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="usercard">
        <b>{user.name}</b>
        <span className="small muted">{ROLES[user.role]?.label}</span>
        <span className="small muted">{user.email}</span>
        <button type="button" className="btn sm" onClick={onLogout}>
          Keluar
        </button>
      </div>

      <div className="side-foot">
        <button type="button" className="link" onClick={onToggleTheme}>
          Ganti tema terang/gelap
        </button>
      </div>
    </aside>
  );
}
