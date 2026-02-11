import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Navbar = ({ onLoginClick, customLogo, transparent = true }) => {
  const { user, logout } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!transparent) return;
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [transparent]);

  const headerClass = [
    transparent ? 'header--fixed' : '',
    transparent && !scrolled ? 'header--transparent' : '',
  ].filter(Boolean).join(' ');

  return (
    <header className={headerClass}>
      <div className="container header-container">
        <Link to="/" className="logo">
          <img src={customLogo || '/assets/umdM.png'} alt="UMD Ski Club Logo" />
          <h1>123 Ski Club</h1>
        </Link>

        <nav>
          <ul>
            <li><Link to="/about">About Us</Link></li>
            <li><Link to="/faqs">FAQs</Link></li>
            <li><Link to="/information">Information</Link></li>
          </ul>
        </nav>

        <div className="user-actions">
          {!user ? (
            <>
              <div className="user-info">Not signed in</div>
              <button onClick={onLoginClick} className="btn">Login with UMD</button>
            </>
          ) : (
            <div className="user-profile" onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
              <img 
                src="https://imgs.search.brave.com/4xfFa4ySbM-DxrMYeYbk3psFZSpUIOo72IHxyomrAiY/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9jZG4u/dmVjdG9yc3RvY2su/Y29tL2kvNTAwcC80/MS84OC9hdmF0YXIt/ZGVmYXVsdC11c2Vy/LXByb2ZpbGUtZmxh/dC1pY29uLXNvY2lh/bC12ZWN0b3ItNTcy/MzQxODguanBn"
                alt="Profile" 
              />
              <div>
                <div className="user-name">{user.first_name || user.email.split('@')[0]}</div>
                <div className="user-role">{user.role === 'admin' ? 'Admin' : 'Member'}</div>
              </div>
              
              <div className={`dropdown ${isDropdownOpen ? 'active' : ''}`}>
                {user.role === 'admin' && (
                  <>
                    <Link to="/admin">Admin</Link>
                  </>
                )}
                <button onClick={logout}>Logout</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;