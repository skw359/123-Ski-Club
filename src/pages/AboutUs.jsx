import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import LoginModal from '../components/LoginModal';
import { apiUrl } from '../config/api';

const AboutUs = () => {
  const [showLogin, setShowLogin] = useState(false);
  const [content, setContent] = useState({});

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const res = await fetch(apiUrl('/api/page-content'), { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const map = {};
          data.forEach(item => { map[item.content_key] = item.content_value; });
          setContent(map);
        }
      } catch (e) {
        // silently fail — use hardcoded defaults
      }
    };
    fetchContent();
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar onLoginClick={() => setShowLogin(true)} />

      {/* Page Header */}
      <div className="page-header">
        <div className="container">
          <h2>About Us</h2>
          <p>123 I Like To Ski: UMD's Premier Snow Sports Community</p>
        </div>
      </div>

      {/* Main Content */}
      <section className="content-section">
        <div className="container">
          <div className="about-grid">
            <div className="text-content">
              <h3>{content.about_section_1_title || 'Who We Are'}</h3>
              <p>{content.about_section_1_body || 'Founded in 2022, we are the largest student organization at the University of Maryland dedicated to bringing affordable and fun skiing and snowboarding experiences to students.'}</p>

              <h3>{content.about_section_2_title || 'Our Mission'}</h3>
              <p>{content.about_section_2_body || 'We foster a vibrant community of snow sports enthusiasts by providing accessible trips for all skill levels. Whether you are a seasoned pro or have never seen snow before, there is a spot for you on the mountain.'}</p>

              <h3>{content.about_section_3_title || 'Join The Club'}</h3>
              <p>{content.about_section_3_body || 'We organize over 7 trips every season to resorts across the region. Members get access to exclusive group rates, transportation, and social events.'}</p>
            </div>
            <div className="image-content">
              <img src={content.about_image || '/assets/IMG_7121.JPG'} alt="Club members on the mountain" onError={(e) => {e.target.src='https://placehold.co/600x400/e21833/white?text=Ski+Club+Photo'}} />
            </div>
          </div>
        </div>
      </section>

      <Footer />
      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
};

export default AboutUs;
