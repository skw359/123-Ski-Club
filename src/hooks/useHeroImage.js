import { useState, useEffect } from 'react';
import { apiUrl } from '../config/api';

const CACHE_KEY = 'hero_image_url';
const DEFAULT_HERO_IMAGE = '/assets/background.jpg';

const buildStyle = (url) => ({
  backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)), url('${url}')`
});

const useHeroImage = () => {
  const [heroImageStyle, setHeroImageStyle] = useState(() => {
    const cached = localStorage.getItem(CACHE_KEY);
    return buildStyle(cached || DEFAULT_HERO_IMAGE);
  });

  useEffect(() => {
    const fetchImage = async () => {
      try {
        const res = await fetch(apiUrl('/api/page-content'), { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const item = data.find(d => d.content_key === 'home_hero_image');
          const url = item?.content_value || DEFAULT_HERO_IMAGE;
          localStorage.setItem(CACHE_KEY, url);
          setHeroImageStyle(buildStyle(url));
        }
      } catch (e) {}
    };
    fetchImage();
  }, []);

  return heroImageStyle;
};

export default useHeroImage;
