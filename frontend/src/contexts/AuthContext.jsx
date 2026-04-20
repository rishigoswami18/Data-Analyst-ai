import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);

async function parseJson(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong.');
  }
  return data;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const response = await fetch('/api/auth/status', { credentials: 'same-origin' });
        const data = await response.json();
        if (!active) return;
        setUser(data.authenticated ? data.user : null);
      } catch {
        if (active) {
          setUser(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    bootstrap();
    return () => {
      active = false;
    };
  }, []);

  async function login(payload) {
    const data = await parseJson(
      await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      })
    );
    setUser(data.user);
    return data.user;
  }

  async function signup(payload) {
    const data = await parseJson(
      await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      })
    );
    setUser(data.user);
    return data.user;
  }

  async function logout() {
    await fetch('/api/logout', {
      method: 'POST',
      credentials: 'same-origin'
    });
    setUser(null);
  }

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      login,
      signup,
      logout
    }),
    [loading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
