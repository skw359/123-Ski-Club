import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer>
      <div className="container">
        <div className="footer-content" style={{ justifyContent: 'center', gap: '4rem', maxWidth: '800px', margin: '0 auto' }}>
          <div className="footer-column">
            <h3>About 123 I Like To Ski</h3>
            <p>We are one of the largest student organizations at the University of Maryland, dedicated to
              bringing affordable ski and snowboard trips to students.</p>
          </div>

          <div className="footer-column">
            <h3>Connect With Us</h3>
            <ul>
              <li><a href="https://terplink.umd.edu/organization/skiclub" target="_blank" rel="noopener noreferrer">TerpLink</a></li>
              <li><a href="https://www.instagram.com/123iliketoski?igshid=OGQ5ZDc2ODk2ZA%3D%3D" target="_blank" rel="noopener noreferrer">Instagram</a></li>
              <li><a href="https://groupme.com/join_group/90500359/FTrk1lQp" target="_blank" rel="noopener noreferrer">GroupMe</a></li>
              <li><a href="mailto:umdskiclub@gmail.com">Email</a></li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; 2026 123 I Like To Ski. All rights reserved.</p>
          <div className="footer-credit">
            Made by a student, for students • <a href="https://linkedin.com/in/masondoan" target="_blank" rel="noopener noreferrer">Mason Doan</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;