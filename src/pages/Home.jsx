import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import LoginModal from '../components/LoginModal';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../config/api';

const Home = () => {
  const [showLogin, setShowLogin] = useState(false);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const [registrations, setRegistrations] = useState([]);
  const [showMyTrips, setShowMyTrips] = useState(false);
  const [announcement, setAnnouncement] = useState(null);
  const [message, setMessage] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [checkInModal, setCheckInModal] = useState(null);
  const [processingCheckIn, setProcessingCheckIn] = useState(false);
  const [modalClosing, setModalClosing] = useState(false);

  useEffect(() => {
    fetchTrips();
    fetchAnnouncement();

    const checkinToken = searchParams.get('checkin');
    if (checkinToken) {
      handleCheckInToken(checkinToken);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchRegistrations();
    }
  }, [user]);

  const fetchTrips = async () => {
    try {
      setLoading(true);
      const res = await fetch(apiUrl('/api/trips'), {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setTrips(data);
      } else {
        showMessage('Failed to load trips. Please refresh the page.', 'error');
      }
    } catch (e) {
      console.error('Failed to load trips:', e);
      showMessage('Failed to load trips. Please refresh the page.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchRegistrations = async () => {
    try {
      const res = await fetch(apiUrl('/api/my-registrations'), {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setRegistrations(data);
      }
    } catch (e) {
      console.error('Failed to check registrations:', e);
    }
  };

  const fetchAnnouncement = async () => {
    try {
      const dismissedId = localStorage.getItem('dismissedAnnouncementId');
      const res = await fetch(apiUrl('/api/announcements/active'), {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.id !== parseInt(dismissedId)) {
          setAnnouncement(data);
        }
      }
    } catch (e) {
      console.error('Failed to load announcement:', e);
    }
  };

  const showMessage = (text, type = 'error') => {
    setMessage({ text, type });
    setTimeout(() => {
      setMessage(null);
    }, 5000);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    });
  };

  const formatDateShort = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    });
  };

  const formatTimeRemaining = (minutes) => {
    if (!minutes) return '24h';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) {
      return `${mins}m`;
    }
    return mins > 0 ? `${hours}h, ${mins}m` : `${hours}h`;
  };

  const dismissAnnouncement = () => {
    if (announcement) {
      localStorage.setItem('dismissedAnnouncementId', announcement.id);
      setAnnouncement(null);
    }
  };

  const handleCheckInToken = async (token) => {
    try {
      const res = await fetch(apiUrl(`/api/trip-checkin/info/${token}`), {
        credentials: 'include'
      });

      if (res.ok) {
        const data = await res.json();

        if (data.checked_in) {
          showMessage('You have already checked in for this trip!', 'success');
          setSearchParams({});
          return;
        }

        if (data.check_in_window.status === 'not_yet_open') {
          const openDate = new Date(data.check_in_window.start).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
          });
          showMessage(`Check-in window opens on ${openDate} at 12:00 AM`, 'error');
          setSearchParams({});
          return;
        }

        if (data.check_in_window.status === 'closed') {
          showMessage('Check-in window has closed', 'error');
          setSearchParams({});
          return;
        }

        setCheckInModal({
          token,
          tripName: data.trip_name,
          destination: data.destination,
          tripDate: data.trip_date,
          firstName: data.first_name
        });

      } else {
        const error = await res.json();
        showMessage(error.error || 'Invalid check-in link', 'error');
        setSearchParams({});
      }
    } catch (error) {
      console.error('Error loading check-in:', error);
      showMessage('Failed to load check-in information', 'error');
      setSearchParams({});
    }
  };

  const handleBannerClick = async () => {
    if (!firstCheckInNeeded || !firstCheckInNeeded.trip_checkin_token) {
      setShowMyTrips(true);
      return;
    }

    await handleCheckInToken(firstCheckInNeeded.trip_checkin_token);
  };

  const closeCheckInModal = () => {
    if (modalClosing) return;
    setModalClosing(true);
    setTimeout(() => {
      setCheckInModal(null);
      setModalClosing(false);
      setTimeout(() => setSearchParams({}), 50);
    }, 200);
  };

  const handleTripCheckInConfirm = async () => {
    if (!checkInModal) return;

    setProcessingCheckIn(true);
    try {
      const res = await fetch(apiUrl(`/api/trip-checkin/confirm/${checkInModal.token}`), {
        method: 'POST',
        credentials: 'include'
      });

      const result = await res.json();

      if (res.ok) {
        showMessage(result.message, 'success');
        closeCheckInModal();
        if (user) {
          fetchRegistrations();
        }
      } else {
        showMessage(result.error || 'Failed to confirm check-in', 'error');
      }
    } catch (error) {
      console.error('Error confirming check-in:', error);
      showMessage('Network error. Please try again.', 'error');
    } finally {
      setProcessingCheckIn(false);
    }
  };

  const handleTripCheckInDecline = async () => {
    if (!checkInModal) return;

    if (!window.confirm('Are you sure you want to decline? Your spot will be released and you will be moved to the waitlist.')) {
      return;
    }

    setProcessingCheckIn(true);
    try {
      const res = await fetch(apiUrl(`/api/trip-checkin/decline/${checkInModal.token}`), {
        method: 'POST',
        credentials: 'include'
      });

      const result = await res.json();

      if (res.ok) {
        showMessage(result.message, 'error');
        closeCheckInModal();
        if (user) {
          fetchRegistrations();
        }
      } else {
        showMessage(result.error || 'Failed to decline check-in', 'error');
      }
    } catch (error) {
      console.error('Error declining check-in:', error);
      showMessage('Network error. Please try again.', 'error');
    } finally {
      setProcessingCheckIn(false);
    }
  };

  const checkInToTrip = async (tripId, tripName) => {
    if (!window.confirm(`Check in for ${tripName}?\n\nAre you still able to attend this trip?`)) {
      if (window.confirm(`Do you want to cancel your registration for ${tripName}?\n\nThis cannot be undone.`)) {
        await processCheckIn(tripId, false);
      }
      return;
    }

    await processCheckIn(tripId, true);
  };

  const processCheckIn = async (tripId, confirmed) => {
    try {
      const response = await fetch(apiUrl(`/api/trips/${tripId}/check-in`), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ confirmed })
      });

      const result = await response.json();

      if (response.ok) {
        showMessage(result.message, 'success');
        setShowMyTrips(false);
        await fetchRegistrations();
        await fetchTrips();
      } else {
        showMessage(result.error || 'Failed to process check-in', 'error');
      }
    } catch (error) {
      showMessage('Network error. Please try again.', 'error');
    }
  };

  const checkInNeeded = registrations.filter(r => r.needs_check_in);

  const firstCheckInNeeded = checkInNeeded.length > 0 ? checkInNeeded[0] : null;

  const now = new Date();

  const upcomingTrips = trips.filter(trip => {
    const tripTime = new Date(trip.departure_time || trip.trip_date);
    return tripTime >= now;
  });

  const pastTrips = trips.filter(trip => {
    const tripTime = new Date(trip.departure_time || trip.trip_date);
    return tripTime < now;
  });

  const renderTripCard = (trip) => {
    const isFull = trip.spots_remaining <= 0;
    const capacityPercentage = (trip.registered_count / trip.capacity) * 100;

    const tripTime = new Date(trip.departure_time || trip.trip_date);
    const isPast = tripTime < new Date();

    const currentTime = new Date();
    const registrationOpensAt = trip.registration_opens_at ? new Date(trip.registration_opens_at) : null;
    const isRegistrationOpen = !registrationOpensAt || currentTime >= registrationOpensAt;

    console.log('Trip:', trip.name, {
      registration_opens_at: trip.registration_opens_at,
      registrationOpensAt: registrationOpensAt,
      currentTime: currentTime,
      isRegistrationOpen: isRegistrationOpen,
      isPast: isPast
    });

    let capacityClass = '';
    let statusClass = '';
    let statusText = '';

    if (isPast) {
      statusClass = 'status-full';
      statusText = 'Trip Completed';
    }
    else if (registrationOpensAt && currentTime < registrationOpensAt) {
      statusClass = 'status-full';
      statusText = `Opens ${formatDateShort(trip.registration_opens_at)}`;
    }
    else if (isFull) {
      capacityClass = 'full';
      statusClass = 'status-full';
      statusText = 'Trip Full';
    }
    else if (capacityPercentage >= 90) {
      capacityClass = 'almost-full';
      statusClass = 'status-open';
      statusText = 'Registration Open';
    }
    else {
      statusClass = 'status-open';
      statusText = 'Registration Open';
    }

    return (
      <div
        key={trip.id}
        className="trip-card"
        onClick={() => window.location.href = `/trip?id=${trip.id}`}
      >
        <div
          className="trip-image"
          style={{
            backgroundImage: `url('${trip.image_url || 'https://picsum.photos/400/200?grayscale'}')`
          }}
        >
          <div className={`trip-status ${statusClass}`}>{statusText}</div>
        </div>
        <div className="trip-details">
          <div className="trip-date">{formatDate(trip.trip_date)}</div>
          <h3 className="trip-location">{trip.name}</h3>
          <p>{trip.description || 'Join us for this exciting trip!'}</p>
          <div className="trip-capacity">
            <span>{trip.registered_count}/{trip.capacity}</span>
            <div className="capacity-bar">
              <div
                className={`capacity-fill ${capacityClass}`}
                style={{ width: `${capacityPercentage}%` }}
              ></div>
            </div>
            <span>Spots</span>
          </div>
          <div className="trip-actions">
            <a
              href={`/trip?id=${trip.id}`}
              className="btn btn-sm"
              style={{ width: '100%', textAlign: 'center' }}
            >
              {isPast ? 'View Details' : 'More Info'}
            </a>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar onLoginClick={() => setShowLogin(true)} />

      {message && (
        <div className="container">
          <div className={`message ${message.type}`}>{message.text}</div>
        </div>
      )}

      {checkInNeeded.length > 0 && firstCheckInNeeded && (
        <div
          className="check-in-banner"
          onClick={handleBannerClick}
          style={{ cursor: 'pointer' }}
        >
          <div className="container">
            <div className="banner-content">
              <span className="banner-icon"></span>
              <span className="banner-text">
                {checkInNeeded.length === 1
                  ? `Check-in required for ${firstCheckInNeeded.name}! You have ${formatTimeRemaining(firstCheckInNeeded.check_in_minutes_remaining)} remaining.`
                  : `You need to check in for ${checkInNeeded.length} trips! Click to check in.`}
              </span>
              <button
                className="btn btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleBannerClick();
                }}
              >
                Check In Now
              </button>
            </div>
          </div>
        </div>
      )}

      {announcement && (
        <div className="announcement-banner">
          <div className="container">
            <div className="banner-content">
              <span className="banner-icon"></span>
              <span className="banner-text">{announcement.message}</span>
              <button
                className="btn-close-announcement"
                onClick={dismissAnnouncement}
                aria-label="Close announcement"
              >
                &times;
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="hero">
        <h2>Welcome to UMD's Premier Ski & Snowboard Club</h2>
        <p>Join us for exciting trips, events, and an awesome community of snow enthusiasts! </p>
      </section>

      <section className="container">
        <div className="section-heading">
          <h2>Upcoming Trips</h2>
        </div>

        <div id="tripsContainer">
          {loading ? (
            <div id="loadingMessage" className="text-center">Loading trips...</div>
          ) : upcomingTrips.length === 0 ? (
            <div className="text-center">No upcoming trips available at the moment.</div>
          ) : (
            <div className="trips-grid">
              {upcomingTrips.map(renderTripCard)}
            </div>
          )}
        </div>
      </section>

      {pastTrips.length > 0 && (
        <section className="container" style={{ marginTop: '2rem', opacity: 0.8 }}>
          <div className="section-heading">
            <h2>Past Trips</h2>
          </div>
          <div className="trips-grid">
            {pastTrips.map(renderTripCard)}
          </div>
        </section>
      )}

      <Footer />

      {showMyTrips && (
        <div
          className="modal-overlay active"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowMyTrips(false);
            }
          }}
        >
          <div className="modal">
            <button className="modal-close" onClick={() => setShowMyTrips(false)}>
              &times;
            </button>
            <h2 className="modal-title">My Upcoming Trips</h2>
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {registrations.length === 0 ? (
                <p>You have no upcoming trip registrations.</p>
              ) : (
                registrations.map(reg => {
                  const tripDate = formatDate(reg.trip_date);
                  let statusHTML;

                  if (reg.moved_to_waitlist) {
                    statusHTML = (
                      <span style={{ color: '#856404', backgroundColor: '#fff3cd', padding: '4px 10px', borderRadius: '4px', fontWeight: '600', fontSize: '13px' }}>
                        {reg.waitlist_position ? `Waitlist #${reg.waitlist_position}` : 'On Waitlist'}
                      </span>
                    );
                  } else if (reg.checked_in) {
                    statusHTML = <span style={{ color: 'var(--success)' }}>Checked In</span>;
                  } else if (reg.needs_check_in) {
                    statusHTML = (
                      <button
                        className="btn"
                        onClick={() => checkInToTrip(reg.trip_id, reg.name)}
                        style={{ backgroundColor: 'var(--success)' }}
                      >
                        ✓ Check In Now
                      </button>
                    );
                  } else if (reg.missed_check_in) {
                    statusHTML = <span style={{ color: 'var(--danger)' }}>Missed Check-in</span>;
                  } else {
                    statusHTML = <span style={{ color: 'var(--info)' }}>{reg.days_until_trip} days until trip</span>;
                  }

                  return (
                    <div
                      key={reg.trip_id}
                      style={{
                        padding: '20px',
                        margin: '10px 0',
                        background: '#f8f9fa',
                        borderRadius: '8px'
                      }}
                    >
                      <h3>{reg.name}</h3>
                      <p>{tripDate} • {reg.destination}</p>
                      <div style={{ marginTop: '10px' }}>{statusHTML}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {checkInModal && (
        <div
          className="modal-overlay active"
          style={{ zIndex: 10000, animation: modalClosing ? 'fadeOut 0.2s ease-in-out' : 'fadeIn 0.2s ease-in-out' }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !processingCheckIn) {
              closeCheckInModal();
            }
          }}
        >
          <div className="modal" style={{ maxWidth: '450px', animation: modalClosing ? 'fadeOut 0.2s ease-in-out' : 'fadeIn 0.2s ease-in-out' }}>
            <button
              className="modal-close"
              onClick={() => {
                if (!processingCheckIn) {
                  closeCheckInModal();
                }
              }}
              disabled={processingCheckIn}
            >
              &times;
            </button>
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <h2 className="modal-title" style={{ marginBottom: '30px', color: '#333', fontSize: '18px' }}>
                Check-In Required for 1 Trip
              </h2>
              <h3 style={{ fontSize: '20px', color: '#333', marginBottom: '10px', fontWeight: '600' }}>
                {checkInModal.tripName}
              </h3>
              <p style={{ fontSize: '16px', color: '#666', marginBottom: '30px' }}>
                {new Date(checkInModal.tripDate).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
              <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
                <button
                  className="btn"
                  onClick={handleTripCheckInConfirm}
                  disabled={processingCheckIn}
                  style={{
                    backgroundColor: '#28a745',
                    flex: 1,
                    maxWidth: '150px',
                    padding: '12px 24px',
                    fontSize: '16px',
                    fontWeight: '600',
                    opacity: processingCheckIn ? 0.6 : 1
                  }}
                >
                  {processingCheckIn ? 'Processing...' : 'Going'}
                </button>
                <button
                  className="btn"
                  onClick={handleTripCheckInDecline}
                  disabled={processingCheckIn}
                  style={{
                    backgroundColor: '#dc3545',
                    flex: 1,
                    maxWidth: '150px',
                    padding: '12px 24px',
                    fontSize: '16px',
                    fontWeight: '600',
                    opacity: processingCheckIn ? 0.6 : 1
                  }}
                >
                  {processingCheckIn ? 'Processing...' : 'Not Going'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
};

export default Home;
