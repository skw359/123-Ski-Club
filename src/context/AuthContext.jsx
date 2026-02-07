import React, { createContext, useState, useContext, useEffect } from 'react';
import { apiUrl } from '../config/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [allowExternalEmails, setAllowExternalEmails] = useState(false);

  useEffect(() => {
    checkAuth();
    fetchConfig();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch(apiUrl('/api/auth/me'), {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error("Auth check failed", err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch(apiUrl('/api/auth/config'), {
        credentials: 'include'
      });
      if (res.ok) {
        const config = await res.json();
        setAllowExternalEmails(config.allowExternalEmails);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const logout = async () => {
    try {
      await fetch(apiUrl('/api/auth/logout'), {
        method: 'POST',
        credentials: 'include'
      });
      setUser(null);
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, checkAuth, logout, allowExternalEmails }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
