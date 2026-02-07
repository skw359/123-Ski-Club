import React, { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import LoginModal from '../components/LoginModal';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../config/api';

const Trip = () => {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [showQuickRegister, setShowQuickRegister] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState(null);
  const [strikeCount, setStrikeCount] = useState(0);
  const [isPromoted, setIsPromoted] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showPromotionModal, setShowPromotionModal] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });
  const [formData, setFormData] = useState({
    equipment_rental: 'none',
    helmet_rental: false,
    skill_level: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    notes: '',
    terms: false,
    custom_answers: {}
  });
  const [customQuestions, setCustomQuestions] = useState([]);
  const [message, setMessage] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [checkInModal, setCheckInModal] = useState(null);
  const [processingCheckIn, setProcessingCheckIn] = useState(false);
  const [modalClosing, setModalClosing] = useState(false);

  useEffect(() => {
    fetchTrip();
    fetchCustomQuestions();

    // Check for check-in token in URL
    const checkinToken = searchParams.get('checkin');
    if (checkinToken) {
      handleCheckInToken(checkinToken);
    }
  }, [id]);

  // Auto-trigger check-in modal if user needs to check in for this trip
  useEffect(() => {
    if (registrationStatus && !authLoading && user) {
      checkAndAutoTriggerCheckIn();
    }
  }, [registrationStatus, authLoading, user]);

  const checkAndAutoTriggerCheckIn = async () => {
    // Only auto-trigger if:
    // 1. User is logged in
    // 2. Has a registration for this trip
    // 3. Has a check-in token
    // 4. Not on waitlist
    // 5. Not already checked in
    // 6. Not promoted from waitlist
    // 7. Modal is not already open
    if (!registrationStatus || checkInModal) return;

    try {
      const res = await fetch(apiUrl('/api/my-registrations'), {
        credentials: 'include'
      });

      if (res.ok) {
        const regs = await res.json();
        const myReg = regs.find(r => String(r.trip_id) === String(id));

        if (myReg && myReg.needs_check_in && myReg.trip_checkin_token && !myReg.promoted_from_waitlist_at) {
          // Auto-trigger the check-in modal
          await handleCheckInToken(myReg.trip_checkin_token);
        }
      }
    } catch (error) {
      console.error('Error checking for auto check-in:', error);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
        checkRegistration();
        checkUserStrikes();
    }
  }, [id, user, authLoading]);

  const fetchTrip = async () => {
    try {
      const res = await fetch(apiUrl(`/api/trips/${id}`), {
        credentials: 'include'
      });
      if (res.ok) setTrip(await res.json());
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const checkUserStrikes = async () => {
      try {
          const res = await fetch(apiUrl('/api/my-registrations'), { credentials: 'include' });
          if (res.ok) {
              const regs = await res.json();
              if (regs.length > 0) {
                  setStrikeCount(regs[0].strike_count || 0);
              }
          }
      } catch (e) { console.error(e); }
  };

  const checkRegistration = async () => {
    try {
      const res = await fetch(apiUrl(`/api/my-registrations?t=${Date.now()}`), {
        credentials: 'include',
        headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
      });
      if (res.ok) {
        const regs = await res.json();
        const myReg = regs.find(r => String(r.trip_id) === String(id));
        setRegistrationStatus(myReg || null);

        if (myReg && myReg.promotion_expires_at && !myReg.checked_in) {
            const deadline = new Date(myReg.promotion_expires_at);
            if (new Date() < deadline) {
                setIsPromoted(true);
            }
        }
      }
    } catch (e) { console.error(e); }
  };

  const fetchCustomQuestions = async () => {
      try {
          const res = await fetch(apiUrl(`/api/trips/${id}/questions`), {
            credentials: 'include'
          });
          if(res.ok) setCustomQuestions(await res.json());
      } catch(e) {}
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

  const closeCheckInModal = () => {
    if (modalClosing) return; // Prevent double-close
    setModalClosing(true);
    setTimeout(() => {
      setCheckInModal(null);
      setModalClosing(false);
      // Clear search params after a brief delay to prevent flash
      setTimeout(() => setSearchParams({}), 50);
    }, 200);
  };

  const handleCheckInToken = async (token) => {
    try {
      const res = await fetch(apiUrl(`/api/trip-checkin/info/${token}`), {
        credentials: 'include'
      });

      if (res.ok) {
        const data = await res.json();

        // Check if already checked in
        if (data.checked_in) {
          setMessage({ type: 'success', text: 'You have already checked in for this trip!' });
          setSearchParams({});
          return;
        }

        // Check window status
        if (data.check_in_window.status === 'not_yet_open') {
          const openDate = new Date(data.check_in_window.start).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
          });
          setMessage({ type: 'error', text: `Check-in window opens on ${openDate} at 12:00 AM` });
          setSearchParams({});
          return;
        }

        if (data.check_in_window.status === 'closed') {
          setMessage({ type: 'error', text: 'Check-in window has closed' });
          setSearchParams({});
          return;
        }

        // Show check-in modal
        setCheckInModal({
          token,
          tripName: data.trip_name,
          destination: data.destination,
          tripDate: data.trip_date,
          firstName: data.first_name
        });

      } else {
        const error = await res.json();
        setMessage({ type: 'error', text: error.error || 'Invalid check-in link' });
        setSearchParams({});
      }
    } catch (error) {
      console.error('Error loading check-in:', error);
      setMessage({ type: 'error', text: 'Failed to load check-in information' });
      setSearchParams({});
    }
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
        setMessage({ type: 'success', text: result.message });
        closeCheckInModal();
        if (user) {
          checkRegistration();
        }
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to confirm check-in' });
      }
    } catch (error) {
      console.error('Error confirming check-in:', error);
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
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
        setMessage({ type: 'error', text: result.message });
        closeCheckInModal();
        if (user) {
          checkRegistration();
        }
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to decline check-in' });
      }
    } catch (error) {
      console.error('Error declining check-in:', error);
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setProcessingCheckIn(false);
    }
  };

  const handleInitialRegisterClick = () => {
      if (!user) {
          setShowLogin(true);
          return;
      }

      // Check if promoted first
      if (isPromoted) {
          confirmWaitlistPromotion();
          return;
      }

      // Logic to decide which modal to show
      // If trip requires questions or has custom questions -> Full Modal
      // Else -> Quick Modal
      if (trip.ask_default_questions || (customQuestions && customQuestions.length > 0)) {
          setShowRegister(true);
      } else {
          setShowQuickRegister(true);
      }
  };

  const handleQuickRegister = async () => {
      try {
        const res = await fetch(apiUrl(`/api/trips/${id}/register`), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}) 
        });
        const data = await res.json();
        if (res.ok) {
            setMessage({ type: 'success', text: data.status === 'waitlist' ? data.message : "You're in!" });
            setShowQuickRegister(false);
            fetchTrip();
            checkRegistration();
        } else {
            setMessage({ type: 'error', text: data.error || 'Registration failed' });
        }
      } catch (e) {
          setMessage({ type: 'error', text: 'Network error' });
      }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        equipment_rental: formData.equipment_rental,
        helmet_rental: formData.helmet_rental,
        skill_level: formData.skill_level,
        emergency_contact_name: formData.emergency_contact_name,
        emergency_contact_phone: formData.emergency_contact_phone,
        special_requests: formData.notes,
        terms_agreed: formData.terms,
        custom_answers: formData.custom_answers
      };
      
      const res = await fetch(apiUrl(`/api/trips/${id}/register`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.status === 'waitlist' ? data.message : "You have been successfully registered!" });
        setShowRegister(false);
        fetchTrip();
        checkRegistration();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed' });
      }
    } catch (e) { setMessage({ type: 'error', text: 'Error' }); }
  };

  const confirmWaitlistPromotion = () => {
    setShowPromotionModal(true);
  };

  const handleConfirmPromotion = async () => {
    setShowPromotionModal(false);
    try {
        const res = await fetch(apiUrl(`/api/trips/${id}/confirm-promotion`), {
            method: 'POST',
            credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            setAlertModal({ show: true, title: 'Success!', message: 'Spot confirmed! You are officially registered.', type: 'success' });
            setTimeout(() => window.location.reload(), 2000);
        } else {
            setAlertModal({ show: true, title: 'Error', message: data.error || 'Failed to confirm spot.', type: 'error' });
        }
    } catch (e) {
        setAlertModal({ show: true, title: 'Error', message: 'Network error: ' + e.message, type: 'error' });
    }
  };

  const handleDeclinePromotion = () => {
    setShowPromotionModal(false);
    setShowDeclineModal(true);
  };

  const handleConfirmDecline = async () => {
    setShowDeclineModal(false);
    await handleCancel(true);
  };

  const handleCancel = async (skipConfirm = false) => {
      if (!skipConfirm) {
          setShowCancelModal(true);
          return;
      }

      try {
          const res = await fetch(apiUrl(`/api/registrations/${registrationStatus.id}`), {
            method: 'DELETE',
            credentials: 'include'
          });
          if (res.ok) {
              setAlertModal({ show: true, title: 'Cancelled', message: 'Registration cancelled successfully.', type: 'success' });
              setTimeout(() => window.location.reload(), 2000);
          } else {
              const data = await res.json();
              setAlertModal({ show: true, title: 'Error', message: data.error || 'Failed to cancel.', type: 'error' });
          }
      } catch (e) {
          setAlertModal({ show: true, title: 'Error', message: 'Network error.', type: 'error' });
      }
  };

  const handleConfirmCancel = () => {
      setShowCancelModal(false);
      handleCancel(true);
  };

  if (loading) return <div className="text-center mt-10">Loading...</div>;
  if (!trip) return <div className="text-center mt-10">Trip not found</div>;

  const isFull = trip.registered_count >= trip.capacity;

  // Check if trip is in the past (use departure_time if available, otherwise trip_date)
  const tripTime = new Date(trip.departure_time || trip.trip_date);
  const isPast = tripTime < new Date();

  // Check if registration is open
  const registrationOpensAt = trip.registration_opens_at ? new Date(trip.registration_opens_at) : null;
  let effectiveOpenTime = registrationOpensAt;

  // If user has strikes, add 24hr delay
  if (effectiveOpenTime && strikeCount === 1) {
    effectiveOpenTime = new Date(effectiveOpenTime.getTime() + 24 * 60 * 60 * 1000);
  }

  const isRegistrationOpen = !effectiveOpenTime || new Date() >= effectiveOpenTime;
  
  // Calculate Ring
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const percent = Math.min(trip.registered_count / trip.capacity, 1);
  const offset = circumference - (percent * circumference);

  return (
    <div style={{minHeight: '100vh', display: 'flex', flexDirection: 'column'}}>
      <Navbar onLoginClick={() => setShowLogin(true)} />
      
      <section className="trip-header" style={{backgroundImage: `url('${trip.image_url || 'https://picsum.photos/1200/400?grayscale'}')`, position: 'relative'}}>
        <Link to="/" className="back-button" style={{position: 'absolute', top: '20px', left: '20px', zIndex: 10}}>← Back to Trips</Link>
        <div className="container trip-header-content">
          <h1 style={{fontSize: '48px', marginBottom: '10px'}}>{trip.name}</h1>
          <div className="trip-date">{new Date(trip.trip_date).toLocaleDateString('en-US', {weekday:'long', year:'numeric', month:'long', day:'numeric', timeZone: 'UTC'})}</div>
          <div className={`status-badge ${isPast ? 'status-full' : (!isRegistrationOpen ? 'status-full' : (isFull ? 'status-full' : 'status-open'))}`} style={{padding: '8px 15px', borderRadius: '5px', fontWeight: '600', display: 'inline-block'}}>
             {isPast ? 'Trip Concluded' : (!isRegistrationOpen ? `Opens ${registrationOpensAt.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}` : (isFull ? 'Waitlist Open' : 'Registration Open'))}
          </div>
        </div>
      </section>

      <div className="container trip-details-grid">
         <div className="trip-info">
             <h2 style={{borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '15px'}}>About the Trip</h2>
             <p style={{whiteSpace: 'pre-wrap', marginBottom: '20px'}}>{trip.description}</p>
             
             <div className="info-grid">
                 <div className="info-item">
                    <h4>Location</h4>
                    <p>{trip.destination}</p>
                 </div>
                 <div className="info-item">
                    <h4>Date</h4>
                    <p>{new Date(trip.trip_date).toLocaleDateString('en-US', {weekday:'long', year:'numeric', month:'long', day:'numeric', timeZone: 'UTC'})}</p>
                 </div>
                 <div className="info-item">
                    <h4>Departure</h4>
                    <p>
                        {trip.departure_time && new Date(trip.departure_time).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                        })}
                        {trip.departure_time && trip.departure_info && ' from '}
                        {trip.departure_info}
                    </p>
                 </div>
                 <div className="info-item">
                    <h4>Return</h4>
                    <p>{trip.return_info}</p>
                 </div>
             </div>
         </div>

         <div className="trip-sidebar">
             <h3 className="text-center mb-4" style={{marginBottom: '20px'}}>Trip Registration</h3>
             
             <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px'}}>
                <div style={{position: 'relative', width: '180px', height: '180px'}}>
                   <svg style={{transform: 'rotate(-90deg)', width: '100%', height: '100%'}} viewBox="0 0 180 180">
                      <circle cx="90" cy="90" r="80" fill="none" stroke="#e6e6e6" strokeWidth="12" />
                      <circle cx="90" cy="90" r="80" fill="none" stroke={isFull ? 'var(--danger)' : 'var(--success)'} strokeWidth="12" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" style={{transition: 'stroke-dashoffset 1s'}} />
                   </svg>
                   <div style={{position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center'}}>
                      <div style={{fontSize: '38px', fontWeight: '800'}}>{Math.min(trip.registered_count, trip.capacity)}/{trip.capacity}</div>
                      <div style={{fontSize: '13px', fontWeight: '600', color: 'var(--medium)'}}>FILLED</div>
                   </div>
                </div>
                <p className="text-center mt-2" style={{color: isFull ? 'var(--warning)' : 'var(--medium)', marginTop: '10px', fontWeight: isFull ? '600' : '400'}}>
                    {trip.registered_count > trip.capacity 
                        ? `${trip.registered_count - trip.capacity} people on the waitlist`
                        : trip.registered_count === trip.capacity
                            ? "Trip is full. Join the waitlist queue."
                            : `${trip.capacity - trip.registered_count} spots remaining`
                    }
                </p>
             </div>

             {/* Strike Warning */}
             {strikeCount > 0 && (
                 <div className="sidebar-notice" style={{backgroundColor: 'rgba(220, 53, 69, 0.1)', borderLeft: '4px solid var(--danger)', marginBottom: '15px'}}>
                     <p style={{color: 'var(--danger)', fontWeight: '600'}}>
                         {strikeCount === 1 ? '⚠️ Warning: You have 1 strike. Future signups will be delayed by 24 hours.' : '🚫 You are banned from signups due to 2+ strikes. Contact an admin if you believe this is an error.'}
                     </p>
                 </div>
             )}

             {message && <div className={`message ${message.type}`} style={{marginBottom: '15px'}}>{message.text}</div>}

             {registrationStatus ? (
                 <div style={{textAlign: 'center'}}>
                    {isPromoted ? (
                        <div className="message" style={{color: 'var(--danger)', fontWeight: 'bold', marginBottom: '10px'}}>
                            Expires at {new Date(registrationStatus.promotion_expires_at).toLocaleTimeString()}!
                        </div>
                    ) : null}

                    {/* WAIVER SECTION */}
                    {registrationStatus.waiver_pdf_path && !registrationStatus.moved_to_waitlist && (
                        <div className="sidebar-notice" style={{
                            backgroundColor: 'var(--light)', 
                            border: '1px solid #ddd', 
                            padding: '20px', 
                            textAlign: 'left', 
                            boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px'
                        }}>
                            <h4 style={{fontSize: '16px', margin: 0, display: 'flex', alignItems: 'center', color: 'var(--primary)', fontWeight: '700'}}>
                                <i className="fas fa-file-contract" style={{marginRight: '10px', fontSize: '20px'}}></i> 
                                Required Waiver
                            </h4>
                            
                            <p style={{fontSize: '13px', color: '#666', margin: 0}}>
                                Please download, sign, and upload the waiver to complete your registration.
                            </p>

                            <a href={`/public_uploads/${registrationStatus.waiver_pdf_path}`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{
                                width: '100%', 
                                backgroundColor: '#f8f9fa', 
                                border: '1px solid #ccc', 
                                color: '#333',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <i className="fas fa-download" style={{marginRight: '8px'}}></i> 1. Download Waiver
                            </a>

                            <div style={{position: 'relative', overflow: 'hidden'}}>
                                <button className="btn" style={{width: '100%', pointerEvents: 'none'}}>
                                    <i className="fas fa-upload" style={{marginRight: '8px'}}></i> 2. Upload Signed PDF
                                </button>
                                <input 
                                    type="file" 
                                    accept=".pdf" 
                                    onChange={async (e) => {
                                        if(e.target.files?.[0]) {
                                            if(e.target.files[0].size > 200 * 1024 * 1024) {
                                                setAlertModal({ show: true, title: 'File Too Large', message: 'File size exceeds 200MB limit. Please compress the PDF and try again.', type: 'error' });
                                                return;
                                            }
                                            const fd = new FormData();
                                            fd.append('waiver', e.target.files[0]);
                                            try {
                                                const res = await fetch(apiUrl(`/api/registrations/${registrationStatus.id}/waiver`), {
                                                    method: 'POST',
                                                    credentials: 'include',
                                                    body: fd
                                                });
                                                if(res.ok) {
                                                    checkRegistration();
                                                    setAlertModal({ show: true, title: 'Success!', message: 'Waiver uploaded successfully!', type: 'success' });
                                                } else {
                                                    setAlertModal({ show: true, title: 'Upload Failed', message: 'Failed to upload waiver. Please try again.', type: 'error' });
                                                }
                                            } catch(err) {
                                                setAlertModal({ show: true, title: 'Network Error', message: 'Unable to upload waiver. Check your connection and try again.', type: 'error' });
                                            }
                                        }
                                    }}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: '100%',
                                        opacity: 0,
                                        cursor: 'pointer'
                                    }}
                                />
                            </div>
                            
                            {registrationStatus.filled_waiver_pdf_path && (
                                <div style={{
                                    marginTop: '5px', 
                                    color: 'var(--success)', 
                                    fontWeight: '700', 
                                    fontSize: '13px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '8px',
                                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                                    borderRadius: '4px'
                                }}>
                                    <i className="fas fa-check-circle" style={{marginRight: '8px'}}></i> Waiver Uploaded Successfully
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* Primary Button for Registered User */}
                    {isPromoted ? (
                        <button 
                            className="btn pulse-animation" 
                            style={{backgroundColor: 'var(--success)', width: '100%', marginBottom: '10px'}}
                            onClick={confirmWaitlistPromotion}
                        >
                            SPOT OPEN! Click to Confirm
                        </button>
                    ) : registrationStatus.moved_to_waitlist ? (
                        <>
                            <div style={{
                                backgroundColor: 'var(--warning)',
                                color: 'var(--dark)',
                                padding: '15px',
                                borderRadius: '8px',
                                textAlign: 'center',
                                fontWeight: '600',
                                marginBottom: '10px'
                            }}>
                                {registrationStatus.waitlist_position ? (
                                    <>
                                        <div style={{fontSize: '36px', fontWeight: '800', marginBottom: '5px'}}>
                                            #{registrationStatus.waitlist_position}
                                        </div>
                                        <div style={{fontSize: '14px'}}>
                                            on the waitlist
                                        </div>
                                    </>
                                ) : (
                                    <div style={{fontSize: '14px'}}>
                                        You're on the waitlist
                                    </div>
                                )}
                            </div>
                            <div style={{
                                backgroundColor: '#fff9e6',
                                border: '1px solid #f4c430',
                                padding: '12px',
                                borderRadius: '5px',
                                fontSize: '13px',
                                textAlign: 'center',
                                color: '#666'
                            }}>
                                We'll email you if a spot opens up!
                            </div>
                        </>
                    ) : registrationStatus.checked_in ? (
                         <button className="btn" disabled style={{backgroundColor: 'var(--success)', width: '100%', cursor: 'default'}}>
                             Checked In
                         </button>
                    ) : registrationStatus.needs_check_in ? (
                      <button
                        className="btn"
                        style={{backgroundColor: 'var(--success)', width: '100%', marginTop: '10px'}}
                        onClick={() => registrationStatus.trip_checkin_token && handleCheckInToken(registrationStatus.trip_checkin_token)}
                      >
                        Check In Now - {formatTimeRemaining(registrationStatus.check_in_minutes_remaining)} left
                      </button>
                    ) : (
                         <button className="btn" disabled style={{backgroundColor: 'var(--medium)', width: '100%', cursor: 'default'}}>
                             You're on the trip!
                         </button>
                    )}

                    <button className="btn outline" style={{borderColor: 'var(--danger)', color: 'var(--danger)', width: '100%', marginTop: '10px'}} onClick={() => handleCancel()} disabled={isPast}>
                        {isPast ? 'Registration Closed' : 'Cancel Registration'}
                    </button>
                 </div>
             ) : isPast ? (
                 <div className="sidebar-notice" style={{textAlign: 'center', backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '5px', border: '1px solid #dee2e6'}}>
                    <h3 style={{fontSize: '1.2rem', marginBottom: '5px', color: '#6c757d'}}>Trip Concluded</h3>
                    <p style={{marginBottom: 0, color: '#6c757d'}}>Registration is closed for this trip.</p>
                 </div>
             ) : !isRegistrationOpen ? (
                 <div>
                    <button
                       className="btn"
                       disabled
                       style={{backgroundColor: '#6c757d', color: 'white', width: '100%', cursor: 'not-allowed', opacity: '0.6'}}
                    >
                       Registration Not Open
                    </button>
                    <div className="sidebar-notice" style={{marginTop: '10px', textAlign: 'center'}}>
                       <p style={{margin: 0, fontSize: '14px', color: '#666'}}>
                          {strikeCount === 1 ? (
                             <>
                                <strong>Registration opens for you on:</strong><br />
                                {effectiveOpenTime.toLocaleString('en-US', {
                                   weekday: 'short',
                                   month: 'short',
                                   day: 'numeric',
                                   year: 'numeric',
                                   hour: 'numeric',
                                   minute: '2-digit'
                                })}
                                <br />
                                <span style={{color: 'var(--warning)', fontSize: '12px'}}>
                                   (24hr delay due to strike)
                                </span>
                             </>
                          ) : (
                             <>
                                <strong>Registration opens on:</strong><br />
                                {effectiveOpenTime.toLocaleString('en-US', {
                                   weekday: 'short',
                                   month: 'short',
                                   day: 'numeric',
                                   year: 'numeric',
                                   hour: 'numeric',
                                   minute: '2-digit'
                                })}
                             </>
                          )}
                       </p>
                    </div>
                 </div>
             ) : (
                 <button
                    className="btn"
                    onClick={handleInitialRegisterClick}
                    style={{backgroundColor: isFull ? 'var(--warning)' : 'var(--primary)', color: isFull ? 'black' : 'white', width: '100%'}}
                 >
                    {isFull ? 'Join Waitlist' : 'Register for Trip'}
                 </button>
             )}

             <div className="sidebar-notice">
                <p><strong>Important:</strong> Remember to check in 2 days before the trip to confirm your spot, or you'll be moved to the waitlist.</p>
             </div>
         </div>
      </div>

      <Footer />

      {/* Full Register Modal */}
      {showRegister && (
          <div className="modal-overlay active" onClick={(e) => e.target === e.currentTarget && setShowRegister(false)}>
              <div className="modal">
                  <button className="modal-close" onClick={() => setShowRegister(false)}>&times;</button>
                  <h2 className="modal-title">{isFull ? 'Join Waitlist' : 'Register for Trip'}</h2>
                  <form onSubmit={handleRegister} className="registration-form">
                      <div className="form-group">
                          <label htmlFor="rental">Equipment Rental</label>
                          <select id="rental" value={formData.equipment_rental} onChange={e => setFormData({...formData, equipment_rental: e.target.value})}>
                              <option value="none">No Rental Needed</option>
                              <option value="ski">Ski Rental</option>
                              <option value="snowboard">Snowboard Rental</option>
                          </select>
                      </div>

                      <div className="checkbox-group">
                          <input type="checkbox" id="helmet" checked={formData.helmet_rental} onChange={e => setFormData({...formData, helmet_rental: e.target.checked})} />
                          <label htmlFor="helmet">Add Helmet Rental</label>
                      </div>

                      <div className="form-group">
                          <label htmlFor="skill">Skill Level *</label>
                          <select id="skill" required value={formData.skill_level} onChange={e => setFormData({...formData, skill_level: e.target.value})}>
                              <option value="">-- Select Your Skill Level --</option>
                              <option value="first">First Timer</option>
                              <option value="beginner">Beginner</option>
                              <option value="intermediate">Intermediate</option>
                              <option value="advanced">Advanced</option>
                              <option value="expert">Expert</option>
                          </select>
                      </div>

                      <div className="form-group">
                          <label htmlFor="emergency-contact">Emergency Contact Name *</label>
                          <input type="text" id="emergency-contact" required value={formData.emergency_contact_name} onChange={e => setFormData({...formData, emergency_contact_name: e.target.value})} />
                      </div>

                      <div className="form-group">
                          <label htmlFor="emergency-phone">Emergency Contact Phone *</label>
                          <input type="tel" id="emergency-phone" required value={formData.emergency_contact_phone} onChange={e => setFormData({...formData, emergency_contact_phone: e.target.value})} />
                      </div>

                      <div className="form-group">
                          <label htmlFor="notes">Special Requests or Notes</label>
                          <textarea id="notes" rows="3" placeholder="Any special dietary needs, accessibility requirements, or other notes..." value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})}></textarea>
                      </div>

                      {customQuestions.map(q => (
                          <div className="form-group" key={q.id}>
                              <label>{q.question_text} {q.is_required && '*'}</label>
                              {q.question_type === 'text' ? (
                                  <input
                                    required={q.is_required}
                                    onChange={e => setFormData(prev => ({...prev, custom_answers: {...prev.custom_answers, [q.id]: e.target.value}}))}
                                  />
                              ) : (
                                  <select required={q.is_required} onChange={e => setFormData(prev => ({...prev, custom_answers: {...prev.custom_answers, [q.id]: e.target.value}}))}>
                                      <option value="">Select...</option>
                                      {q.dropdown_options.map(o => <option key={o} value={o}>{o}</option>)}
                                  </select>
                              )}
                          </div>
                      ))}

                      <div className="checkbox-group">
                          <input type="checkbox" id="terms" required checked={formData.terms} onChange={e => setFormData({...formData, terms: e.target.checked})} />
                          <label htmlFor="terms">I agree to the trip policies and understand the cancellation and check-in requirements. *</label>
                      </div>

                      <button type="submit" className="btn" style={{width: '100%', marginTop: '20px'}}>{isFull ? 'Join Waitlist' : 'Complete Registration'}</button>
                  </form>
              </div>
          </div>
      )}

      {/* Quick Register Modal */}
      {showQuickRegister && (
        <div className="modal-overlay active" onClick={(e) => e.target === e.currentTarget && setShowQuickRegister(false)}>
            <div className="modal" style={{maxWidth: '450px', textAlign: 'center'}}>
                <button className="modal-close" onClick={() => setShowQuickRegister(false)}>&times;</button>
                <h2 className="modal-title">{isFull ? 'Join Waitlist' : 'Confirm Registration'}</h2>
                
                <p style={{marginBottom: '30px', fontSize: '16px'}}>
                    Are you sure you want to {isFull ? 'join the waitlist' : 'register'} for <br />
                    <span style={{color: 'var(--primary)', fontWeight: '700', fontSize: '18px'}}>{trip.name}</span>?
                </p>

                <div style={{display: 'flex', justifyContent: 'center', gap: '15px'}}>
                    <button className="btn" style={{width: '120px', backgroundColor: 'white', border: '1px solid #ccc', color: '#333'}} onClick={() => setShowQuickRegister(false)}>Cancel</button>
                    <button className="btn" style={{width: '150px'}} onClick={handleQuickRegister}>Yes, {isFull ? 'Join Waitlist' : 'Register'}</button>
                </div>
            </div>
        </div>
      )}

      {/* Trip Check-In Modal */}
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
                Trip Needs Check-In
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

      {/* Cancel Registration Modal */}
      {showCancelModal && (
        <div className="modal-overlay active" onClick={(e) => e.target === e.currentTarget && setShowCancelModal(false)}>
          <div className="modal" style={{maxWidth: '500px'}}>
            <button className="modal-close" onClick={() => setShowCancelModal(false)}>&times;</button>
            <h2 className="modal-title">Cancel Registration?</h2>

            <p style={{marginBottom: '20px', fontSize: '15px', lineHeight: '1.6'}}>
              Are you sure you want to cancel your registration?
              <br /><br />
              • If you are on the <strong>waitlist</strong>, you will lose your spot.<br />
              • If you have a <strong>confirmed spot</strong>, it will be given to the next person immediately.
            </p>

            

            <div style={{display: 'flex', justifyContent: 'center', gap: '15px'}}>
              <button className="btn" style={{width: '140px', backgroundColor: 'white', border: '1px solid #ccc', color: '#333'}} onClick={() => setShowCancelModal(false)}>
                Keep
              </button>
              <button className="btn" style={{width: '140px', backgroundColor: 'var(--danger)', color: 'white'}} onClick={handleConfirmCancel}>
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Promotion Confirmation Modal */}
      {showPromotionModal && (
        <div className="modal-overlay active" onClick={(e) => e.target === e.currentTarget && setShowPromotionModal(false)}>
          <div className="modal" style={{maxWidth: '500px'}}>
            <button className="modal-close" onClick={() => setShowPromotionModal(false)}>&times;</button>
            <h2 className="modal-title" style={{color: 'var(--success)'}}>A Spot Opened Up!</h2>

            <p style={{marginBottom: '25px', fontSize: '16px', lineHeight: '1.6', textAlign: 'center'}}>
             Click "Confirm Spot" to secure your registration.
             Click "Decline" if you no longer want to attend.
            </p>

            

            <div style={{display: 'flex', justifyContent: 'center', gap: '15px', flexWrap: 'wrap'}}>
              <button className="btn" style={{minWidth: '140px', backgroundColor: 'white', border: '1px solid #ccc', color: '#333'}} onClick={handleDeclinePromotion}>
                Decline
              </button>
              <button className="btn" style={{minWidth: '140px', backgroundColor: 'var(--success)', color: 'white'}} onClick={handleConfirmPromotion}>
                Confirm Spot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decline Spot Confirmation Modal */}
      {showDeclineModal && (
        <div className="modal-overlay active" onClick={(e) => e.target === e.currentTarget && setShowDeclineModal(false)}>
          <div className="modal" style={{maxWidth: '450px'}}>
            <button className="modal-close" onClick={() => setShowDeclineModal(false)}>&times;</button>
            <h2 className="modal-title">Decline Spot?</h2>

            <p style={{marginBottom: '25px', fontSize: '15px', lineHeight: '1.6', textAlign: 'center'}}>
              Are you sure you want to decline this spot and be removed from the trip?
            </p>

            <div style={{display: 'flex', justifyContent: 'center', gap: '15px'}}>
              <button className="btn" style={{width: '120px', backgroundColor: 'white', border: '1px solid #ccc', color: '#333'}} onClick={() => setShowDeclineModal(false)}>
                Go Back
              </button>
              <button className="btn" style={{width: '140px', backgroundColor: 'var(--danger)', color: 'white'}} onClick={handleConfirmDecline}>
                Yes, Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generic Alert Modal */}
      {alertModal.show && (
        <div className="modal-overlay active" onClick={(e) => e.target === e.currentTarget && setAlertModal({ ...alertModal, show: false })}>
          <div className="modal" style={{maxWidth: '450px', textAlign: 'center'}}>
            <button className="modal-close" onClick={() => setAlertModal({ ...alertModal, show: false })}>&times;</button>
            <h2 className="modal-title" style={{
              color: alertModal.type === 'success' ? 'var(--success)' : alertModal.type === 'error' ? 'var(--danger)' : 'var(--primary)'
            }}>
              {alertModal.title}
            </h2>

            <p style={{marginBottom: '30px', fontSize: '15px', lineHeight: '1.6'}}>
              {alertModal.message}
            </p>

            <button className="btn" style={{minWidth: '120px'}} onClick={() => setAlertModal({ ...alertModal, show: false })}>
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Trip;