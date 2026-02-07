import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const TripRedirect = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) {
      navigate(`/trip/${id}`, { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  }, [navigate, searchParams]);

  return null;
};

export default TripRedirect;
