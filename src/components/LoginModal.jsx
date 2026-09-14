import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../config/api';

const LoginModal = ({ isOpen, onClose }) => {
  const { allowExternalEmails } = useAuth();
  const [email, setEmail] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [regData, setRegData] = useState({ firstName: '', lastName: '' });
  const [message, setMessage] = useState(null);

  //  body scroll lock when modal is open , wow so professional
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }

    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [isOpen]);

  // escape key to close modal
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  const isValidEmail = (e) => {
    if (allowExternalEmails) return e.includes('@') && e.includes('.');
    const lower = e.toLowerCase();
    return lower.endsWith('@terpmail.umd.edu') || lower.endsWith('@umd.edu');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setMessage({ type: 'error', text: allowExternalEmails ? 'Invalid email.' : 'Please use your @terpmail.umd.edu or @umd.edu email' });
      return;
    }
    
    try {
      const res = await fetch(apiUrl('/api/auth/request-magic-link'), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        credentials: 'include',
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      
      if (res.ok) {
        setMessage({ type: 'success', text: 'Login link sent! Check your inbox.' });
      } else if (res.status === 404) {
        setIsRegistering(true);
        setMessage(null);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to send link.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error.' });
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!regData.firstName || !regData.lastName) {
      setMessage({ type: 'error', text: 'Name is required.' });
      return;
    }

    try {
      const res = await fetch(apiUrl('/api/auth/request-magic-link'), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        credentials: 'include',
        body: JSON.stringify({ email, first_name: regData.firstName, last_name: regData.lastName })
      });
      
      if (res.ok) {
        setMessage({ type: 'success', text: 'Registration successful! Check your inbox.' });
        setTimeout(onClose, 3000);
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error || 'Registration failed.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error.' });
    }
  };

  return (
    <div className={`modal-overlay ${isOpen ? 'active' : ''}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="modal-close" onClick={onClose}>&times;</button>
        <h2 className="modal-title">
          {isRegistering ? 'Register for UMD Ski Club' : 'Login to Continue'}
        </h2>

        {message && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}

        {!isRegistering ? (
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="emailInput">UMD Email</label>
              <input
                type="email"
                id="emailInput"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={allowExternalEmails ? "name@example.com" : "student@terpmail.umd.edu"}
                required
                autoFocus
              />
            </div>
            <button type="submit" className="btn">Send Login Link</button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="login-form">
            <div className="form-group">
              <label htmlFor="regFirstName">First Name</label>
              <input
                type="text"
                id="regFirstName"
                value={regData.firstName}
                onChange={(e) => setRegData({...regData, firstName: e.target.value})}
                placeholder="Enter your first name"
                required
                minLength={2}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label htmlFor="regLastName">Last Name</label>
              <input
                type="text"
                id="regLastName"
                value={regData.lastName}
                onChange={(e) => setRegData({...regData, lastName: e.target.value})}
                placeholder="Enter your last name"
                required
                minLength={1}
              />
            </div>
            <div className="form-group">
              <label htmlFor="regEmail">Email (UMD)</label>
              <input
                type="email"
                id="regEmail"
                value={email}
                readOnly
              />
            </div>
            <button type="submit" className="btn">Register & Send Login Link</button>
            <button type="button" className="btn secondary" onClick={() => setIsRegistering(false)}>Back to Login</button>
          </form>
        )}
      </div>
    </div>
  );
};

export default LoginModal;
