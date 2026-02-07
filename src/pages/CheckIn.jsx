import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const CheckIn = () => {
    const { token } = useParams();
    const [currentUser, setCurrentUser] = useState(null);
    const [sessionInfo, setSessionInfo] = useState(null);
    const [statusMessage, setStatusMessage] = useState(null);
    const [showManualForm, setShowManualForm] = useState(false);
    const [showAuthSection, setShowAuthSection] = useState(false);
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showCancelManual, setShowCancelManual] = useState(false);
    const [checkInWindowStatus, setCheckInWindowStatus] = useState(null);

    useEffect(() => {
        const initialize = async () => {
            await loadSession();
            await checkAuth();
        };
        initialize();
    }, [token]);

    const checkAuth = async () => {
        try {
            const response = await fetch('/api/auth/me', {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();

                if (data && data.user) {
                    setCurrentUser(data.user);
                    await checkStatus(data.user);
                } else {
                    setShowManualForm(true);
                }
            } else {
                setShowManualForm(true);
            }
        } catch (error) {
            console.log('Not logged in', error);
            setShowManualForm(true);
        }
    };

    const checkStatus = async (user) => {
        try {
            const statusResponse = await fetch(`/api/attendance/check-status/${token}`, {
                credentials: 'include'
            });

            if (statusResponse.ok) {
                const status = await statusResponse.json();
                if (status.checked_in) {
                    showSuccess(`You're already checked in!`, true);
                    return;
                }
            }

            await autoCheckIn(user);

        } catch (err) {
            console.error("Status check failed", err);
            setShowAuthSection(true);
        }
    };

    const autoCheckIn = async (user) => {
        setIsSubmitting(true);

        try {
            const response = await fetch(`/api/attendance/checkin/${token}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    user_id: user.id
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Check-in failed');
            }

            const data = await response.json();
            showSuccess(`Welcome, ${user.first_name}! You're all checked in.`, data.matched);

        } catch (error) {
            console.error('Auto check-in error:', error);
            showError(error.message);
            setShowAuthSection(true);
            setShowCancelManual(true);
            setIsSubmitting(false);
        }
    };

    const loadSession = async () => {
        try {
            const response = await fetch(`/api/attendance/session/${token}`);

            if (!response.ok) {
                showError('This check-in link is invalid or has expired.');
                setShowAuthSection(false);
                setShowManualForm(false);
                return;
            }

            const data = await response.json();
            setSessionInfo(data);

            if (data.check_in_window) {
                const now = new Date();
                const windowStart = new Date(data.check_in_window.start);
                const windowEnd = new Date(data.check_in_window.end);

                if (now < windowStart) {
                    setCheckInWindowStatus({
                        status: 'before',
                        message: `Check-in opens on ${windowStart.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at 12:00 AM`,
                        start: windowStart,
                        end: windowEnd
                    });
                } else if (now > windowEnd) {
                    setCheckInWindowStatus({
                        status: 'after',
                        message: 'Check-in window has closed',
                        start: windowStart,
                        end: windowEnd
                    });
                } else {
                    setCheckInWindowStatus({
                        status: 'active',
                        message: `Check-in closes at ${windowEnd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
                        start: windowStart,
                        end: windowEnd
                    });
                }
            }

        } catch (error) {
            console.error('Load session error:', error);
            showError('Failed to load check-in information.');
        }
    };

    const handleQuickCheckIn = async () => {
        setIsSubmitting(true);

        try {
            const response = await fetch(`/api/attendance/checkin/${token}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    user_id: currentUser.id
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Check-in failed');
            }

            const data = await response.json();
            showSuccess(`Welcome, ${currentUser.first_name}! You're all checked in.`, data.matched);
            setShowAuthSection(false);

        } catch (error) {
            console.error('Check-in error:', error);
            showError(error.message);
            setIsSubmitting(false);
        }
    };

    const handleNameFormSubmit = async (e) => {
        e.preventDefault();

        const firstNameTrimmed = firstName.trim();
        const lastNameTrimmed = lastName.trim();

        setIsSubmitting(true);

        try {
            const response = await fetch(`/api/attendance/checkin/${token}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    first_name: firstNameTrimmed,
                    last_name: lastNameTrimmed
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Check-in failed');
            }

            const data = await response.json();
            showSuccess(`Welcome, ${firstNameTrimmed}! You're all checked in.`, data.matched);
            setShowManualForm(false);
            setShowAuthSection(false);

        } catch (error) {
            console.error('Check-in error:', error);
            showError(error.message);
            setIsSubmitting(false);
        }
    };

    const showSuccess = (message, matched = true) => {
        setStatusMessage({
            type: 'success',
            message: message,
            matched: matched
        });
        setShowAuthSection(false);
        setShowManualForm(false);
    };

    const showError = (message) => {
        setStatusMessage({
            type: 'error',
            message: message
        });
    };

    const toggleManualForm = () => {
        setShowAuthSection(false);
        setShowManualForm(true);
        if (currentUser) {
            setFirstName(currentUser.first_name || '');
            setLastName(currentUser.last_name || '');
        }
    };

    const cancelManual = () => {
        setShowManualForm(false);
        setShowAuthSection(true);
    };

    return (
        <>
            <style>{`
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                    font-family: 'Montserrat', sans-serif;
                }

                body {
                    background: linear-gradient(135deg, #e21833 0%, #a61528 100%);
                    min-height: 100vh;
                }

                .checkin-page {
                    background: linear-gradient(135deg, #e21833 0%, #a61528 100%);
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 20px;
                }

                .checkin-container {
                    background: white;
                    border-radius: 20px;
                    padding: 40px;
                    max-width: 500px;
                    width: 100%;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                }

                .checkin-logo {
                    text-align: center;
                    margin-bottom: 30px;
                }

                .checkin-logo h1 {
                    color: #e21833;
                    font-size: 2rem;
                    margin-bottom: 10px;
                }

                .checkin-logo p {
                    color: #666;
                    font-size: 0.95rem;
                }

                .checkin-trip-info {
                    background: #f5f5f5;
                    padding: 20px;
                    border-radius: 10px;
                    margin-bottom: 30px;
                    text-align: center;
                }

                .checkin-trip-info h2 {
                    color: #333;
                    font-size: 1.3rem;
                    margin-bottom: 10px;
                }

                .checkin-bus-number {
                    display: inline-block;
                    background: #e21833;
                    color: white;
                    padding: 8px 20px;
                    border-radius: 20px;
                    font-weight: 600;
                    font-size: 1.1rem;
                }

                .checkin-status-message {
                    padding: 20px;
                    border-radius: 10px;
                    margin-bottom: 20px;
                    text-align: center;
                }

                .checkin-status-message.success {
                    background: #d4edda;
                    color: #155724;
                    border: 1px solid #c3e6cb;
                }

                .checkin-status-message.success.unmatched {
                    background: #fff3cd;
                    color: #856404;
                    border: 1px solid #ffc107;
                }

                .checkin-status-message.error {
                    background: #f8d7da;
                    color: #721c24;
                    border: 1px solid #f5c6cb;
                }

                .checkin-status-message i {
                    font-size: 3rem;
                    margin-bottom: 15px;
                }

                .checkin-status-message i.fa-check-circle {
                    color: #28a745;
                }

                .checkin-status-message i.fa-info-circle {
                    color: #ffc107;
                }

                .checkin-status-message i.fa-exclamation-circle {
                    color: #dc3545;
                }

                .checkin-status-message h3 {
                    font-size: 1.5rem;
                    margin-bottom: 10px;
                }

                .checkin-logged-in-user {
                    background: #d4edda;
                    padding: 15px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    text-align: center;
                }

                .checkin-logged-in-user i {
                    color: #28a745;
                    margin-right: 8px;
                }

                .checkin-form-group {
                    margin-bottom: 20px;
                }

                .checkin-form-group label {
                    display: block;
                    margin-bottom: 8px;
                    font-weight: 600;
                    color: #333;
                }

                .checkin-form-group input[type="text"] {
                    width: 100%;
                    padding: 12px;
                    border: 2px solid #ddd;
                    border-radius: 8px;
                    font-size: 1rem;
                    transition: border-color 0.3s;
                }

                .checkin-form-group input[type="text"]:focus {
                    outline: none;
                    border-color: #e21833;
                }

                .checkin-btn {
                    width: 100%;
                    padding: 15px;
                    background: #e21833;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 1.1rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                }

                .checkin-btn:hover {
                    background: #c01528;
                    transform: translateY(-2px);
                    box-shadow: 0 5px 15px rgba(226, 24, 51, 0.3);
                }

                .checkin-btn:disabled {
                    background: #ccc;
                    cursor: not-allowed;
                    transform: none;
                }

                .checkin-btn i {
                    font-size: 1.2rem;
                }

                .checkin-manual-toggle {
                    text-align: center;
                    margin-top: 15px;
                    color: #666;
                    font-size: 0.9rem;
                    cursor: pointer;
                    text-decoration: underline;
                }

                .checkin-manual-toggle:hover {
                    color: #e21833;
                }

                .checkin-loading {
                    display: inline-block;
                    width: 20px;
                    height: 20px;
                    border: 3px solid rgba(255, 255, 255, .3);
                    border-radius: 50%;
                    border-top-color: white;
                    animation: checkin-spin 1s ease-in-out infinite;
                }

                .checkin-auto-processing {
                    background: #d1ecf1;
                    color: #0c5460;
                    border: 1px solid #bee5eb;
                    padding: 20px;
                    border-radius: 10px;
                    text-align: center;
                }

                .checkin-auto-processing .checkin-loading-large {
                    display: inline-block;
                    width: 40px;
                    height: 40px;
                    border: 4px solid rgba(12, 84, 96, .3);
                    border-radius: 50%;
                    border-top-color: #0c5460;
                    animation: checkin-spin 1s ease-in-out infinite;
                    margin-bottom: 15px;
                }

                .checkin-auto-processing h3 {
                    font-size: 1.3rem;
                    margin-bottom: 5px;
                }

                @keyframes checkin-spin {
                    to {
                        transform: rotate(360deg);
                    }
                }

                .checkin-window-status {
                    padding: 15px;
                    border-radius: 10px;
                    margin-bottom: 20px;
                    text-align: center;
                    border: 2px solid;
                }

                .checkin-window-status.active {
                    background: #d4edda;
                    color: #155724;
                    border-color: #c3e6cb;
                }

                .checkin-window-status.before {
                    background: #fff3cd;
                    color: #856404;
                    border-color: #ffc107;
                }

                .checkin-window-status.after {
                    background: #f8d7da;
                    color: #721c24;
                    border-color: #f5c6cb;
                }

                .checkin-window-status i {
                    font-size: 1.5rem;
                    margin-bottom: 10px;
                }

                .checkin-window-status h4 {
                    font-size: 1.1rem;
                    margin: 10px 0 5px 0;
                }

                .checkin-window-status p {
                    font-size: 0.9rem;
                    margin: 5px 0;
                }

                @media (max-width: 480px) {
                    .checkin-container {
                        padding: 25px;
                    }

                    .checkin-logo h1 {
                        font-size: 1.6rem;
                    }

                    .checkin-trip-info h2 {
                        font-size: 1.1rem;
                    }
                }
            `}</style>
            <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet" />
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />

            <div className="checkin-page">
                <div className="checkin-container">
                    <div className="checkin-logo">
                        <h1><i className="fas fa-skiing"></i> UMD Ski Club</h1>
                        <p>Bus Attendance Check-In</p>
                    </div>

                    {sessionInfo && (
                        <div className="checkin-trip-info">
                            <h2>{sessionInfo.trip_name}</h2>
                            <div className="checkin-bus-number">Bus {sessionInfo.bus_number}</div>
                        </div>
                    )}

                    {checkInWindowStatus && !statusMessage && (
                        <div className={`checkin-window-status ${checkInWindowStatus.status}`}>
                            {checkInWindowStatus.status === 'active' && (
                                <>
                                    <i className="fas fa-clock"></i>
                                    <h4>Check-In Window is Open</h4>
                                    <p>{checkInWindowStatus.message}</p>
                                </>
                            )}
                            {checkInWindowStatus.status === 'before' && (
                                <>
                                    <i className="fas fa-calendar-alt"></i>
                                    <h4>Check-In Not Yet Available</h4>
                                    <p>{checkInWindowStatus.message}</p>
                                    <p style={{ marginTop: '10px', fontSize: '0.85rem' }}>
                                        Check-in is only available on Friday (12:00 AM - 11:59 PM) before the trip.
                                    </p>
                                </>
                            )}
                            {checkInWindowStatus.status === 'after' && (
                                <>
                                    <i className="fas fa-times-circle"></i>
                                    <h4>Check-In Window Closed</h4>
                                    <p>{checkInWindowStatus.message}</p>
                                    <p style={{ marginTop: '10px', fontSize: '0.85rem' }}>
                                        The check-in window closed on Friday at 11:59 PM.
                                    </p>
                                </>
                            )}
                        </div>
                    )}

                    {statusMessage && (
                        <div className={`checkin-status-message ${statusMessage.type} ${statusMessage.type === 'success' && !statusMessage.matched ? 'unmatched' : ''}`}>
                            {statusMessage.type === 'error' && (
                                <i className="fas fa-exclamation-circle"></i>
                            )}
                            {statusMessage.type === 'success' && statusMessage.matched && (
                                <i className="fas fa-check-circle"></i>
                            )}
                            {statusMessage.type === 'success' && !statusMessage.matched && (
                                <i className="fas fa-info-circle"></i>
                            )}
                            <h3>{statusMessage.type === 'success' ? 'Success!' : 'Error'}</h3>
                            <p>{statusMessage.message}</p>
                            {statusMessage.type === 'success' && !statusMessage.matched && (
                                <p style={{ marginTop: '15px', fontSize: '0.95rem', fontWeight: '600' }}>
                                    Before boarding the bus, check with an exec member to make sure you're on the trip (your name wasn't found in the system, but we can still check you in).
                                </p>
                            )}
                        </div>
                    )}

                    {isSubmitting && !statusMessage && !showAuthSection && !showManualForm && (
                        <div className="checkin-auto-processing">
                            <div className="checkin-loading-large"></div>
                            <h3>Checking you in...</h3>
                            <p>Please wait</p>
                        </div>
                    )}

                    {showAuthSection && currentUser && (
                        <div>
                            <div className="checkin-logged-in-user">
                                <i className="fas fa-user-check"></i>
                                <strong>Logged in as:</strong> {currentUser.first_name} {currentUser.last_name}
                            </div>

                            <button
                                className="checkin-btn"
                                onClick={handleQuickCheckIn}
                                disabled={isSubmitting || (checkInWindowStatus && checkInWindowStatus.status !== 'active')}
                            >
                                {isSubmitting ? (
                                    <>
                                        <div className="checkin-loading"></div>
                                        <span>Checking in...</span>
                                    </>
                                ) : (
                                    <>
                                        <i className="fas fa-check-circle"></i>
                                        <span>Check In Now</span>
                                    </>
                                )}
                            </button>

                            {checkInWindowStatus && checkInWindowStatus.status !== 'active' && (
                                <div style={{ textAlign: 'center', marginTop: '15px', color: '#856404', fontSize: '0.9rem' }}>
                                    Check-in is only available during the check-in window
                                </div>
                            )}

                            <div className="checkin-manual-toggle" onClick={toggleManualForm}>
                                Name doesn't match registration? Enter manually
                            </div>
                        </div>
                    )}

                    {showManualForm && (
                        <form onSubmit={handleNameFormSubmit}>
                            <div className="checkin-form-group">
                                <label htmlFor="firstName">First Name</label>
                                <input
                                    type="text"
                                    id="firstName"
                                    name="firstName"
                                    required
                                    minLength="2"
                                    placeholder="Enter first name"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                />
                            </div>
                            <div className="checkin-form-group">
                                <label htmlFor="lastName">Last Name</label>
                                <input
                                    type="text"
                                    id="lastName"
                                    name="lastName"
                                    required
                                    minLength="1"
                                    placeholder="Enter last name"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                />
                            </div>
                            <button
                                type="submit"
                                className="checkin-btn"
                                disabled={isSubmitting || (checkInWindowStatus && checkInWindowStatus.status !== 'active')}
                            >
                                {isSubmitting ? (
                                    <>
                                        <div className="checkin-loading"></div>
                                        <span>Checking in...</span>
                                    </>
                                ) : (
                                    <>
                                        <i className="fas fa-check-circle"></i>
                                        <span>Check In</span>
                                    </>
                                )}
                            </button>

                            {checkInWindowStatus && checkInWindowStatus.status !== 'active' && (
                                <div style={{ textAlign: 'center', marginTop: '15px', color: '#856404', fontSize: '0.9rem' }}>
                                    Check-in is only available during the check-in window
                                </div>
                            )}

                            {showCancelManual && (
                                <div className="checkin-manual-toggle" onClick={cancelManual}>
                                    Cancel
                                </div>
                            )}
                        </form>
                    )}
                </div>
            </div>
        </>
    );
};

export default CheckIn;
