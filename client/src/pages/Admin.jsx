import { NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useAuth } from '../auth.js';
import AuthForms from './AuthForms.jsx';
import Panel from './Panel.jsx';
import Users from './Users.jsx';

// The pages at /admin: log in, "My site", and (for the super admin) "People".
export default function Admin() {
  const auth = useAuth();
  const isSuper = auth.user?.role === 'superadmin';

  if (auth.checking) return <div className="ad"><p className="ad-wrap">Loading…</p></div>;
  if (auth.problem && auth.token && !auth.user) {
    return (
      <div className="ad"><div className="ad-wrap">
        <p className="ad-msg ad-err">{auth.problem}</p>
        <p><button onClick={() => window.location.reload()}>Try again</button> <button className="ad-ghost" onClick={auth.logout}>Log out</button></p>
      </div></div>
    );
  }
  if (!auth.token || !auth.user) return <div className="ad"><AuthForms onSignedIn={auth.signIn} problem={auth.problem} /></div>;

  return (
    <div className="ad">
      <div className="ad-wrap">
        <header className="ad-bar">
          <nav aria-label="Pages">
            <NavLink end to="/admin">My site</NavLink>
            {isSuper && <NavLink to="/admin/users">People</NavLink>}
          </nav>
          <div className="ad-who">
            <span>{auth.user.name}</span>
            {isSuper && <span className="ad-badge ad-badge-super">Super admin</span>}
            <button className="ad-ghost" onClick={auth.logout}>Log out</button>
          </div>
        </header>
        <Routes>
          <Route index element={<Panel who="me" auth={auth} />} />
          {isSuper && <Route path="users" element={<Users auth={auth} />} />}
          {isSuper && <Route path="users/:id" element={<Person auth={auth} />} />}
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </div>
    </div>
  );
}

// The super admin opens somebody else's site to look at it or clean it up.
function Person({ auth }) {
  const { id } = useParams();
  return <Panel key={id} who={id} auth={auth} />;
}
