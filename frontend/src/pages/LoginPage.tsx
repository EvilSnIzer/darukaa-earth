import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiRequestError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

interface LocationState {
  from?: string;
}

export function LoginPage() {
  const { login, register, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as LocationState | null)?.from ?? '/';

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('admin@darukaa.earth');
  const [password, setPassword] = useState('Admin@12345');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isLoading && isAuthenticated) return <Navigate to={redirectTo} replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register({ email, full_name: fullName, password });
      }
      navigate(redirectTo, { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.detail
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const useDemoCredentials = () => {
    setMode('login');
    setEmail('admin@darukaa.earth');
    setPassword('Admin@12345');
    setError(null);
  };

  return (
    <div className="auth-page">
      <section className="auth-hero">
        <div>
          <div className="brand" style={{ padding: 0, marginBottom: 8 }}>
            <div className="brand-mark">D</div>
            <div>
              <div className="brand-name">Darukaa.Earth</div>
              <div className="brand-sub">MRV Analytics</div>
            </div>
          </div>
          <h1>Measure nature-based climate impact, on a map.</h1>
          <p>
            Draw site boundaries, track satellite-derived vegetation and biodiversity metrics, and
            see how carbon and biodiversity projects perform over time.
          </p>
          <ul>
            <li>Create projects and add sites by drawing polygons</li>
            <li>PostGIS-backed area and centroid calculations</li>
            <li>Time-series analytics per site and per project</li>
          </ul>
        </div>
      </section>

      <section className="auth-form-wrap">
        <div className="auth-card">
          <h2 style={{ marginBottom: 4 }}>{mode === 'login' ? 'Sign in' : 'Create an account'}</h2>
          <p className="muted small" style={{ marginTop: 0, marginBottom: 20 }}>
            {mode === 'login'
              ? 'Use your administrator credentials to continue.'
              : 'The first account created becomes the administrator.'}
          </p>

          {error ? <div className="alert alert-error">{error}</div> : null}

          <form onSubmit={onSubmit}>
            {mode === 'register' ? (
              <div className="field">
                <label htmlFor="fullName">Full name</label>
                <input
                  id="fullName"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                  minLength={1}
                  autoComplete="name"
                />
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={mode === 'register' ? 8 : 1}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              {mode === 'register' ? (
                <span className="field-hint">At least 8 characters.</span>
              ) : null}
            </div>

            <button type="submit" className="btn btn-block" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="auth-switch">
            {mode === 'login' ? (
              <>
                <span className="muted">No account? </span>
                <Link
                  to="#"
                  onClick={(event) => {
                    event.preventDefault();
                    setMode('register');
                    setError(null);
                  }}
                >
                  Register
                </Link>
              </>
            ) : (
              <>
                <span className="muted">Already registered? </span>
                <Link
                  to="#"
                  onClick={(event) => {
                    event.preventDefault();
                    setMode('login');
                    setError(null);
                  }}
                >
                  Sign in
                </Link>
              </>
            )}
          </div>

          <div className="demo-box">
            <strong>Demo credentials</strong>
            <br />
            <span className="mono">admin@darukaa.earth / Admin@12345</span>
            <br />
            <button type="button" onClick={useDemoCredentials}>
              Fill demo credentials
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
