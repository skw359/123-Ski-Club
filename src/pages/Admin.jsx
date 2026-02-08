import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Admin.css';
import { useNotify } from '../context/NotificationContext';
import { getTimeBasedGreeting } from '../utils/admin/greetings';

// --- UTILITY FUNCTIONS ---
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'
    });
};

const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        timeZone: 'America/New_York'
    });
};

// uhh convert UTC datetime to local timezone for datetime-local input wtf does this even do anything
const toLocalDateTimeString = (utcDateString) => {
    if (!utcDateString) return '';
    const date = new Date(utcDateString);
    const offset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - offset);
    return localDate.toISOString().slice(0, 16);
};

const getPromotionDeadlineCountdown = (promotionExpiresAt) => {
    if (!promotionExpiresAt) return null;

    const now = new Date();
    const deadline = new Date(promotionExpiresAt);
    const msRemaining = deadline - now;

    if (msRemaining <= 0) return 'EXPIRED';

    const hoursRemaining = Math.floor(msRemaining / (1000 * 60 * 60));
    const minutesRemaining = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));

    return `${hoursRemaining}h ${minutesRemaining}m`;
};

const getCheckInStatus = (tripDate) => {
    if (!tripDate) return { status: 'unknown', text: 'N/A' };

    // Parse date in LOCAL time (not UTC) to avoid timezone shifting
    const dateStr = tripDate.split('T')[0]; // Get just the date part (YYYY-MM-DD)
    const [year, month, day] = dateStr.split('-').map(Number);
    const tripDateTime = new Date(year, month - 1, day); // month is 0-indexed
    const now = new Date();

    // Check-in ALWAYS closes at 11:59 PM, 2 days before trip (regardless of when it opened)
    const closesAt = new Date(tripDateTime);
    closesAt.setDate(tripDateTime.getDate() - 2);
    closesAt.setHours(23, 59, 59, 999);

    // Check-in should open at 12:00 AM, 2 days before trip
    const shouldOpenAt = new Date(closesAt);
    shouldOpenAt.setHours(0, 0, 0, 0);

    // Check status
    if (now < shouldOpenAt) {
        return { status: 'not-open', text: 'Not Open Yet' };
    } else if (now > closesAt) {
        return { status: 'closed', text: 'Closed' };
    } else {
        // Check-in is open - show when it closes (always 2 days before trip at 11:59 PM)
        const hoursUntilClose = (closesAt - now) / (1000 * 60 * 60);

        if (hoursUntilClose < 1) {
            const minutesUntilClose = Math.floor(hoursUntilClose * 60);
            return { status: 'open', text: `Closes in ${minutesUntilClose}m`, closesAt };
        } else {
            const hours = Math.floor(hoursUntilClose);
            const minutes = Math.floor((hoursUntilClose - hours) * 60);
            return { status: 'open', text: `Closes in ${hours}h ${minutes}m`, closesAt };
        }
    }
};

const getCheckInCountdown = (tripDate) => {
    if (!tripDate) return null;

    const dateStr = tripDate.split('T')[0];
    const [year, month, day] = dateStr.split('-').map(Number);
    const tripDateTime = new Date(year, month - 1, day);
    const now = new Date();

    // Check-in window: 2 days before trip, 12:00 AM - 11:59 PM
    const windowStart = new Date(tripDateTime);
    windowStart.setDate(tripDateTime.getDate() - 2);
    windowStart.setHours(0, 0, 0, 0);

    const windowEnd = new Date(windowStart);
    windowEnd.setHours(23, 59, 59, 999);

    // Before window opens
    if (now < windowStart) {
        const msUntilOpen = windowStart - now;
        const daysUntilOpen = Math.floor(msUntilOpen / (1000 * 60 * 60 * 24));
        const hoursUntilOpen = Math.floor((msUntilOpen % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        if (daysUntilOpen > 0) {
            return { status: 'before', text: `Opens in ${daysUntilOpen}d ${hoursUntilOpen}h`, badgeClass: 'status-upcoming' };
        } else if (hoursUntilOpen > 0) {
            return { status: 'before', text: `Opens in ${hoursUntilOpen}h`, badgeClass: 'status-upcoming' };
        } else {
            const minutesUntilOpen = Math.floor(msUntilOpen / (1000 * 60));
            return { status: 'before', text: `Opens in ${minutesUntilOpen}m`, badgeClass: 'status-upcoming' };
        }
    }

    // Window is open
    if (now >= windowStart && now <= windowEnd) {
        const msUntilClose = windowEnd - now;
        const hoursUntilClose = Math.floor(msUntilClose / (1000 * 60 * 60));
        const minutesUntilClose = Math.floor((msUntilClose % (1000 * 60 * 60)) / (1000 * 60));

        if (hoursUntilClose > 0) {
            return { status: 'open', text: `${hoursUntilClose}h ${minutesUntilClose}m left`, badgeClass: 'status-warning' };
        } else {
            return { status: 'open', text: `${minutesUntilClose}m left`, badgeClass: 'status-warning' };
        }
    }

    // Window closed
    return { status: 'closed', text: 'Window Closed', badgeClass: 'status-error' };
};

// --- COMPONENT ---
export default function Admin() {
    // -- Notification System --
    const notify = useNotify();

    // -- UI State --
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
    const [sidebarActive, setSidebarActive] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [activeTab, setActiveTab] = useState('dashboard');
    const [pageTitle, setPageTitle] = useState('Dashboard');
    const [loading, setLoading] = useState(false);
    const [fading, setFading] = useState(false);

    // -- Data State --
    const [dashboardStats, setDashboardStats] = useState(null);
    const [trips, setTrips] = useState([]);
    
    // Users
    const [users, setUsers] = useState([]);
    const [userPage, setUserPage] = useState(1);
    const [userPagination, setUserPagination] = useState({});
    const [userSearch, setUserSearch] = useState('');
    
    // Admins / PDF / Announcements / Check-ins
    const [admins, setAdmins] = useState([]);
    const [pdfStatus, setPdfStatus] = useState(null);
    const [checkInStats, setCheckInStats] = useState([]);
    const [announcements, setAnnouncements] = useState([]);

    // Activity Logs
    const [logs, setLogs] = useState([]);
    const [logsPagination, setLogsPagination] = useState({});
    const [logsPage, setLogsPage] = useState(1);

    // -- Attendance State --
    const [attendanceSessions, setAttendanceSessions] = useState([]);
    const [activeSession, setActiveSession] = useState(null);
    const [liveAttendanceData, setLiveAttendanceData] = useState({ checkins: [], expected: [], session: {}, trip: {} });
    const [attendanceHistoryExpanded, setAttendanceHistoryExpanded] = useState(false);
    const [attendanceSearch, setAttendanceSearch] = useState('');
    const attendanceIntervalRef = useRef(null);
    const [sessionSelection, setSessionSelection] = useState([]); // Array of IDs for bulk delete
    const [pastTripsExpanded, setPastTripsExpanded] = useState(false);

    // -- Settings --
    const [settings, setSettings] = useState({ tripSafety: false, externalEmails: false });

    // -- Modals / Edit State --
    const [modals, setModals] = useState({
        welcome: false, trip: false, registrations: false, addAdmin: false,
        pdfUpload: false, startAttendance: false, confirmation: false, announcement: false,
        giveawayResults: false
    });

    const [editingTrip, setEditingTrip] = useState(null);
    const [customQuestions, setCustomQuestions] = useState([]);
    const [tripModalMsg, setTripModalMsg] = useState(null);
    const [pendingWaiver, setPendingWaiver] = useState(null); // For new trips

    const [registrationData, setRegistrationData] = useState({ active: [], waitlist: [], trip: {} });
    const [selectedRegistrationTripId, setSelectedRegistrationTripId] = useState(null);
    const [expandedRegId, setExpandedRegId] = useState(null);
    const [regDetails, setRegDetails] = useState({}); // Cache details by ID
    const [draggedItem, setDraggedItem] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);

    // Manual Add Person
    const [showAddPerson, setShowAddPerson] = useState(false);
    const [addPersonSearch, setAddPersonSearch] = useState('');
    const [addPersonResults, setAddPersonResults] = useState([]);
    const [addPersonLoading, setAddPersonLoading] = useState(false);

    // Giveaway
    const [showGiveaway, setShowGiveaway] = useState(false);
    const [rentalPrizeCount, setRentalPrizeCount] = useState(0);
    const [ticketPrizeCount, setTicketPrizeCount] = useState(0);
    const [giveawayLoading, setGiveawayLoading] = useState(false);
    const [giveawayResults, setGiveawayResults] = useState(null);

    const [editingAnnouncement, setEditingAnnouncement] = useState(null);
    const [announcementMsg, setAnnouncementMsg] = useState('');

    const [confirmConfig, setConfirmConfig] = useState({ message: '', onConfirm: null });

    // Refs for non-controlled inputs (File uploads, etc)
    const tripFormRef = useRef(null);
    const adminEmailRef = useRef(null);
    const pdfFileRef = useRef(null);
    const pdfDescRef = useRef(null);
    const startAttendanceFormRef = useRef(null);
    const announcementFormRef = useRef(null);

    // --- API HELPER ---
    const fetchWithAuth = useCallback(async (url, options = {}) => {
        try {
            const res = await fetch(url, {
                ...options,
                credentials: 'include',
                headers: { 'Content-Type': 'application/json', ...options.headers },
            });
            if (res.status === 401 || res.status === 403) {
                window.location.href = '/login?redirect=/admin';
                return null;
            }
            return res;
        } catch (err) {
            console.error(err);
            return null;
        }
    }, []);

    // --- TAB SWITCHING WITH FADE ---
    const switchTab = (newTab) => {
        if (newTab === activeTab) return;
        
        setFading(true);
        setTimeout(() => {
            setActiveTab(newTab);
            setFading(false);
        }, 250); // Match the fade-out animation duration
    };

    // --- EFFECTS ---

    // 1. Theme
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    // 2. Auth Check
    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        const res = await fetchWithAuth('/api/auth/me');
        if (res && res.ok) {
            const data = await res.json();
            if (data.user) {
                // Verify admin privs
                const adminCheck = await fetchWithAuth('/api/admin/dashboard/stats');
                if (!adminCheck || adminCheck.status === 403) {
                    alert('Access denied');
                    window.location.href = '/';
                    return;
                }
                setCurrentUser(data.user);
                if (!localStorage.getItem('adminWelcomeScreenShown')) {
                    setModals(m => ({ ...m, welcome: true }));
                }
            } else {
                 window.location.href = '/login';
            }
        }
    };

    // 3. Tab Switching Data Load
    useEffect(() => {
        if (attendanceIntervalRef.current && activeTab !== 'attendance') {
            clearInterval(attendanceIntervalRef.current);
            attendanceIntervalRef.current = null;
        }

        switch (activeTab) {
            case 'dashboard': loadDashboardData(); break;
            case 'users': loadUsers(userSearch, 1); break;
            case 'admins': loadAdmins(); break;
            case 'pdf': loadPdfStatus(); break;
            case 'checkins': loadCheckInManagement(); break;
            case 'attendance': 
                loadAttendanceSessions();
                if (activeSession) pollAttendance(activeSession);
                break;
            case 'announcements': loadAnnouncements(); break;
            case 'logs': loadLogs(1); break;
            case 'settings': loadSettings(); break;
        }

        // Title Update
        if (activeTab === 'dashboard' && currentUser) {
            setPageTitle(getTimeBasedGreeting(currentUser.first_name || 'Admin'));
        } else {
            const map = {
                users: 'User Management', admins: 'Admin Management', pdf: 'PDF Management',
                checkins: 'Check-in Status', attendance: 'Bus Attendance', announcements: 'Announcements',
                logs: 'Activity Logs', settings: 'Settings'
            };
            setPageTitle(map[activeTab] || 'Dashboard');
        }
    }, [activeTab, currentUser]);

    // 4. Auto-refresh check-in timers every minute
    useEffect(() => {
        if (activeTab !== 'checkins') return;

        const intervalId = setInterval(() => {
            // Force re-render to update countdown timers
            setCheckInStats(stats => [...stats]);
        }, 60000); // Update every 60 seconds

        return () => clearInterval(intervalId);
    }, [activeTab]);

    // 5. Auto-refresh promotion deadline timers in registrations modal
    useEffect(() => {
        if (!modals.registrations) return;

        const intervalId = setInterval(() => {
            // Force re-render to update countdown timers
            setRegistrationData(data => ({ ...data }));
        }, 60000); // Update every 60 seconds

        return () => clearInterval(intervalId);
    }, [modals.registrations]);

    // --- CONFIRMATION DIALOG HELPER ---
    const showConfirm = (message) => {
        return new Promise((resolve) => {
            setConfirmConfig({
                message,
                onConfirm: (result) => {
                    setModals(m => ({ ...m, confirmation: false }));
                    resolve(result);
                }
            });
            setModals(m => ({ ...m, confirmation: true }));
        });
    };

    // --- DASHBOARD FUNCTIONS ---
    const loadDashboardData = async () => {
        setLoading(true);
        const statsRes = await fetchWithAuth('/api/admin/dashboard/stats');
        const tripsRes = await fetchWithAuth('/api/trips');
        const checkinRes = await fetchWithAuth('/api/admin/check-in-stats');
        
        if (statsRes?.ok) setDashboardStats(await statsRes.json());
        if (tripsRes?.ok) setTrips(await tripsRes.json());
        // We can use checkinRes for specific badge counts if needed
        setLoading(false);
    };

    const deleteTrip = async (id, name, count) => {
        const confirmed = await showConfirm(`Are you sure you want to delete "${name}"?`);
        if (!confirmed) return;

        const res = await fetchWithAuth(`/api/admin/trips/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const err = await res.json();
            // Handle "Force Delete" logic logic if trip safety is disabled but regs exist
            if (err.requiresConfirmation) {
                if (await showConfirm(err.error + " Proceed anyway?")) {
                    const forceRes = await fetchWithAuth(`/api/admin/trips/${id}?force=true`, { method: 'DELETE' });
                    if (forceRes?.ok) {
                        notify({ type: 'success', message: `Trip "${name}" deleted successfully.` });
                        loadDashboardData();
                    } else {
                        const forceErr = await forceRes.json();
                        notify({ type: 'error', message: forceErr.error || 'Failed to delete trip.' });
                    }
                }
            } else {
                notify({ type: 'error', message: err.error || 'Failed to delete trip.' });
            }
        } else {
            notify({ type: 'success', message: `Trip "${name}" deleted successfully.` });
            loadDashboardData();
        }
    };

    // --- USER MANAGEMENT ---
    const loadUsers = async (search = '', page = 1) => {
        setLoading(true);
        const url = `/api/admin/users?page=${page}&limit=50&search=${encodeURIComponent(search)}`;
        const res = await fetchWithAuth(url);
        if (res?.ok) {
            const data = await res.json();
            setUsers(data.users);
            setUserPagination(data.pagination);
            setUserPage(page);
        }
        setLoading(false);
    };

    const handleStrike = async (userId, email, action) => {
        const msg = action === 'add' ? `Add strike to ${email}?` :
                   action === 'remove' ? `Remove strike from ${email}?` :
                   `Clear ALL strikes for ${email}?`;

        if (!await showConfirm(msg)) return;

        const url = action === 'add' ? `/api/admin/users/${userId}/strike`
                  : action === 'remove' ? `/api/admin/users/${userId}/strike` // DELETE
                  : `/api/admin/users/${userId}/strikes/clear`; // POST

        const method = action === 'add' || action === 'clear' ? 'POST' : 'DELETE';
        const res = await fetchWithAuth(url, { method });

        if (res?.ok) {
            const successMsg = action === 'add' ? `Strike added to ${email}.` :
                             action === 'remove' ? `Strike removed from ${email}.` :
                             `All strikes cleared for ${email}.`;
            notify({ type: 'success', message: successMsg });
            loadUsers(userSearch, userPage);
        } else {
            const err = await res.json().catch(() => ({}));
            notify({ type: 'error', message: err.error || 'Failed to update strikes.' });
        }
    };

    // --- ADMIN MANAGEMENT ---
    const loadAdmins = async () => {
        setLoading(true);
        const res = await fetchWithAuth('/api/admin/admins');
        if (res?.ok) setAdmins(await res.json());
        setLoading(false);
    };

    const handleAddAdmin = async (e) => {
        e.preventDefault();
        const email = adminEmailRef.current.value;
        if (!email.endsWith('@terpmail.umd.edu') && !email.endsWith('@umd.edu')) {
            notify({ type: 'error', message: 'Must be a UMD email.' });
            return;
        }
        if (await showConfirm(`Make ${email} an admin?`)) {
            const res = await fetchWithAuth('/api/admin/admins', {
                method: 'POST', body: JSON.stringify({ email })
            });
            if (res?.ok) {
                notify({ type: 'success', message: `${email} added as admin successfully.` });
                setModals(m => ({...m, addAdmin: false}));
                loadAdmins();
            } else {
                const err = await res.json().catch(() => ({}));
                notify({ type: 'error', message: err.error || 'Failed to add admin.' });
            }
        }
    };

    const removeAdmin = async (id, email) => {
        if (!await showConfirm(`Remove admin privileges from ${email}?`)) return;
        const res = await fetchWithAuth(`/api/admin/admins/${id}`, { method: 'DELETE' });
        if (res?.ok) {
            notify({ type: 'success', message: `${email} removed as admin successfully.` });
            loadAdmins();
        } else {
            const err = await res.json().catch(() => ({}));
            notify({ type: 'error', message: err.error || 'Failed to remove admin.' });
        }
    };

    // --- Load Activity Logs ---
    const loadLogs = async (page = 1) => {
        setLoading(true);
        const res = await fetchWithAuth(`/api/admin/activity-logs?page=${page}&limit=50`);
        if (res?.ok) {
            const data = await res.json();
            setLogs(data.logs || []);
            setLogsPagination(data.pagination || {});
        }
        setLoading(false);
    };

    // --- TRIP MANAGEMENT (Modal + Questions) ---
    const openTripModal = async (trip = null) => {
        setEditingTrip(trip);
        setCustomQuestions([]);
        setTripModalMsg(null);
        setPendingWaiver(null);
        if (trip) {
            const res = await fetchWithAuth(`/api/trips/${trip.id}/questions`);
            if (res?.ok) setCustomQuestions(await res.json());
        } else {
            // Defaults for new trip
            setCustomQuestions([]); 
        }
        setModals(m => ({ ...m, trip: true }));
    };

    const handleTripSubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = Object.fromEntries(fd.entries());

        // Transform Checkboxes
        data.ask_default_questions = !!data.ask_default_questions;
        data.requires_checkin = !!data.requires_checkin;

        // Transform Dates - convert to ISO strings
        data.registration_opens_at = data.registration_opens_at ? new Date(data.registration_opens_at).toISOString() : null;
        data.departure_time = data.departure_time ? new Date(data.departure_time).toISOString() : null;

        const url = editingTrip ? `/api/admin/trips/${editingTrip.id}` : '/api/admin/trips';
        const method = editingTrip ? 'PUT' : 'POST';

        const res = await fetchWithAuth(url, { method, body: JSON.stringify(data) });
        if (res?.ok) {
            const savedTrip = await res.json();

            // Handle Pending Waiver for New Trips
            if (!editingTrip && pendingWaiver) {
                const waiverFd = new FormData();
                waiverFd.append('waiver', pendingWaiver);
                await fetch(`/api/admin/trips/${savedTrip.id}/waiver`, {method:'POST', body: waiverFd});
            }

            // Save Questions
            await fetchWithAuth(`/api/admin/trips/${savedTrip.id}/questions`, {
                method: 'PUT', body: JSON.stringify({ questions: customQuestions })
            });

            notify({
                type: 'success',
                message: editingTrip ? `Trip "${data.name}" updated successfully.` : `Trip "${data.name}" created successfully.`
            });
            setModals(m => ({ ...m, trip: false }));
            loadDashboardData();
        } else {
            const err = await res.json();
            const errorMsg = err.error || 'Failed to save trip.';
            setTripModalMsg(errorMsg);
            notify({ type: 'error', message: errorMsg });
        }
    };

    // Question Builder Logic
    const addQuestion = () => setCustomQuestions([...customQuestions, { question_text: '', question_type: 'text', dropdown_options: [], is_required: true }]);
    const updateQ = (idx, field, val) => {
        const copy = [...customQuestions];
        copy[idx][field] = val;
        // Init dropdown array if type changed
        if (field === 'question_type' && val === 'dropdown' && !copy[idx].dropdown_options) {
             copy[idx].dropdown_options = [''];
        }
        setCustomQuestions(copy);
    };
    const removeQ = (idx) => setCustomQuestions(customQuestions.filter((_, i) => i !== idx));
    const addOption = (qIdx) => {
        const copy = [...customQuestions];
        if(!copy[qIdx].dropdown_options) copy[qIdx].dropdown_options = [];
        copy[qIdx].dropdown_options.push('');
        setCustomQuestions(copy);
    };
    const updateOption = (qIdx, oIdx, val) => {
        const copy = [...customQuestions];
        copy[qIdx].dropdown_options[oIdx] = val;
        setCustomQuestions(copy);
    };
    const removeOption = (qIdx, oIdx) => {
        const copy = [...customQuestions];
        copy[qIdx].dropdown_options.splice(oIdx, 1);
        setCustomQuestions(copy);
    };

    // --- REGISTRATIONS ---
    const viewRegistrations = async (tripId) => {
        setSelectedRegistrationTripId(tripId);
        setModals(m => ({ ...m, registrations: true }));
        const regRes = await fetchWithAuth(`/api/admin/trips/${tripId}/registrations`);
        const tripRes = await fetchWithAuth(`/api/trips/${tripId}`);
        if (regRes?.ok && tripRes?.ok) {
            const allRegs = await regRes.json();
            const trip = await tripRes.json();

            const waitlistRegs = allRegs.filter(r => r.moved_to_waitlist);
            waitlistRegs.sort((a, b) => {
                const posA = a.waitlist_position ?? 999999;
                const posB = b.waitlist_position ?? 999999;
                if (posA !== posB) return posA - posB;
                return new Date(a.registered_at) - new Date(b.registered_at);
            });

            setRegistrationData({
                active: allRegs.filter(r => !r.moved_to_waitlist),
                waitlist: waitlistRegs,
                trip
            });
        }
    };

    const toggleRegDetails = async (regId) => {
        if (expandedRegId === regId) {
            setExpandedRegId(null);
        } else {
            setExpandedRegId(regId);
            if (!regDetails[regId]) {
                const res = await fetchWithAuth(`/api/admin/registrations/${regId}/details`);
                if (res?.ok) {
                    const d = await res.json();
                    setRegDetails(prev => ({ ...prev, [regId]: d }));
                }
            }
        }
    };

    const manageReg = async (regId, action) => {
        let msg, url, method, successMsg;

        if (action === 'promote') {
            msg = "Promote this user from waitlist?";
            url = `/api/admin/registrations/${regId}/promote`;
            method = 'POST';
            successMsg = 'User promoted from waitlist and notified via email.';
        } else if (action === 'demote') {
            msg = "Move this user to the waitlist?";
            url = `/api/admin/registrations/${regId}/demote`;
            method = 'POST';
            successMsg = 'User moved to waitlist successfully.';
        } else {
            msg = "Remove this user from the trip?";
            url = `/api/admin/registrations/${regId}`;
            method = 'DELETE';
            successMsg = 'User removed from trip successfully.';
        }

        if (!await showConfirm(msg)) return;
        const res = await fetchWithAuth(url, { method });
        if (res?.ok) {
            notify({ type: 'success', message: successMsg });
            viewRegistrations(selectedRegistrationTripId);
        } else {
            const err = await res.json().catch(() => ({}));
            notify({ type: 'error', message: err.error || 'Operation failed.' });
        }
    };

    const handleWaitlistDragStart = (e, index, registration) => {
        setDraggedItem({ index, registration });
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleWaitlistDragOver = (e, index) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverIndex(index);
    };

    const handleWaitlistDrop = async (e, dropIndex) => {
        e.preventDefault();
        if (!draggedItem || draggedItem.index === dropIndex) {
            setDraggedItem(null);
            setDragOverIndex(null);
            return;
        }

        const newWaitlist = [...registrationData.waitlist];
        const [movedItem] = newWaitlist.splice(draggedItem.index, 1);
        newWaitlist.splice(dropIndex, 0, movedItem);

        setRegistrationData(prev => ({ ...prev, waitlist: newWaitlist }));
        setDraggedItem(null);
        setDragOverIndex(null);

        const orderedIds = newWaitlist.map(r => r.registration_id);
        const res = await fetchWithAuth(`/api/admin/trips/${selectedRegistrationTripId}/waitlist/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderedIds })
        });

        if (res?.ok) {
            notify({ type: 'success', message: 'Waitlist order updated successfully.' });
        } else {
            const err = await res.json().catch(() => ({}));
            notify({ type: 'error', message: err.error || 'Failed to update waitlist order.' });
            viewRegistrations(selectedRegistrationTripId);
        }
    };

    const handleWaitlistDragEnd = () => {
        setDraggedItem(null);
        setDragOverIndex(null);
    };

    // --- MANUAL ADD PERSON ---
    const searchUsersForAdd = async (searchTerm) => {
        if (!searchTerm || searchTerm.length < 2) {
            setAddPersonResults([]);
            return;
        }

        setAddPersonLoading(true);
        const res = await fetchWithAuth(`/api/admin/users?search=${encodeURIComponent(searchTerm)}&limit=10`);
        if (res?.ok) {
            const data = await res.json();
            setAddPersonResults(data.users || []);
        }
        setAddPersonLoading(false);
    };

    const manuallyAddPerson = async (userId) => {
        if (!await showConfirm("Manually add this person to the trip?")) return;

        const res = await fetchWithAuth(`/api/admin/trips/${selectedRegistrationTripId}/manual-register`, {
            method: 'POST',
            body: JSON.stringify({ user_id: userId })
        });

        if (res?.ok) {
            notify({ type: 'success', message: 'Person added to trip successfully.' });
            setShowAddPerson(false);
            setAddPersonSearch('');
            setAddPersonResults([]);
            viewRegistrations(selectedRegistrationTripId);
        } else {
            const error = await res.json().catch(() => ({}));
            notify({ type: 'error', message: error.error || 'Failed to add person to trip.' });
        }
    };

    // --- GIVEAWAY ---
    const togglePrize = async (regId, prizeType, currentValue) => {
        const newValue = !currentValue;
        const prizeLabel = prizeType === 'rental' ? 'Rental' : 'Lift Ticket';
        const action = newValue ? 'award' : 'remove';

        if (!await showConfirm(`${action === 'award' ? 'Award' : 'Remove'} ${prizeLabel} prize ${action === 'award' ? 'to' : 'from'} this user?`)) return;

        const res = await fetchWithAuth(`/api/admin/registrations/${regId}/prize`, {
            method: 'PUT',
            body: JSON.stringify({ prize_type: prizeType, value: newValue })
        });

        if (res?.ok) {
            notify({
                type: 'success',
                message: `${prizeLabel} prize ${action === 'award' ? 'awarded' : 'removed'} successfully.`
            });
            viewRegistrations(selectedRegistrationTripId);
        } else {
            const err = await res.json().catch(() => ({}));
            notify({ type: 'error', message: err.error || 'Failed to update prize.' });
        }
    };

    const runGiveaway = async () => {
        const totalPrizes = rentalPrizeCount + ticketPrizeCount;
        if (totalPrizes === 0) {
            notify({ type: 'warning', message: 'Please specify at least one prize to give away.' });
            return;
        }

        const confirmMsg = `Run giveaway with ${rentalPrizeCount} rental prize(s) and ${ticketPrizeCount} lift ticket prize(s)?`;
        if (!await showConfirm(confirmMsg)) return;

        setGiveawayLoading(true);
        const res = await fetchWithAuth(`/api/admin/trips/${selectedRegistrationTripId}/giveaway`, {
            method: 'POST',
            body: JSON.stringify({
                rental_count: rentalPrizeCount,
                ticket_count: ticketPrizeCount
            })
        });

        setGiveawayLoading(false);

        if (res?.ok) {
            const data = await res.json();
            notify({
                type: 'success',
                message: `Giveaway completed! ${rentalPrizeCount} rental(s) and ${ticketPrizeCount} ticket(s) awarded.`
            });
            setGiveawayResults(data);
            setModals(m => ({ ...m, giveawayResults: true }));
            setShowGiveaway(false);
            setRentalPrizeCount(0);
            setTicketPrizeCount(0);
            viewRegistrations(selectedRegistrationTripId);
        } else {
            const error = await res.json().catch(() => ({}));
            notify({ type: 'error', message: error.error || 'Failed to run giveaway.' });
        }
    };

    // --- ANNOUNCEMENTS ---
    const loadAnnouncements = async () => {
        setLoading(true);
        const res = await fetchWithAuth('/api/admin/announcements');
        if (res?.ok) setAnnouncements(await res.json());
        setLoading(false);
    };

    const openAnnouncementModal = (announcement = null) => {
        setEditingAnnouncement(announcement);
        setAnnouncementMsg(''); 
        setModals(m => ({ ...m, announcement: true }));
    };

    const handleAnnouncementSubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = Object.fromEntries(fd.entries());

        // Convert duration to hours
        const hrs = data.unit === 'days' ? parseInt(data.duration) * 24 : parseInt(data.duration);

        const payload = {
            message: data.message,
            hours_duration: hrs,
            start_at: data.start_at || null,
            recurrence_type: data.recurrence
        };

        const url = editingAnnouncement ? `/api/admin/announcements/${editingAnnouncement.id}` : '/api/admin/announcements';
        const method = editingAnnouncement ? 'PUT' : 'POST';

        const res = await fetchWithAuth(url, { method, body: JSON.stringify(payload) });
        if (res?.ok) {
            notify({
                type: 'success',
                message: editingAnnouncement ? 'Announcement updated successfully.' : 'Announcement created successfully.'
            });
            setModals(m => ({ ...m, announcement: false }));
            loadAnnouncements();
        } else {
            const err = await res.json();
            const errorMsg = err.error || 'Failed to save announcement.';
            setAnnouncementMsg(errorMsg);
            notify({ type: 'error', message: errorMsg });
        }
    };

    const toggleAnnouncement = async (id, isActive) => {
        const res = await fetchWithAuth(`/api/admin/announcements/${id}`, {
            method: 'PUT', body: JSON.stringify({ is_active: isActive })
        });
        if (res?.ok) {
            notify({
                type: 'success',
                message: isActive ? 'Announcement activated successfully.' : 'Announcement paused successfully.'
            });
            loadAnnouncements();
        } else {
            const err = await res.json().catch(() => ({}));
            notify({ type: 'error', message: err.error || 'Failed to update announcement.' });
        }
    };

    const deleteAnnouncement = async (id) => {
        if (!await showConfirm("Delete this announcement?")) return;
        const res = await fetchWithAuth(`/api/admin/announcements/${id}`, { method: 'DELETE' });
        if (res?.ok) {
            notify({ type: 'success', message: 'Announcement deleted successfully.' });
            loadAnnouncements();
        } else {
            const err = await res.json().catch(() => ({}));
            notify({ type: 'error', message: err.error || 'Failed to delete announcement.' });
        }
    };

    // --- PDF MANAGEMENT ---
    const loadPdfStatus = async () => {
        const res = await fetchWithAuth('/api/admin/pdf/status');
        if (res?.ok) setPdfStatus(await res.json());
    };

    const handlePdfUpload = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target); // contains 'pdf' and 'description'
        // Using raw fetch for file upload
        const res = await fetch('/api/admin/pdf/upload', { method: 'POST', body: fd });
        if (res.ok) {
            notify({ type: 'success', message: 'PDF uploaded successfully.' });
            setModals(m => ({ ...m, pdfUpload: false }));
            loadPdfStatus();
        } else {
            const err = await res.json().catch(() => ({}));
            notify({ type: 'error', message: err.error || 'PDF upload failed.' });
        }
    };

    const deletePdf = async () => {
        if (!await showConfirm("Remove current PDF?")) return;
        const res = await fetchWithAuth('/api/admin/pdf', { method: 'DELETE' });
        if (res?.ok) {
            notify({ type: 'success', message: 'PDF deleted successfully.' });
            loadPdfStatus();
        } else {
            const err = await res.json().catch(() => ({}));
            notify({ type: 'error', message: err.error || 'Failed to delete PDF.' });
        }
    };

    // --- SETTINGS ---
    const loadSettings = async () => {
        const s1 = await fetchWithAuth('/api/admin/settings/trip-safety');
        const s2 = await fetchWithAuth('/api/admin/settings/external-emails');
        if (s1?.ok && s2?.ok) {
            setSettings({
                tripSafety: (await s1.json()).enabled,
                externalEmails: (await s2.json()).enabled
            });
        }
    };

    const toggleSetting = async (key) => {
        const newVal = !settings[key];
        const url = key === 'tripSafety' ? '/api/admin/settings/trip-safety' : '/api/admin/settings/external-emails';
        const res = await fetchWithAuth(url, { method: 'PUT', body: JSON.stringify({ enabled: newVal }) });
        if (res?.ok) {
            const settingName = key === 'tripSafety' ? 'Trip Safety' : 'External Emails';
            notify({
                type: 'success',
                message: `${settingName} ${newVal ? 'enabled' : 'disabled'} successfully.`
            });
            setSettings(prev => ({ ...prev, [key]: newVal }));
        } else {
            const err = await res.json().catch(() => ({}));
            notify({ type: 'error', message: err.error || 'Failed to update setting.' });
        }
    };

    // --- CHECK-INS ---
    const loadCheckInManagement = async () => {
        setLoading(true);
        const res = await fetchWithAuth('/api/admin/check-in-overview');
        if (res?.ok) setCheckInStats((await res.json()).trips);
        setLoading(false);
    };

    const processExpiredCheckIns = async () => {
        if (!await showConfirm("Move missed check-ins to waitlist?")) return;
        const res = await fetchWithAuth('/api/admin/process-missed-checkins', { method: 'POST' });
        if (res?.ok) {
            const data = await res.json();
            notify({ type: 'success', message: `Processed ${data.processed} user(s) successfully.` });
            loadCheckInManagement();
        } else {
            const err = await res.json().catch(() => ({}));
            notify({ type: 'error', message: err.error || 'Failed to process expired check-ins.' });
        }
    };

    const sendTripCheckInEmails = async (tripId) => {
        const trip = registrationData.trip;

        if (!trip.requires_checkin) {
            notify({ type: 'warning', message: 'This trip does not require 2-day check-in.' });
            return;
        }

        if (trip.checkin_emails_sent) {
            if (!await showConfirm("Check-in emails have already been sent for this trip. Send again?")) {
                return;
            }
        }

        const activeCount = registrationData.active.filter(r => !r.checked_in).length;
        if (activeCount === 0) {
            notify({ type: 'info', message: 'All active roster members have already checked in.' });
            return;
        }

        if (!await showConfirm(`Send check-in emails to ${activeCount} active roster member(s)?`)) {
            return;
        }

        setLoading(true);
        const res = await fetchWithAuth('/api/send-checkin-emails', {
            method: 'POST',
            body: JSON.stringify({ tripId })
        });

        setLoading(false);

        if (res?.ok) {
            const data = await res.json();
            notify({ type: 'success', message: data.message || `Check-in emails sent to ${data.emailsSent} members.` });
            viewRegistrations(tripId);
        } else {
            const err = await res.json().catch(() => ({}));
            notify({ type: 'error', message: err.error || 'Failed to send check-in emails.' });
        }
    };

    // --- ATTENDANCE SYSTEM (The Beast) ---
    const loadAttendanceSessions = async () => {
        setLoading(true);
        const res = await fetchWithAuth('/api/admin/attendance/sessions');
        if (res?.ok) setAttendanceSessions(await res.json());
        setLoading(false);
    };

    const handleStartAttendance = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const tripId = fd.get('trip_id');

        // Validation logic for "Mont Tremblant" requiring file
        const selectedTrip = trips.find(t => t.id == tripId);
        if (selectedTrip && selectedTrip.name.toLowerCase().includes('mont tremblant')) {
            const file = fd.get('excel_file');
            if (!file || file.name === '') {
                notify({ type: 'warning', message: 'Mont Tremblant requires the rooming list file.' });
                return;
            }
        }

        const res = await fetch('/api/admin/attendance/start-session', { method: 'POST', body: fd });
        if (res.ok) {
            const session = await res.json();
            notify({ type: 'success', message: 'Attendance session started successfully.' });
            setModals(m => ({ ...m, startAttendance: false }));
            viewActiveSession(session.id);
            loadAttendanceSessions();
        } else {
            const err = await res.json().catch(() => ({}));
            notify({ type: 'error', message: err.error || 'Failed to start attendance session.' });
        }
    };

    const viewActiveSession = (sessionId) => {
        setActiveSession(sessionId);
        switchTab('attendance');
        // Start polling
        pollAttendance(sessionId);
    };

    const pollAttendance = useCallback(async (sessionId) => {
        const fetchIt = async () => {
            const res = await fetchWithAuth(`/api/admin/attendance/session/${sessionId}`);
            if (res?.ok) {
                const data = await res.json();
                setLiveAttendanceData(data);
            }
        };
        fetchIt(); // Immediate
        if (attendanceIntervalRef.current) clearInterval(attendanceIntervalRef.current);
        attendanceIntervalRef.current = setInterval(fetchIt, 3000);
    }, [fetchWithAuth]);

    const endSession = async (sessionId) => {
        if (!await showConfirm("End this attendance session? QR will stop working.")) return;
        await fetchWithAuth(`/api/admin/attendance/end-session/${sessionId}`, { method: 'POST' });
        if (attendanceIntervalRef.current) clearInterval(attendanceIntervalRef.current);
        setActiveSession(null);
        loadAttendanceSessions();
    };

    const sendAttendanceEmails = async (sessionId) => {
        if (!await showConfirm("Send attendance confirmation emails to everyone on this bus?")) return;

        try {
            const res = await fetchWithAuth(`/api/admin/attendance/send-emails/${sessionId}`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                const message = `Sent ${data.emails_sent} email(s) successfully${data.emails_failed > 0 ? ` (${data.emails_failed} failed)` : ''}.`;
                notify({
                    type: data.emails_failed > 0 ? 'warning' : 'success',
                    message
                });
            } else {
                const error = await res.json();
                notify({ type: 'error', message: error.error || 'Failed to send emails.' });
            }
        } catch (err) {
            notify({ type: 'error', message: 'Failed to send attendance emails. Please try again.' });
        }
    };

    const toggleManualAttendance = async (regId, isPresent, e) => {
        // Optimistic update
        // We use a CSS class for "flash" animation
        const row = e.currentTarget;
        row.classList.remove('flash-manual-update');
        void row.offsetWidth; // force reflow
        row.classList.add('flash-manual-update');

        await fetchWithAuth(`/api/admin/registrations/${regId}/attendance`, {
            method: 'PUT', body: JSON.stringify({ physically_present: isPresent })
        });
        // Polling will sync eventually
    };
    
    // Bulk Delete Sessions
    const toggleSelectSession = (id) => {
        if (sessionSelection.includes(id)) setSessionSelection(sessionSelection.filter(s => s !== id));
        else setSessionSelection([...sessionSelection, id]);
    };

    const deleteSelectedSessions = async () => {
        if (sessionSelection.length === 0) return;
        if (!await showConfirm(`Delete ${sessionSelection.length} sessions?`)) return;

        const res = await fetchWithAuth('/api/admin/attendance/sessions', {
            method: 'DELETE', body: JSON.stringify({ ids: sessionSelection })
        });

        if (res?.ok) {
            notify({ type: 'success', message: `${sessionSelection.length} session(s) deleted successfully.` });
            setSessionSelection([]);
            loadAttendanceSessions();
        } else {
            const err = await res.json().catch(() => ({}));
            notify({ type: 'error', message: err.error || 'Failed to delete sessions.' });
        }
    };

    // Render Logic for Attendance List (Sorting & Fuzzy Match Visuals)
    const renderAttendanceList = () => {
        const { expected, checkins } = liveAttendanceData;
        
        // Handle case where data hasn't loaded yet
        if (!expected || !checkins) {
            return <div style={{padding: '30px', textAlign: 'center', color: 'var(--text-muted)'}}>Loading attendance data...</div>;
        }

        // Helper to normalize strings for matching
        const norm = str => str ? str.toLowerCase().trim() : '';

        // --- PASS 1: Build person status map with exact + fuzzy matching ---
        let availableCheckins = [...checkins];
        const personStatusMap = new Map(); // Key: registration_id or "first|last", Value: checkin object

        // Exact matches first
        for (let i = availableCheckins.length - 1; i >= 0; i--) {
            const chk = availableCheckins[i];
            const cFirst = norm(chk.first_name);
            const cLast = norm(chk.last_name);

            const exactMatch = expected.find(exp =>
                norm(exp.first_name) === cFirst && norm(exp.last_name) === cLast
            );

            if (exactMatch) {
                const key = exactMatch.registration_id || `${cFirst}|${cLast}`;
                if (!personStatusMap.has(key)) {
                    personStatusMap.set(key, chk);
                    availableCheckins.splice(i, 1);
                }
            }
        }

        // Fuzzy matches second
        for (let i = availableCheckins.length - 1; i >= 0; i--) {
            const chk = availableCheckins[i];
            const cFirst = norm(chk.first_name);
            const cLast = norm(chk.last_name);

            const candidates = expected.filter(exp => {
                const key = exp.registration_id || `${norm(exp.first_name)}|${norm(exp.last_name)}`;
                if (personStatusMap.has(key)) return false;

                const eFirst = norm(exp.first_name);
                const eLast = norm(exp.last_name);

                // Exact First, Partial Last
                if (eFirst === cFirst && eLast.startsWith(cLast)) return true;
                // Partial First, Exact Last
                if (eLast === cLast && eFirst.startsWith(cFirst) && cFirst.length >= 3) return true;
                // Partial First, Partial Last
                if (eFirst.startsWith(cFirst) && eLast.startsWith(cLast) && cFirst.length >= 3) return true;

                return false;
            });

            if (candidates.length === 1) {
                const match = candidates[0];
                const key = match.registration_id || `${norm(match.first_name)}|${norm(match.last_name)}`;
                chk._isFuzzyMatch = true;
                personStatusMap.set(key, chk);
                availableCheckins.splice(i, 1);
            } else if (candidates.length > 1) {
                chk._isAmbiguous = true;
            }
        }

        // --- BUILD DISPLAY LIST ---
        let displayList = expected.map(person => {
            const key = person.registration_id || `${norm(person.first_name)}|${norm(person.last_name)}`;
            const checkin = personStatusMap.get(key);
            const isPresent = !!checkin || !!person.physically_present;
            return { 
                ...person, 
                isPresent, 
                isFuzzy: checkin?._isFuzzyMatch || false,
                checkinData: checkin 
            };
        });

        // Search Filter
        if (attendanceSearch) {
            const s = attendanceSearch.toLowerCase();
            displayList = displayList.filter(p =>
                p.first_name?.toLowerCase().includes(s) ||
                p.last_name?.toLowerCase().includes(s) ||
                p.email?.toLowerCase().includes(s)
            );
        }

        // Sort: Present first, then Alphabetical
        displayList.sort((a, b) => {
            if (a.isPresent !== b.isPresent) return a.isPresent ? -1 : 1;
            return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
        });

        // --- RENDER ---
        const expectedRows = displayList.map(p => (
            <div
                key={p.registration_id || `${p.first_name}-${p.last_name}`}
                className={`attendance-list-item ${p.isPresent ? 'checked-in' : 'not-checked-in'}`}
                onClick={(e) => toggleManualAttendance(p.registration_id, !p.isPresent, e)}
                style={{justifyContent: 'flex-start', gap: '15px'}}
            >
                <div className="attendance-status" style={{width: '100px', flexShrink: 0}}>
                    <div className={`status-dot ${p.isPresent ? 'green' : 'red'}`}></div>
                    <span>{p.isPresent ? 'Present' : 'Not Here'}</span>
                </div>
                <div style={{display: 'flex', alignItems: 'center', flex: 1}}>
                    <input
                        type="checkbox"
                        checked={p.isPresent}
                        readOnly
                        style={{display: 'none'}}
                        className="attendance-checkbox"
                    />
                    <div>
                        <strong>{p.first_name} {p.last_name}</strong>
                        {p.isFuzzy && (
                            <i 
                                className="fas fa-magic" 
                                title={`Matched via name similarity (${p.checkinData?.first_name} ${p.checkinData?.last_name})`}
                                style={{color: 'var(--info-blue)', marginLeft: '8px', fontSize: '12px'}}
                            ></i>
                        )}
                    </div>
                </div>
            </div>
        ));

        // Unmatched / Ambiguous check-ins (people who scanned but couldn't be matched)
        const unmatchedRows = availableCheckins.length > 0 && (
            <>
                <div style={{padding: '10px', background: 'var(--danger-red)', borderTop: '1px solid var(--medium-gray)', fontWeight: 'bold', fontSize: '13px', color: 'white'}}>
                    Unmatched / Ambiguous
                </div>
                {availableCheckins.map((c, idx) => {
                    const label = c._isAmbiguous ? '(Ambiguous - Multiple Matches)' : '(Unmatched)';
                    const labelColor = c._isAmbiguous ? 'var(--umd-gold)' : 'rgba(255,255,255,0.8)';
                    return (
                        <div
                            key={`unmatched-${idx}`}
                            className="attendance-list-item checked-in"
                            style={{backgroundColor: 'rgba(220, 53, 69, 0.1)', justifyContent: 'flex-start', gap: '15px', borderLeft: '4px solid var(--danger-red)'}}
                        >
                            <div className="attendance-status" style={{width: '100px', flexShrink: 0}}>
                                <div className="status-dot green"></div>
                                <span>Present</span>
                            </div>
                            <div>
                                <strong>{c.first_name} {c.last_name}</strong>
                                <small style={{color: labelColor, marginLeft: '5px', fontWeight: 600}}>{label}</small>
                            </div>
                        </div>
                    );
                })}
            </>
        );

        // Empty state
        if (expectedRows.length === 0 && availableCheckins.length === 0) {
            return <div style={{padding: '30px', textAlign: 'center', color: 'var(--text-muted)'}}>Waiting for check-ins...</div>;
        }

        return (
            <>
                {expectedRows}
                {unmatchedRows}
            </>
        );
    };

    return (
        <div className="app-container">
            {/* --- SIDEBAR --- */}
            <div className={`sidebar ${sidebarActive ? 'active' : ''}`}>
                <div className="brand">
                    <i className="fas fa-snowflake"></i> <span>123 Ski Club</span>
                </div>
                <div className="nav-items">
                    <div className="menu-section-title">Main</div>
                    <a className={`menu-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => switchTab('dashboard')}>
                        <i className="fas fa-tachometer-alt"></i> <span>Dashboard</span>
                    </a>
                    <a className={`menu-item ${activeTab === 'users' ? 'active' : ''}`} onClick={() => switchTab('users')}>
                        <i className="fas fa-users"></i> <span>All Users</span>
                    </a>
                    <a className={`menu-item ${activeTab === 'admins' ? 'active' : ''}`} onClick={() => switchTab('admins')}>
                        <i className="fas fa-user-shield"></i> <span>All Admins</span>
                    </a>
                    <a className={`menu-item ${activeTab === 'checkins' ? 'active' : ''}`} onClick={() => switchTab('checkins')}>
                        <i className="fas fa-clipboard-check"></i> <span>Check-in Status</span>
                    </a>
                    <a className={`menu-item ${activeTab === 'attendance' ? 'active' : ''}`} onClick={() => switchTab('attendance')}>
                        <i className="fas fa-qrcode"></i> <span>Bus Attendance</span>
                    </a>

                    <div className="menu-section-title">Content</div>
                    <a className={`menu-item ${activeTab === 'announcements' ? 'active' : ''}`} onClick={() => switchTab('announcements')}>
                        <i className="fas fa-bullhorn"></i> <span>Announcements</span>
                    </a>
                    <a className={`menu-item ${activeTab === 'pdf' ? 'active' : ''}`} onClick={() => switchTab('pdf')}>
                        <i className="fas fa-file-pdf"></i> <span>PDF Management</span>
                    </a>

                    <div className="menu-section-title">System</div>
                    <a className={`menu-item ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => switchTab('logs')}>
                        <i className="fas fa-list-alt"></i> <span>Activity Logs</span>
                    </a>
                    <a className={`menu-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => switchTab('settings')}>
                        <i className="fas fa-cog"></i> <span>Settings</span>
                    </a>
                    <a href="/" className="menu-item">
                        <i className="fas fa-external-link-alt"></i> <span>Back to Site</span>
                    </a>
                </div>

                <div className="user-profile-sidebar">
                    <div className="avatar">AD</div>
                    <div className="user-info-text">
                        <strong>{currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : 'Admin'}</strong>
                        <small>Administrator</small>
                    </div>
                    <i className="fas fa-sign-out-alt logout-icon" onClick={() => fetch('/api/auth/logout', { method: 'POST' }).then(() => window.location.href = '/')}></i>
                </div>
            </div>

            {/* --- MAIN CONTENT --- */}
            <div className="main-content">
                <div className={`content-overlay ${sidebarActive ? 'active' : ''}`} onClick={() => setSidebarActive(false)}></div>

                <div className="top-bar">
                    <button className="sidebar-toggle" onClick={() => setSidebarActive(true)}>
                        <i className="fas fa-bars"></i>
                    </button>
                    <h1 className="page-title">{pageTitle}</h1>
                    <div className="theme-switcher">
                        <i className="fas fa-sun"></i>
                        <label className="switch">
                            <input type="checkbox" checked={theme === 'dark'} onChange={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')} />
                            <span className="slider round"></span>
                        </label>
                        <i className="fas fa-moon"></i>
                    </div>
                </div>

                {loading && <div className="loading"></div>}

                {/* --- DASHBOARD VIEW --- */}
                {activeTab === 'dashboard' && dashboardStats && (
                    <div className={`content-section ${fading ? 'fade-out' : 'fade-in'}`}>
                        <div className="dashboard-widgets">
                            <div className="widget-card">
                                <div className="widget-header"><div className="widget-title">Active Trips</div><div className="widget-icon"><i className="fas fa-mountain"></i></div></div>
                                <div className="widget-data"><div className="widget-value">{dashboardStats.activeTrips}</div><div className="widget-label">trips</div></div>
                            </div>
                            <div className="widget-card">
                                <div className="widget-header"><div className="widget-title">Total Users</div><div className="widget-icon"><i className="fas fa-user-check"></i></div></div>
                                <div className="widget-data"><div className="widget-value">{dashboardStats.totalUsers}</div><div className="widget-label">members</div></div>
                            </div>
                            <div className="widget-card">
                                <div className="widget-header"><div className="widget-title">Recent Registrations</div><div className="widget-icon"><i className="fas fa-clipboard-check"></i></div></div>
                                <div className="widget-data"><div className="widget-value">{dashboardStats.recentRegistrations?.length || 0}</div><div className="widget-label">this week</div></div>
                            </div>
                            <div className="widget-card">
                                <div className="widget-header"><div className="widget-title">New Users</div><div className="widget-icon"><i className="fas fa-user-plus"></i></div></div>
                                <div className="widget-data"><div className="widget-value">{dashboardStats.newUsersWeek || 0}</div><div className="widget-label">this week / {dashboardStats.newUsersMonth || 0} this month</div></div>
                            </div>
                        </div>

                        <div className="data-card">
                            <div className="data-header">
                                <div className="data-title">Manage Trips</div>
                                <div className="data-actions">
                                    <button className="btn btn-outline btn-sm" onClick={loadDashboardData}><i className="fas fa-refresh"></i> Refresh</button>
                                    <button className="btn btn-primary btn-sm" onClick={() => openTripModal(null)}><i className="fas fa-plus"></i> New Trip</button>
                                </div>
                            </div>
                            <div style={{overflowX: 'auto'}}>
                                {(() => {
                                    const today = new Date();
                                    today.setHours(0, 0, 0, 0);
                                    const currentTrips = trips.filter(t => {
                                        if (!t.trip_date) return true;
                                        const tripDate = new Date(t.trip_date);
                                        tripDate.setHours(0, 0, 0, 0);
                                        return tripDate >= today;
                                    });
                                    const pastTrips = trips.filter(t => {
                                        if (!t.trip_date) return false;
                                        const tripDate = new Date(t.trip_date);
                                        tripDate.setHours(0, 0, 0, 0);
                                        return tripDate < today;
                                    });

                                    return (
                                        <>
                                            <table className="data-table">
                                                <thead><tr><th>Trip Name</th><th>Destination</th><th>Date</th><th>Capacity</th><th>Status</th><th>Action</th></tr></thead>
                                                <tbody>
                                                    {trips.length === 0 ? (
                                                        <tr><td colSpan="6" style={{textAlign:'center'}}>No trips found.</td></tr>
                                                    ) : currentTrips.length === 0 && pastTrips.length > 0 ? (
                                                        <tr><td colSpan="6" style={{textAlign:'center'}}>No current trips.</td></tr>
                                                    ) : (
                                                        currentTrips.map(t => (
                                                            <tr key={t.id} className="clickable-row" onClick={() => viewRegistrations(t.id)}>
                                                                <td data-label="Trip"><strong>{t.name}</strong></td>
                                                                <td data-label="Destination">{t.destination}</td>
                                                                <td data-label="Date">{formatDate(t.trip_date)}</td>
                                                                <td data-label="Capacity">{t.registered_count}/{t.capacity}</td>
                                                                <td data-label="Status"><span className={`status-badge ${t.spots_remaining <= 0 ? 'status-full' : 'status-active'}`}>{t.spots_remaining <= 0 ? 'Full' : 'Open'}</span></td>
                                                                <td data-label="Action" onClick={e => e.stopPropagation()}>
                                                                    <button className="btn btn-outline btn-sm" onClick={() => openTripModal(t)}><i className="fas fa-edit"></i></button>
                                                                    <button className="btn btn-outline btn-sm" style={{borderColor:'var(--danger-red)', color:'var(--danger-red)'}} onClick={() => deleteTrip(t.id, t.name, t.registered_count)}><i className="fas fa-trash"></i></button>
                                                                </td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>

                                            {pastTrips.length > 0 && (
                                                <div style={{marginTop: '20px'}}>
                                                    <div
                                                        onClick={() => setPastTripsExpanded(!pastTripsExpanded)}
                                                        style={{
                                                            cursor: 'pointer',
                                                            padding: '12px',
                                                            background: 'var(--card-bg, #f8f9fa)',
                                                            borderRadius: '6px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '8px',
                                                            fontWeight: '600',
                                                            color: 'var(--text-primary)',
                                                            transition: 'background 0.2s'
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--hover-bg, #e9ecef)'}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--card-bg, #f8f9fa)'}
                                                    >
                                                        <i className={`fas fa-chevron-${pastTripsExpanded ? 'down' : 'right'}`} style={{fontSize: '12px'}}></i>
                                                        <span>Past Trips ({pastTrips.length})</span>
                                                    </div>

                                                    {pastTripsExpanded && (
                                                        <table className="data-table" style={{marginTop: '10px'}}>
                                                            <thead><tr><th>Trip Name</th><th>Destination</th><th>Date</th><th>Capacity</th><th>Status</th><th>Action</th></tr></thead>
                                                            <tbody>
                                                                {pastTrips.map(t => (
                                                                    <tr key={t.id} className="clickable-row" onClick={() => viewRegistrations(t.id)}>
                                                                        <td data-label="Trip"><strong>{t.name}</strong></td>
                                                                        <td data-label="Destination">{t.destination}</td>
                                                                        <td data-label="Date">{formatDate(t.trip_date)}</td>
                                                                        <td data-label="Capacity">{t.registered_count}/{t.capacity}</td>
                                                                        <td data-label="Status"><span className={`status-badge ${t.spots_remaining <= 0 ? 'status-full' : 'status-active'}`}>{t.spots_remaining <= 0 ? 'Full' : 'Open'}</span></td>
                                                                        <td data-label="Action" onClick={e => e.stopPropagation()}>
                                                                            <button className="btn btn-outline btn-sm" onClick={() => openTripModal(t)}><i className="fas fa-edit"></i></button>
                                                                            <button className="btn btn-outline btn-sm" style={{borderColor:'var(--danger-red)', color:'var(--danger-red)'}} onClick={() => deleteTrip(t.id, t.name, t.registered_count)}><i className="fas fa-trash"></i></button>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- USERS VIEW --- */}
                {activeTab === 'users' && (
                    <div className={`data-card ${fading ? 'fade-out' : 'fade-in'}`}>
                        <div className="data-header">
                            <div className="data-title">All Users</div>
                            <div className="data-actions">
                                <input type="text" placeholder="Search..." className="form-control" style={{width:'200px'}} value={userSearch} onChange={e => setUserSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadUsers(userSearch, 1)} />
                                <button className="btn btn-outline btn-sm" onClick={() => loadUsers(userSearch, 1)}><i className="fas fa-search"></i> Search</button>
                            </div>
                        </div>
                        <table className="data-table">
                            <thead><tr><th>Name</th><th>Email</th><th>Verified</th><th>Trips</th><th>Strikes</th><th>Actions</th></tr></thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id}>
                                        <td data-label="Name"><strong>{u.first_name} {u.last_name}</strong></td>
                                        <td data-label="Email">{u.email}</td>
                                        <td data-label="Verified">{u.is_verified ? <span className="status-badge status-active">✓</span> : 'No'}</td>
                                        <td data-label="Trips">{u.trip_count}</td>
                                        <td data-label="Strikes">
                                            {u.strike_count === 0 ? <span style={{color:'var(--success-green)'}}>0</span> : <span style={{color:'var(--danger-red)', fontWeight:'bold'}}>{u.strike_count}</span>}
                                        </td>
                                        <td data-label="Actions">
                                            <div style={{display:'flex', gap:'5px'}}>
                                                <button className="btn btn-sm btn-warning" onClick={() => handleStrike(u.id, u.email, 'add')} title="Add Strike"><i className="fas fa-plus"></i></button>
                                                {u.strike_count > 0 && <button className="btn btn-sm btn-success" onClick={() => handleStrike(u.id, u.email, 'remove')} title="Remove Strike"><i className="fas fa-minus"></i></button>}
                                                {u.strike_count > 0 && <button className="btn btn-sm btn-info" onClick={() => handleStrike(u.id, u.email, 'clear')} title="Clear All"><i className="fas fa-eraser"></i></button>}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div style={{marginTop:'15px', display:'flex', justifyContent:'space-between', borderTop:'1px solid #ddd', paddingTop:'10px'}}>
                             <div style={{fontSize:'13px', color:'var(--text-muted)'}}>Page {userPage} of {userPagination.pages} ({userPagination.total} total)</div>
                             <div style={{display:'flex', gap:'5px'}}>
                                 <button className="btn btn-outline btn-sm" disabled={userPage <= 1} onClick={() => loadUsers(userSearch, userPage - 1)}>Prev</button>
                                 <button className="btn btn-outline btn-sm" disabled={userPage >= userPagination.pages} onClick={() => loadUsers(userSearch, userPage + 1)}>Next</button>
                             </div>
                        </div>
                    </div>
                )}

                {/* --- ADMINS VIEW --- */}
                {activeTab === 'admins' && (
                    <div className={`data-card ${fading ? 'fade-out' : 'fade-in'}`}>
                        <div className="data-header">
                            <div className="data-title">Manage Admins</div>
                            <button className="btn btn-primary btn-sm" onClick={() => setModals(m => ({...m, addAdmin: true}))}><i className="fas fa-plus"></i> Add Admin</button>
                        </div>
                        <table className="data-table">
                            <thead><tr><th>Name</th><th>Email</th><th>Admin Since</th><th>Actions</th></tr></thead>
                            <tbody>
                                {admins.map(a => (
                                    <tr key={a.id}>
                                        <td><strong>{a.first_name} {a.last_name}</strong></td>
                                        <td>{a.email}</td>
                                        <td>{formatDate(a.created_at)}</td>
                                        <td><button className="action-btn" onClick={() => removeAdmin(a.id, a.email)}><i className="fas fa-user-minus"></i></button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* --- PDF VIEW --- */}
                {activeTab === 'pdf' && (
                    <div className={`data-card ${fading ? 'fade-out' : 'fade-in'}`}>
                        <div className="data-header">
                            <div className="data-title">Information Page PDF</div>
                            <button className="btn btn-primary btn-sm" onClick={() => setModals(m => ({...m, pdfUpload: true}))}><i className="fas fa-upload"></i> Upload</button>
                        </div>
                        <div id="pdfStatus">
                            {pdfStatus && pdfStatus.exists ? (
                                <div style={{padding:'20px', background:'var(--subtle-bg)', borderRadius:'8px'}}>
                                    <div style={{display:'flex', justifyContent:'space-between'}}>
                                        <h4 style={{color:'var(--success-green)'}}><i className="fas fa-check-circle"></i> PDF Active</h4>
                                        <button className="btn btn-danger btn-sm" onClick={deletePdf}><i className="fas fa-trash"></i> Remove</button>
                                    </div>
                                    <div style={{fontSize:'14px', marginTop:'10px'}}>
                                        <p><strong>Uploaded:</strong> {formatDateTime(pdfStatus.uploadedAt)}</p>
                                        <p><strong>Description:</strong> {pdfStatus.description}</p>
                                        <p><strong>Size:</strong> {(pdfStatus.size / 1024 / 1024).toFixed(2)} MB</p>
                                    </div>
                                </div>
                            ) : (
                                <div style={{padding:'20px', background: 'rgba(220, 53, 69, 0.1)', color: 'var(--danger-red)', borderRadius:'8px', textAlign:'center', border: '1px solid rgba(220, 53, 69, 0.3)'}}>
                                    <i className="fas fa-exclamation-triangle"></i> No PDF Uploaded. Info page will show error.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* --- ACTIVITY LOGS VIEW --- */}
                {activeTab === 'logs' && (
                    <div className={`data-card ${fading ? 'fade-out' : 'fade-in'}`}>
                        <div className="data-header">
                            <div className="data-title">Activity Logs</div>
                            <button className="btn btn-outline btn-sm" onClick={() => loadLogs(1)}><i className="fas fa-refresh"></i> Refresh</button>
                        </div>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Time (EST)</th>
                                    <th>User</th>
                                    <th>Trip</th>
                                    <th>Action</th>
                                    <th>Description</th>
                                    <th>Performed By</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.length === 0 ? (
                                    <tr><td colSpan="6" style={{textAlign:'center',padding:'40px',color:'#999'}}>No logs found</td></tr>
                                ) : (
                                    logs.map(log => (
                                        <tr key={log.id}>
                                            <td style={{whiteSpace:'nowrap'}}>
                                                {new Date(log.timestamp_est).toLocaleString('en-US', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    year: 'numeric',
                                                    hour: 'numeric',
                                                    minute: '2-digit',
                                                    hour12: true
                                                })}
                                            </td>
                                            <td>
                                                {log.user_first_name && log.user_last_name
                                                    ? `${log.user_first_name} ${log.user_last_name}`
                                                    : log.user_email || 'N/A'}
                                            </td>
                                            <td>{log.trip_name || 'N/A'}</td>
                                            <td>
                                                <span className={`status-badge ${
                                                    log.action_type === 'CHECKED_IN' ? 'status-open' :
                                                    log.action_type === 'PROMOTED_FROM_WAITLIST' || log.action_type === 'MANUALLY_PROMOTED' ? 'status-success' :
                                                    log.action_type === 'MOVED_TO_WAITLIST' ? 'status-warning' :
                                                    log.action_type === 'CANCELLED_REGISTRATION' || log.action_type === 'ADMIN_REMOVED' ? 'status-error' :
                                                    'status-closed'
                                                }`}>
                                                    {log.action_type.replace(/_/g, ' ')}
                                                </span>
                                            </td>
                                            <td>{log.description}</td>
                                            <td>
                                                {log.admin_first_name && log.admin_last_name
                                                    ? `${log.admin_first_name} ${log.admin_last_name}`
                                                    : log.admin_email || 'System'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                        {logsPagination.pages > 1 && (
                            <div className="pagination">
                                <button
                                    disabled={logsPage === 1}
                                    onClick={() => { setLogsPage(logsPage - 1); loadLogs(logsPage - 1); }}>
                                    Previous
                                </button>
                                <span>Page {logsPage} of {logsPagination.pages}</span>
                                <button
                                    disabled={logsPage === logsPagination.pages}
                                    onClick={() => { setLogsPage(logsPage + 1); loadLogs(logsPage + 1); }}>
                                    Next
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* --- SETTINGS VIEW --- */}
                {activeTab === 'settings' && (
                    <div className={`data-card ${fading ? 'fade-out' : 'fade-in'}`}>
                         <div className="data-header"><div className="data-title">Trip Safety Settings</div></div>
                         <div style={{padding:'20px'}}>
                            <div className="toggle-wrapper">
                                <div><div className="toggle-label">Trip Safety</div><span className="toggle-desc">Prevent deleting trips with registrations</span></div>
                                <label className="toggle-switch"><input type="checkbox" checked={settings.tripSafety} onChange={() => toggleSetting('tripSafety')} /><span className="toggle-slider"></span></label>
                            </div>
                            <div className="toggle-wrapper">
                                <div><div className="toggle-label">External Emails</div><span className="toggle-desc">Allow non-edu emails to register</span></div>
                                <label className="toggle-switch"><input type="checkbox" checked={settings.externalEmails} onChange={() => toggleSetting('externalEmails')} /><span className="toggle-slider"></span></label>
                            </div>
                         </div>
                    </div>
                )}

                {/* --- CHECKINS VIEW --- */}
                {activeTab === 'checkins' && (
                    <div className={`data-card ${fading ? 'fade-out' : 'fade-in'}`}>
                        <div className="data-header">
                            <div className="data-title">Check-in Status</div>
                            <button className="btn btn-outline btn-sm" onClick={processExpiredCheckIns}><i className="fas fa-sync"></i> Process Expired</button>
                        </div>
                        <table className="data-table">
                            <thead><tr><th>Trip</th><th>Date</th><th>Check-in Status</th><th>Total</th><th>Checked In</th><th>Pending</th><th>Missed</th><th>Action</th></tr></thead>
                            <tbody>
                                {checkInStats.map(t => {
                                    const checkInStatus = getCheckInStatus(t.trip_date);
                                    return (
                                        <tr key={t.id}>
                                            <td>{t.name}</td>
                                            <td>{formatDate(t.trip_date)}</td>
                                            <td>
                                                <span className={`status-badge status-${checkInStatus.status}`}>
                                                    {checkInStatus.text}
                                                </span>
                                            </td>
                                            <td>{t.total_registered}</td>
                                            <td>{t.checked_in}</td>
                                            <td>{t.pending_check_in}</td>
                                            <td>{t.missed_check_in}</td>
                                            <td><button className="action-btn" onClick={() => viewRegistrations(t.id)}><i className="fas fa-list"></i></button></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* --- ANNOUNCEMENTS VIEW --- */}
                {activeTab === 'announcements' && (
                    <div className={`data-card ${fading ? 'fade-out' : 'fade-in'}`}>
                        <div className="data-header">
                            <div className="data-title">Site Announcements</div>
                            <button className="btn btn-primary btn-sm" onClick={() => openAnnouncementModal(null)}><i className="fas fa-plus"></i> Create</button>
                        </div>
                        <table className="data-table">
                             <thead><tr><th>Message</th><th>Start</th><th>Expires</th><th>Recurrence</th><th>Status</th><th>Actions</th></tr></thead>
                             <tbody>
                                 {announcements.map(a => (
                                     <tr key={a.id}>
                                         <td>{a.message.substring(0, 50)}...</td>
                                         <td>{formatDateTime(a.start_at)}</td>
                                         <td>{formatDateTime(a.expires_at)}</td>
                                         <td>{a.recurrence_type}</td>
                                         <td>{a.is_active ? <span className="status-badge status-active">Active</span> : <span className="status-badge status-inactive">Inactive</span>}</td>
                                         <td>
                                             <button className="action-btn" onClick={() => openAnnouncementModal(a)}><i className="fas fa-edit"></i></button>
                                             <button className="action-btn" onClick={() => toggleAnnouncement(a.id, !a.is_active)}><i className={`fas fa-${a.is_active ? 'pause' : 'play'}`}></i></button>
                                             <button className="action-btn" onClick={() => deleteAnnouncement(a.id)}><i className="fas fa-trash"></i></button>
                                         </td>
                                     </tr>
                                 ))}
                             </tbody>
                        </table>
                    </div>
                )}

                {/* --- ATTENDANCE VIEW --- */}
                {activeTab === 'attendance' && (
                    <div className={`content-section ${fading ? 'fade-out' : 'fade-in'}`}>
                        {!activeSession ? (
                            <>
                                <div className="data-card">
                                    <div className="data-header">
                                        <div className="data-title">QR Code Attendance System</div>
                                        <button className="btn btn-primary btn-sm" onClick={() => setModals(m => ({...m, startAttendance: true}))}><i className="fas fa-play"></i> Start New Session</button>
                                    </div>
                                    <div className="empty-state" style={{textAlign:'center', padding:'40px', color:'var(--text-muted)'}}>
                                        <i className="fas fa-clipboard-check" style={{fontSize:'48px', marginBottom:'20px', opacity:0.5}}></i>
                                        <p style={{fontSize:'18px'}}>No active attendance session</p>
                                    </div>
                                </div>
                                <div className="data-card">
                                    <div className="data-header collapsible-header" onClick={() => setAttendanceHistoryExpanded(!attendanceHistoryExpanded)}>
                                        <div className="data-title">Recent Sessions</div>
                                        <i className={`fas fa-chevron-down chevron-icon ${attendanceHistoryExpanded ? 'rotated' : ''}`}></i>
                                    </div>
                                    {attendanceHistoryExpanded && (
                                        <>
                                            {sessionSelection.length > 0 && (
                                                <div style={{padding:'10px', background:'var(--subtle-bg)', display:'flex', justifyContent:'flex-end', marginBottom:'10px'}}>
                                                    <button className="btn btn-danger btn-sm" onClick={deleteSelectedSessions}>Delete Selected ({sessionSelection.length})</button>
                                                </div>
                                            )}
                                            <table className="data-table">
                                                <thead><tr><th><input type="checkbox" className="table-checkbox" onChange={(e) => {
                                                    if (e.target.checked) setSessionSelection(attendanceSessions.map(s => s.id));
                                                    else setSessionSelection([]);
                                                }} /></th><th>Trip</th><th>Bus</th><th>Created</th><th>Status</th><th>Count</th></tr></thead>
                                                <tbody>
                                                    {attendanceSessions.map(s => (
                                                        <tr key={s.id} className="clickable-row" onClick={() => s.is_active ? viewActiveSession(s.id) : null}>
                                                            <td onClick={e=>e.stopPropagation()}><input type="checkbox" className="table-checkbox" checked={sessionSelection.includes(s.id)} onChange={() => toggleSelectSession(s.id)} /></td>
                                                            <td>{s.trip_name}</td>
                                                            <td>Bus {s.bus_number}</td>
                                                            <td>{formatDateTime(s.created_at)}</td>
                                                            <td>{s.is_active ? <span className="status-badge status-active">Active</span> : 'Ended'}</td>
                                                            <td>{s.checkin_count}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div style={{display:'flex', flexDirection:'column', gap:'30px'}}>
                                <div className="session-info">
                                    <div className="session-info-grid">
                                        <div className="session-info-item"><div className="session-info-label">Trip</div><div className="session-info-value">{liveAttendanceData.trip.name}</div></div>
                                        <div className="session-info-item"><div className="session-info-label">Bus</div><div className="session-info-value">{liveAttendanceData.session.bus_number}</div></div>
                                        <div className="session-info-item"><div className="session-info-label">Progress</div><div className="session-info-value">{liveAttendanceData.checkins.length} / {liveAttendanceData.expected.length}</div></div>
                                    </div>
                                </div>
                                
                                <div className="qr-display">
                                    <h3>Bus {liveAttendanceData.session.bus_number} Check-in</h3>
                                    <div className="qr-wrapper">
                                        <img src={`/api/admin/attendance/qr/${liveAttendanceData.session.qr_token}`} alt="QR Code" />
                                        <div className="qr-logo-overlay"><i className="fas fa-snowflake"></i></div>
                                    </div>
                                    <p style={{marginTop:'15px', color:'var(--text-muted)'}}>Scan to check in</p>
                                    <a href={`/api/admin/attendance/qr/${liveAttendanceData.session.qr_token}`} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{marginTop:'10px'}}><i className="fas fa-expand"></i> Expand</a>
                                </div>

                                <div>
                                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
                                        <h3>Live Attendance List</h3>
                                        <div style={{display:'flex', gap:'10px'}}>
                                            <input type="text" placeholder="Filter..." className="form-control" style={{width:'150px'}} value={attendanceSearch} onChange={e=>setAttendanceSearch(e.target.value)} />
                                            <button className="btn btn-primary btn-sm" onClick={() => sendAttendanceEmails(activeSession)}><i className="fas fa-envelope"></i> Send Emails</button>
                                            <button className="btn btn-danger btn-sm" onClick={() => endSession(activeSession)}><i className="fas fa-stop"></i> End Session</button>
                                        </div>
                                    </div>
                                    <div className="attendance-list" id="liveAttendanceList">
                                        {renderAttendanceList()}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                
                 <div className="dashboard-footer">Built by a student, for students • Mason Doan</div>
            </div>

            {/* --- MODALS SECTION --- */}

            {/* 1. Trip Modal */}
            <div className={`modal-overlay ${modals.trip ? 'active' : ''}`} onClick={(e) => e.target === e.currentTarget && setModals(m => ({...m, trip: false}))}>
                <div className="modal">
                    <div className="modal-header">
                        <h3 className="modal-title">{editingTrip ? 'Edit Trip' : 'New Trip'}</h3>
                        <button className="modal-close" onClick={() => setModals(m => ({...m, trip: false}))}>×</button>
                    </div>
                    <form onSubmit={handleTripSubmit} ref={tripFormRef}>
                        <div className="modal-body">
                            {tripModalMsg && <div className="message error">{tripModalMsg}</div>}
                            <div className="form-group">
                                <label className="form-label">Trip Name *</label>
                                <input name="name" className="form-control" defaultValue={editingTrip?.name} required />
                            </div>
                            <div className="form-row">
                                <div className="form-group"><label className="form-label">Destination</label><input name="destination" className="form-control" defaultValue={editingTrip?.destination} required /></div>
                                <div className="form-group"><label className="form-label">Date</label><input name="trip_date" type="date" className="form-control" defaultValue={editingTrip?.trip_date?.split('T')[0]} required /></div>
                            </div>
                            <div className="form-group"><label className="form-label">Description</label><textarea name="description" className="form-control" defaultValue={editingTrip?.description}></textarea></div>
                            <div className="form-row">
                                <div className="form-group"><label className="form-label">Departure Time</label><input name="departure_time" type="datetime-local" className="form-control" defaultValue={toLocalDateTimeString(editingTrip?.departure_time)} required /></div>
                                <div className="form-group"><label className="form-label">Departure Location</label><input name="departure_info" className="form-control" defaultValue={editingTrip?.departure_info || 'Regents Garage'} placeholder="e.g., Regents Garage" required /></div>
                            </div>
                            <div className="form-row">
                                <div className="form-group"><label className="form-label">Return Info</label><input name="return_info" className="form-control" defaultValue={editingTrip?.return_info || '7:00 PM'} placeholder="e.g., 7:00 PM" /></div>
                                <div className="form-group"><label className="form-label">Capacity</label><input name="capacity" type="number" className="form-control" defaultValue={editingTrip?.capacity || 54} /></div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Image URL</label>
                                <input name="image_url" className="form-control" defaultValue={editingTrip?.image_url} />
                            </div>
                             <div className="form-group">
                                <label className="form-label">Registration Opens (Optional)</label>
                                <input name="registration_opens_at" type="datetime-local" className="form-control" defaultValue={toLocalDateTimeString(editingTrip?.registration_opens_at)} />
                            </div>
                            
                            {/* Toggles */}
                            <div className="toggle-wrapper">
                                <div><div className="toggle-label">Require 2-Day Check-In</div></div>
                                <label className="toggle-switch"><input name="requires_checkin" type="checkbox" defaultChecked={editingTrip ? editingTrip.requires_checkin : true} /><span className="toggle-slider"></span></label>
                            </div>
                             <div className="toggle-wrapper">
                                <div><div className="toggle-label">Ask Standard Questions</div></div>
                                <label className="toggle-switch"><input name="ask_default_questions" type="checkbox" defaultChecked={editingTrip ? editingTrip.ask_default_questions : true} /><span className="toggle-slider"></span></label>
                            </div>

                            {/* Waiver Upload */}
                            <div className="form-section-title">
                                <i className="fas fa-file-contract"></i> Trip Waiver
                            </div>
                            <div style={{padding: '15px', background: 'var(--subtle-bg)', borderRadius: '8px', border: '1px solid var(--medium-gray)'}}>
                                {editingTrip ? (
                                    // EXISTING TRIP LOGIC
                                    editingTrip.waiver_pdf_path ? (
                                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                            <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                                <i className="fas fa-file-pdf" style={{fontSize:'24px', color:'var(--umd-red)'}}></i>
                                                <div>
                                                    <div style={{fontSize:'14px', fontWeight:'600', color:'var(--text-primary)'}}>Current Waiver Active</div>
                                                    <a href={`/public_uploads/${editingTrip.waiver_pdf_path}`} target="_blank" rel="noreferrer" style={{fontSize:'12px', color:'var(--info-blue)', textDecoration:'none'}}>View Document</a>
                                                </div>
                                            </div>
                                            <button type="button" className="btn btn-sm btn-danger" onClick={async () => {
                                                if(!confirm('Delete waiver?')) return;
                                                const res = await fetchWithAuth(`/api/admin/trips/${editingTrip.id}/waiver`, {method:'DELETE'});
                                                if(res.ok) {
                                                    setEditingTrip({...editingTrip, waiver_pdf_path: null});
                                                    loadDashboardData();
                                                }
                                            }}><i className="fas fa-trash"></i> Remove</button>
                                        </div>
                                    ) : (
                                        <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                                            <div className="file-input-wrapper">
                                                <input type="file" id="waiver_upload" accept=".pdf" onChange={async (e) => {
                                                    if(e.target.files?.[0]) {
                                                        const fd = new FormData();
                                                        fd.append('waiver', e.target.files[0]);
                                                        const res = await fetch(`/api/admin/trips/${editingTrip.id}/waiver`, {method:'POST', body: fd});
                                                        if(res.ok) {
                                                            const d = await res.json();
                                                            notify({ type: 'success', message: 'Waiver uploaded successfully.' });
                                                            setEditingTrip({...editingTrip, waiver_pdf_path: d.waiver_pdf_path});
                                                            loadDashboardData();
                                                        } else {
                                                            const err = await res.json().catch(() => ({}));
                                                            notify({ type: 'error', message: err.error || 'Waiver upload failed.' });
                                                        }
                                                    }
                                                }} />
                                                <label htmlFor="waiver_upload" className="file-input-label" style={{background:'var(--umd-red)'}}><i className="fas fa-upload"></i> Upload Waiver</label>
                                            </div>
                                            <span style={{fontSize:'12px', color:'var(--text-muted)'}}>Max 200MB .PDF</span>
                                        </div>
                                    )
                                ) : (
                                    // NEW TRIP LOGIC
                                    <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                                        <div className="file-input-wrapper">
                                            <input type="file" id="new_waiver_upload" accept=".pdf" onChange={(e) => {
                                                if (e.target.files?.[0]) {
                                                    setPendingWaiver(e.target.files[0]);
                                                }
                                            }} />
                                            <label htmlFor="new_waiver_upload" className="file-input-label" style={{background: pendingWaiver ? 'var(--success-green)' : 'var(--dark-gray)'}}>
                                                <i className={`fas fa-${pendingWaiver ? 'check' : 'plus'}`}></i> {pendingWaiver ? 'Waiver Selected' : 'Select Waiver'}
                                            </label>
                                        </div>
                                        {pendingWaiver ? (
                                            <span style={{fontSize:'12px', color:'var(--success-green)', fontWeight:'600'}}>{pendingWaiver.name}</span>
                                        ) : (
                                            <span style={{fontSize:'12px', color:'var(--text-muted)'}}>Optional - Upload on save</span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Custom Questions */}
                            <div className="custom-q-box">
                                <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}>
                                    <label>Custom Questions</label>
                                    <button type="button" className="btn btn-sm btn-outline" onClick={addQuestion}>+ Add</button>
                                </div>
                                {customQuestions.map((q, idx) => (
                                    <div key={idx} className="question-card">
                                        <div className="question-header">
                                            <span className="question-number">Q{idx+1}</span>
                                            <div className="question-actions"><button type="button" onClick={() => removeQ(idx)}><i className="fas fa-trash"></i></button></div>
                                        </div>
                                        <div className="question-body">
                                            <div className="question-inline">
                                                <input className="form-control" placeholder="Question Text" value={q.question_text} onChange={e => updateQ(idx, 'question_text', e.target.value)} />
                                                <select className="form-control" value={q.question_type} onChange={e => updateQ(idx, 'question_type', e.target.value)}>
                                                    <option value="text">Text</option><option value="dropdown">Dropdown</option>
                                                </select>
                                            </div>
                                            {q.question_type === 'dropdown' && (
                                                <div className="dropdown-options-container">
                                                    {q.dropdown_options?.map((opt, oIdx) => (
                                                        <div key={oIdx} className="dropdown-option-item">
                                                            <input className="form-control" value={opt} onChange={e => updateOption(idx, oIdx, e.target.value)} placeholder={`Option ${oIdx+1}`} />
                                                            <button type="button" onClick={() => removeOption(idx, oIdx)}><i className="fas fa-times"></i></button>
                                                        </div>
                                                    ))}
                                                    <button type="button" className="add-option-btn" onClick={() => addOption(idx)}>+ Option</button>
                                                </div>
                                            )}
                                            <div className="checkbox-inline">
                                                <input type="checkbox" checked={q.is_required} onChange={e => updateQ(idx, 'is_required', e.target.checked)} />
                                                <label>Required</label>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-outline" onClick={() => setModals(m => ({...m, trip: false}))}>Cancel</button>
                            <button type="submit" className="btn btn-primary">Save Trip</button>
                        </div>
                    </form>
                </div>
            </div>

            {/* 2. Registrations Modal - Compact Design */}
            <div className={`modal-overlay ${modals.registrations ? 'active' : ''}`} onClick={(e) => e.target === e.currentTarget && setModals(m => ({...m, registrations: false}))}>
                <div className="modal registrations-modal-content" style={{width:'95vw', maxWidth:'1400px', height:'85vh', maxHeight:'85vh', display:'flex', flexDirection:'column'}}>
                    {/* Compact Header with Actions */}
                    <div className="registrations-modal-header" style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 24px', borderBottom:'1px solid var(--medium-gray)', flexShrink:0}}>
                        <h2 style={{margin:0, fontSize:'24px', fontWeight:'700', color:'var(--text-primary)'}}>
                            Registrations: {registrationData.trip.name}
                        </h2>
                        <div className="registrations-modal-actions" style={{display:'flex', gap:'12px', alignItems:'center'}}>
                            {registrationData.trip.requires_checkin && (
                                <button
                                    className={`btn btn-sm ${registrationData.trip.checkin_emails_sent ? 'btn-secondary' : 'btn-info'}`}
                                    onClick={() => sendTripCheckInEmails(selectedRegistrationTripId)}
                                    style={{fontSize:'13px', padding:'6px 12px'}}
                                    title={registrationData.trip.checkin_emails_sent ? 'Check-in emails already sent' : 'Send check-in emails to active roster'}
                                >
                                    <i className="fas fa-envelope" style={{marginRight:'6px'}}></i>
                                    {registrationData.trip.checkin_emails_sent ? 'Resend Check-In Emails' : 'Send Check-In Emails'}
                                </button>
                            )}
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={() => {
                                    setShowAddPerson(!showAddPerson);
                                    if (!showAddPerson) {
                                        setAddPersonSearch('');
                                        setAddPersonResults([]);
                                    }
                                }}
                                style={{fontSize:'13px', padding:'6px 12px'}}
                            >
                                <i className="fas fa-user-plus" style={{marginRight:'6px'}}></i>
                                {showAddPerson ? 'Cancel' : 'Add Person'}
                            </button>
                            <button
                                className="btn btn-success btn-sm"
                                onClick={() => setShowGiveaway(!showGiveaway)}
                                style={{fontSize:'13px', padding:'6px 12px'}}
                            >
                                <i className="fas fa-gift" style={{marginRight:'6px'}}></i>
                                Prize Giveaway
                            </button>
                            <button className="modal-close" onClick={() => setModals(m => ({...m, registrations: false}))}>×</button>
                        </div>
                    </div>

                    {/* Compact Stats Row */}
                    <div className="stats-container" style={{display:'grid', gridTemplateColumns: registrationData.trip.requires_checkin ? '1fr 1fr 1fr' : '1fr 1fr', gap:'16px', padding:'12px 24px', background:'var(--subtle-bg)', borderBottom:'1px solid var(--medium-gray)', flexShrink:0}}>
                        <div className="stat-card" style={{padding:'12px 16px', background:'white', borderRadius:'8px', border:'1px solid var(--medium-gray)'}}>
                            <div className="stat-label" style={{fontSize:'11px', fontWeight:'600', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'4px'}}>Capacity</div>
                            <div className="stat-value" style={{fontSize:'24px', fontWeight:'700', color:'var(--text-primary)'}}>
                                {registrationData.active.length} / {registrationData.trip.capacity}
                            </div>
                        </div>
                        <div className="stat-card" style={{padding:'12px 16px', background:'white', borderRadius:'8px', border:'1px solid var(--medium-gray)'}}>
                            <div className="stat-label" style={{fontSize:'11px', fontWeight:'600', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'4px'}}>Waitlist</div>
                            <div className="stat-value" style={{fontSize:'24px', fontWeight:'700', color:'var(--warning-yellow)'}}>
                                {registrationData.waitlist.length}
                            </div>
                        </div>
                        {registrationData.trip.requires_checkin && (
                            <div className="stat-card" style={{padding:'12px 16px', background:'white', borderRadius:'8px', border:'1px solid var(--medium-gray)'}}>
                                <div className="stat-label" style={{fontSize:'11px', fontWeight:'600', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'4px'}}>2-Day Check-In</div>
                                <div className="stat-value" style={{fontSize:'16px', fontWeight:'700', color: registrationData.trip.checkin_emails_sent ? 'var(--success-green)' : 'var(--text-muted)'}}>
                                    {registrationData.trip.checkin_emails_sent ? (
                                        <>
                                            <i className="fas fa-check-circle" style={{marginRight:'6px'}}></i>
                                            Emails Sent
                                        </>
                                    ) : (
                                        <>
                                            <i className="fas fa-clock" style={{marginRight:'6px'}}></i>
                                            Not Sent
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Add Person Expandable Section */}
                    {showAddPerson && (
                        <div style={{padding:'12px 24px', backgroundColor:'var(--hover-bg)', borderBottom:'1px solid var(--medium-gray)', flexShrink:0}}>
                            <div className="form-group" style={{marginBottom:'10px'}}>
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Search by name or email..."
                                    value={addPersonSearch}
                                    onChange={(e) => {
                                        setAddPersonSearch(e.target.value);
                                        searchUsersForAdd(e.target.value);
                                    }}
                                    style={{width:'100%'}}
                                />
                            </div>

                            {addPersonLoading && (
                                <div style={{textAlign:'center', padding:'10px', color:'var(--text-muted)'}}>
                                    <i className="fas fa-spinner fa-spin"></i> Searching...
                                </div>
                            )}

                            {!addPersonLoading && addPersonResults.length > 0 && (
                                <div style={{maxHeight:'200px', overflowY:'auto', border:'1px solid var(--medium-gray)', borderRadius:'4px', backgroundColor:'var(--umd-white)'}}>
                                    {addPersonResults.map(user => (
                                        <div
                                            key={user.id}
                                            style={{
                                                padding:'10px 15px',
                                                borderBottom:'1px solid var(--medium-gray)',
                                                display:'flex',
                                                justifyContent:'space-between',
                                                alignItems:'center',
                                                cursor:'pointer',
                                                backgroundColor:'var(--umd-white)',
                                                transition:'background-color 0.2s'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--umd-white)'}
                                        >
                                            <div>
                                                <div style={{fontWeight:'600', color:'var(--text-primary)'}}>{user.first_name} {user.last_name}</div>
                                                <div style={{fontSize:'12px', color:'var(--text-muted)'}}>{user.email}</div>
                                            </div>
                                            <button
                                                className="btn btn-success btn-sm"
                                                onClick={() => manuallyAddPerson(user.id)}
                                                style={{padding:'5px 12px', fontSize:'12px'}}
                                            >
                                                <i className="fas fa-plus" style={{marginRight:'5px'}}></i>
                                                Add
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {!addPersonLoading && addPersonSearch.length >= 2 && addPersonResults.length === 0 && (
                                <div style={{textAlign:'center', padding:'15px', color:'var(--text-muted)', fontSize:'14px'}}>
                                    No users found matching "{addPersonSearch}"
                                </div>
                            )}

                            {addPersonSearch.length > 0 && addPersonSearch.length < 2 && (
                                <div style={{textAlign:'center', padding:'15px', color:'var(--text-muted)', fontSize:'13px'}}>
                                    Type at least 2 characters to search
                                </div>
                            )}
                        </div>
                    )}

                    {/* Giveaway Expandable Section */}
                    {showGiveaway && (
                        <div style={{padding:'12px 24px', backgroundColor:'var(--hover-bg)', borderBottom:'1px solid var(--medium-gray)', flexShrink:0}}>
                            <p style={{fontSize:'13px', color:'var(--text-muted)', marginBottom:'12px'}}>
                                Randomly select winners from active registrations. Winners will be marked with badges.
                            </p>
                            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px'}}>
                                <div className="form-group" style={{marginBottom:'0'}}>
                                    <label className="form-label" style={{fontSize:'12px', fontWeight:'600', marginBottom:'4px'}}>
                                        <i className="fas fa-snowboard" style={{marginRight:'5px', color:'#ff6b6b'}}></i>
                                        Rental Prizes
                                    </label>
                                    <input
                                        type="number"
                                        className="form-control"
                                        min="0"
                                        value={rentalPrizeCount}
                                        onChange={(e) => setRentalPrizeCount(Math.max(0, parseInt(e.target.value) || 0))}
                                        onFocus={(e) => e.target.select()}
                                        placeholder="Number of rental prizes"
                                    />
                                </div>
                                <div className="form-group" style={{marginBottom:'0'}}>
                                    <label className="form-label" style={{fontSize:'12px', fontWeight:'600', marginBottom:'4px'}}>
                                        <i className="fas fa-ticket-alt" style={{marginRight:'5px', color:'#4ecdc4'}}></i>
                                        Lift Ticket Prizes
                                    </label>
                                    <input
                                        type="number"
                                        className="form-control"
                                        min="0"
                                        value={ticketPrizeCount}
                                        onChange={(e) => setTicketPrizeCount(Math.max(0, parseInt(e.target.value) || 0))}
                                        onFocus={(e) => e.target.select()}
                                        placeholder="Number of lift ticket prizes"
                                    />
                                </div>
                            </div>
                            <button
                                className="btn btn-success"
                                onClick={runGiveaway}
                                disabled={giveawayLoading || (rentalPrizeCount === 0 && ticketPrizeCount === 0)}
                                style={{width:'100%', padding:'8px'}}
                            >
                                {giveawayLoading ? (
                                    <><i className="fas fa-spinner fa-spin" style={{marginRight:'8px'}}></i>Running Giveaway...</>
                                ) : (
                                    <><i className="fas fa-gift" style={{marginRight:'8px'}}></i>Run Giveaway</>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Scrollable Rosters Container */}
                    <div className="rosters-container" style={{flex:1, overflowY:'auto', padding:'16px 24px'}}>
                        {/* Active Roster */}
                        <div className="roster-section" style={{marginBottom:'24px'}}>
                            <h4 style={{fontSize:'14px', fontWeight:'700', marginBottom:'12px', paddingBottom:'8px', borderBottom:'2px solid var(--success-green)', color:'var(--text-primary)'}}>Active Roster</h4>
                            <table className="data-table">
                            <thead><tr><th style={{width:'30px'}}></th><th>Name</th><th>Email</th><th>Status</th><th>Rental</th><th>Prizes</th><th>Waiver</th><th>Actions</th></tr></thead>
                            <tbody>
                                {registrationData.active.map(r => (
                                    <React.Fragment key={r.registration_id}>
                                        <tr className={`reg-table-row ${expandedRegId===r.registration_id ? 'expanded' : ''}`} onClick={() => toggleRegDetails(r.registration_id)}>
                                            <td style={{textAlign:'center'}}><i className="fas fa-chevron-down row-toggle-icon"></i></td>
                                            <td><strong>{r.first_name} {r.last_name}</strong></td>
                                            <td>{r.email}</td>
                                            <td>
                                                {r.promotion_expires_at ? (() => {
                                                    // PRIORITY 1: Waitlist promotion deadline (20-hour window)
                                                    const countdown = getPromotionDeadlineCountdown(r.promotion_expires_at);
                                                    const deadline = new Date(r.promotion_expires_at);
                                                    const msRemaining = deadline - new Date();
                                                    const hoursRemaining = msRemaining / (1000 * 60 * 60);

                                                    const badgeClass = countdown === 'EXPIRED' ? 'status-error' :
                                                                      hoursRemaining < 2 ? 'status-warning' :
                                                                      'status-upcoming';

                                                    return (
                                                        <span className={`status-badge ${badgeClass}`} title="Promoted from waitlist - must confirm within 20 hours">
                                                            Promoted ({countdown})
                                                        </span>
                                                    );
                                                })() : registrationData.trip.requires_checkin && r.checked_in ? (
                                                    // PRIORITY 2: 2-day check-in completed
                                                    <span className="status-badge status-active" title="2-day check-in completed">✓</span>
                                                ) : registrationData.trip.requires_checkin && !r.checked_in ? (() => {
                                                    // PRIORITY 3: 2-day check-in pending
                                                    const countdown = getCheckInCountdown(registrationData.trip.trip_date);
                                                    if (!countdown) return <span className="status-badge status-warning">Not Checked In</span>;

                                                    return (
                                                        <span className={`status-badge ${countdown.badgeClass}`} title={`Check-in window ${countdown.status}`}>
                                                            Not Checked In ({countdown.text})
                                                        </span>
                                                    );
                                                })() : (
                                                    // PRIORITY 4: Default pending state
                                                    <span className="status-badge status-upcoming">Pending</span>
                                                )}
                                            </td>
                                            <td>{r.equipment_rental === 'none' ? '-' : r.equipment_rental}</td>
                                            <td onClick={e=>e.stopPropagation()} style={{whiteSpace: 'nowrap'}}>
                                                <button
                                                    onClick={() => togglePrize(r.registration_id, 'rental', r.won_rental)}
                                                    style={{
                                                        display: 'inline-block',
                                                        padding: '3px 8px',
                                                        fontSize: '11px',
                                                        fontWeight: '600',
                                                        backgroundColor: r.won_rental ? '#ff6b6b' : 'var(--subtle-bg)',
                                                        color: r.won_rental ? 'white' : 'var(--text-muted)',
                                                        border: r.won_rental ? 'none' : '1px solid var(--medium-gray)',
                                                        borderRadius: '4px',
                                                        marginRight: '4px',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (!r.won_rental) {
                                                            e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
                                                            e.currentTarget.style.color = 'var(--text-secondary)';
                                                        }
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (!r.won_rental) {
                                                            e.currentTarget.style.backgroundColor = 'var(--subtle-bg)';
                                                            e.currentTarget.style.color = 'var(--text-muted)';
                                                        }
                                                    }}
                                                    title={r.won_rental ? 'Click to remove rental prize' : 'Click to award rental prize'}
                                                >
                                                    <i className="fas fa-snowboard" style={{marginRight: '4px'}}></i>Rental
                                                </button>
                                                <button
                                                    onClick={() => togglePrize(r.registration_id, 'ticket', r.won_ticket)}
                                                    style={{
                                                        display: 'inline-block',
                                                        padding: '3px 8px',
                                                        fontSize: '11px',
                                                        fontWeight: '600',
                                                        backgroundColor: r.won_ticket ? '#4ecdc4' : 'var(--subtle-bg)',
                                                        color: r.won_ticket ? 'white' : 'var(--text-muted)',
                                                        border: r.won_ticket ? 'none' : '1px solid var(--medium-gray)',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (!r.won_ticket) {
                                                            e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
                                                            e.currentTarget.style.color = 'var(--text-secondary)';
                                                        }
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (!r.won_ticket) {
                                                            e.currentTarget.style.backgroundColor = 'var(--subtle-bg)';
                                                            e.currentTarget.style.color = 'var(--text-muted)';
                                                        }
                                                    }}
                                                    title={r.won_ticket ? 'Click to remove lift ticket prize' : 'Click to award lift ticket prize'}
                                                >
                                                    <i className="fas fa-ticket-alt" style={{marginRight: '4px'}}></i>Ticket
                                                </button>
                                            </td>
                                            <td>
                                                {r.filled_waiver_pdf_path ? (
                                                    <a
                                                        href={`/public_uploads/${r.filled_waiver_pdf_path}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        onClick={e => e.stopPropagation()}
                                                        className="btn btn-sm btn-outline"
                                                        style={{padding:'4px 8px', fontSize:'11px', borderColor:'var(--info-blue)', color:'var(--info-blue)'}}
                                                    >
                                                        <i className="fas fa-file-contract"></i> View
                                                    </a>
                                                ) : (
                                                    <span style={{color:'var(--text-muted)', fontSize:'20px'}}>-</span>
                                                )}
                                            </td>
                                            <td onClick={e=>e.stopPropagation()} style={{whiteSpace: 'nowrap'}}>
                                                <button className="btn btn-warning btn-sm" onClick={() => manageReg(r.registration_id, 'demote')} title="Move to waitlist" style={{marginRight:'4px'}}><i className="fas fa-arrow-down"></i></button>
                                                <button className="btn btn-danger btn-sm" onClick={() => manageReg(r.registration_id, 'kick')} title="Remove from trip"><i className="fas fa-times"></i></button>
                                            </td>
                                        </tr>
                                        <tr className={`details-row ${expandedRegId===r.registration_id ? 'show' : ''}`}>
                                            <td colSpan="7">
                                                <div className="details-content">
                                                    {regDetails[r.registration_id] ? (
                                                        <div className="details-grid">
                                                            <div className="detail-section">
                                                                <h5>Personal & Emergency</h5>
                                                                <div className="info-pair"><span className="info-label">Phone:</span> {regDetails[r.registration_id].emergency_contact_phone} ({regDetails[r.registration_id].emergency_contact_name})</div>
                                                                <div className="info-pair"><span className="info-label">Skill:</span> {regDetails[r.registration_id].skill_level}</div>
                                                            </div>
                                                            <div className="detail-section">
                                                                <h5>Questionnaire</h5>
                                                                {regDetails[r.registration_id].custom_answers && regDetails[r.registration_id].custom_answers.length > 0 ? (
                                                                    regDetails[r.registration_id].custom_answers.map((a, i) => (
                                                                        <div key={i} className="qa-block"><div className="qa-question">{a.question_text}</div><div className="qa-answer">{a.answer_text}</div></div>
                                                                    ))
                                                                ) : (
                                                                    <div style={{color: 'var(--text-muted)', fontStyle: 'italic', padding: '10px 0'}}>
                                                                        No questionnaire responses (user registered before questions were added)
                                                                    </div>
                                                                )}
                                                                {regDetails[r.registration_id].special_requests && (
                                                                    <div style={{background:'var(--subtle-bg)', padding:'10px', marginTop:'10px', color: 'var(--text-secondary)', border: '1px solid var(--medium-gray)', borderRadius: '4px'}}>{regDetails[r.registration_id].special_requests}</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : <span style={{color: 'var(--text-muted)'}}>Loading details...</span>}
                                                </div>
                                            </td>
                                        </tr>
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                        </div>

                        {/* Waitlist */}
                        <div className="roster-section">
                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px', paddingBottom:'8px', borderBottom:'2px solid var(--warning-yellow)'}}>
                                <h4 style={{fontSize:'14px', fontWeight:'700', margin:0, color:'var(--text-primary)'}}>Waitlist</h4>
                                <span style={{fontSize:'12px', color:'var(--text-muted)', fontWeight:'400'}}>
                                    Drag rows to reorder
                                </span>
                            </div>
                            <table className="data-table">
                                <thead><tr><th style={{width:'40px'}}></th><th>#</th><th>Name</th><th>Email</th><th>Registered At</th><th>Actions</th></tr></thead>
                                <tbody style={{backgroundColor:'var(--subtle-bg)'}}>
                                    {registrationData.waitlist.map((r, i) => (
                                        <tr
                                            key={r.registration_id}
                                            draggable
                                            onDragStart={(e) => handleWaitlistDragStart(e, i, r)}
                                            onDragOver={(e) => handleWaitlistDragOver(e, i)}
                                            onDrop={(e) => handleWaitlistDrop(e, i)}
                                            onDragEnd={handleWaitlistDragEnd}
                                            style={{
                                                cursor:'move',
                                                opacity:draggedItem?.index === i ? 0.5 : 1,
                                                backgroundColor:dragOverIndex === i ? 'var(--hover-bg)' : (i === 0 ? 'rgba(40, 167, 69, 0.1)' : 'var(--subtle-bg)'),
                                                transition:'background-color 0.2s',
                                                borderTop:dragOverIndex === i ? '2px solid var(--warning-yellow)' : 'none'
                                            }}
                                        >
                                            <td style={{textAlign:'center', color:'var(--text-muted)'}}>
                                                <i className="fas fa-grip-vertical"></i>
                                            </td>
                                            <td><strong>{i+1}</strong></td>
                                            <td>{r.first_name} {r.last_name}</td>
                                            <td>{r.email}</td>
                                            <td style={{fontSize:'12px'}}>{formatDateTime(r.registered_at)}</td>
                                            <td style={{whiteSpace:'nowrap'}}>
                                                <button className="btn btn-success btn-sm" onClick={() => manageReg(r.registration_id, 'promote')} title="Promote to active" style={{marginRight:'4px'}}>
                                                    <i className="fas fa-arrow-up"></i> Promote
                                                </button>
                                                <button className="btn btn-danger btn-sm" onClick={() => manageReg(r.registration_id, 'kick')} title="Remove from trip">
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. Announcement Modal */}
            <div className={`modal-overlay ${modals.announcement ? 'active' : ''}`} onClick={(e) => e.target === e.currentTarget && setModals(m => ({...m, announcement: false}))}>
                <div className="modal">
                    <div className="modal-header"><h3 className="modal-title">{editingAnnouncement ? 'Edit' : 'Create'} Announcement</h3><button className="modal-close" onClick={() => setModals(m => ({...m, announcement:false}))}>×</button></div>
                    <form onSubmit={handleAnnouncementSubmit} ref={announcementFormRef}>
                        <div className="modal-body">
                             <div className="form-group"><label className="form-label">Message</label><textarea name="message" className="form-control" defaultValue={editingAnnouncement?.message} required></textarea></div>
                             <div className="form-row">
                                 <div className="form-group"><label className="form-label">Duration</label><input name="duration" type="number" className="form-control" defaultValue={24} /></div>
                                 <div className="form-group"><label className="form-label">Unit</label><select name="unit" className="form-control"><option value="hours">Hours</option><option value="days">Days</option></select></div>
                             </div>
                             <div className="form-group"><label className="form-label">Start At (Optional)</label><input name="start_at" type="datetime-local" className="form-control" defaultValue={editingAnnouncement?.start_at ? new Date(editingAnnouncement.start_at).toISOString().slice(0,16) : ''} /></div>
                             <div className="form-group"><label className="form-label">Recurrence</label><select name="recurrence" className="form-control" defaultValue={editingAnnouncement?.recurrence_type || 'none'}><option value="none">None</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></div>
                             {announcementMsg && <div className="message error">{announcementMsg}</div>}
                        </div>
                        <div className="modal-footer"><button type="submit" className="btn btn-primary">Publish</button></div>
                    </form>
                </div>
            </div>

            {/* 4. Start Attendance Modal */}
            <div className={`modal-overlay ${modals.startAttendance ? 'active' : ''}`} onClick={(e) => e.target === e.currentTarget && setModals(m => ({...m, startAttendance: false}))}>
                 <div className="modal">
                     <div className="modal-header"><h3 className="modal-title">Start Attendance Session</h3><button className="modal-close" onClick={() => setModals(m => ({...m, startAttendance:false}))}>×</button></div>
                     <form onSubmit={handleStartAttendance} ref={startAttendanceFormRef}>
                         <div className="modal-body">
                             <div className="form-group">
                                 <label className="form-label">Trip</label>
                                 <select name="trip_id" className="form-control" required>
                                     <option value="">Select...</option>
                                     {trips.map(t => <option key={t.id} value={t.id}>{t.name} ({formatDate(t.trip_date)})</option>)}
                                 </select>
                             </div>
                             <div className="form-group">
                                 <label className="form-label">Bus Number</label>
                                 <select name="bus_number" className="form-control" required>
                                     <option value="1">Bus 1</option><option value="2">Bus 2</option><option value="3">Bus 3</option>
                                 </select>
                             </div>
                             <div className="form-group">
                                 <label className="form-label">Excel File (Required for Mont Tremblant)</label>
                                 <div className="file-input-wrapper">
                                     <input type="file" name="excel_file" id="excel_file" accept=".xlsx,.xls" />
                                     <label htmlFor="excel_file" className="file-input-label"><i className="fas fa-file-excel"></i> Upload</label>
                                 </div>
                             </div>
                         </div>
                         <div className="modal-footer"><button type="submit" className="btn btn-success">Start</button></div>
                     </form>
                 </div>
            </div>

            {/* 5. PDF Upload Modal */}
            <div className={`modal-overlay ${modals.pdfUpload ? 'active' : ''}`} onClick={(e) => e.target === e.currentTarget && setModals(m => ({...m, pdfUpload: false}))}>
                 <div className="modal">
                     <div className="modal-header"><h3 className="modal-title">Upload PDF</h3><button className="modal-close" onClick={() => setModals(m => ({...m, pdfUpload:false}))}>×</button></div>
                     <form onSubmit={handlePdfUpload}>
                         <div className="modal-body">
                             <div className="form-group"><label className="form-label">File</label><input type="file" name="pdf" className="form-control" required ref={pdfFileRef} accept=".pdf"/></div>
                             <div className="form-group"><label className="form-label">Description</label><input name="description" className="form-control" ref={pdfDescRef} /></div>
                         </div>
                         <div className="modal-footer"><button type="submit" className="btn btn-primary">Upload</button></div>
                     </form>
                 </div>
            </div>

            {/* 6. Add Admin Modal */}
            <div className={`modal-overlay ${modals.addAdmin ? 'active' : ''}`} onClick={(e) => e.target === e.currentTarget && setModals(m => ({...m, addAdmin: false}))}>
                 <div className="modal">
                     <div className="modal-header"><h3 className="modal-title">Add Admin</h3><button className="modal-close" onClick={() => setModals(m => ({...m, addAdmin:false}))}>×</button></div>
                     <form onSubmit={handleAddAdmin}>
                         <div className="modal-body">
                             <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-control" ref={adminEmailRef} placeholder="user@terpmail.umd.edu" required /></div>
                         </div>
                         <div className="modal-footer"><button type="submit" className="btn btn-primary">Add</button></div>
                     </form>
                 </div>
            </div>

             {/* 7. Welcome Modal */}
             <div className={`modal-overlay ${modals.welcome ? 'active' : ''}`} onClick={(e) => e.target === e.currentTarget && setModals(m => ({...m, welcome: false}))}>
                 <div className="modal" style={{textAlign:'center'}}>
                     <div className="modal-body" style={{padding:'40px'}}>
                         <div className="welcome-icon"><i className="fas fa-snowflake"></i></div>
                         <h2 className="welcome-title">Welcome, {currentUser?.first_name}!</h2>
                         <p className="welcome-subtitle">Here is a quick note to get you started.</p>
                         <div className="getting-started-steps">
                             <div className="step"><div className="step-icon"><i className="fas fa-bus"></i></div><h4>1. Create Trip</h4><p>Head to 'Dashboard' to create your first trip.</p></div>
                             <div className="step"><div className="step-icon"><i className="fas fa-file-pdf"></i></div><h4>2. Bus Attendance</h4><p>On trips, take attendance via QR Code.</p></div>
                             <div className="step"><div className="step-icon"><i className="fas fa-users-cog"></i></div><h4>3. Manage Team</h4><p>Add admins in 'Admin Management'.</p></div>
                         </div>
                         <button className="btn btn-primary" onClick={() => { localStorage.setItem('adminWelcomeScreenShown','true'); setModals(m=>({...m, welcome:false})); }}>Let's Go!</button>
                     </div>
                 </div>
             </div>

            {/* 8. Giveaway Results Modal */}
            <div className={`modal-overlay ${modals.giveawayResults ? 'active' : ''}`} onClick={(e) => e.target === e.currentTarget && setModals(m => ({...m, giveawayResults: false}))}>
                <div className="modal" style={{width:'600px'}}>
                    <div className="modal-header">
                        <h3 className="modal-title">
                            <i className="fas fa-trophy" style={{marginRight: '10px', color: '#ffd700'}}></i>
                            Giveaway Complete!
                        </h3>
                        <button className="modal-close" onClick={() => setModals(m => ({...m, giveawayResults: false}))}>×</button>
                    </div>
                    <div className="modal-body">
                        {giveawayResults && (
                            <>
                                <div style={{
                                    backgroundColor: 'var(--subtle-bg)',
                                    padding: '15px',
                                    borderRadius: '8px',
                                    marginBottom: '20px',
                                    border: '1px solid var(--medium-gray)'
                                }}>
                                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', textAlign: 'center'}}>
                                        <div>
                                            <div style={{fontSize: '12px', color: 'var(--text-muted)', marginBottom: '5px'}}>Rental Prizes</div>
                                            <div style={{fontSize: '24px', fontWeight: '700', color: '#ff6b6b'}}>
                                                <i className="fas fa-snowboard" style={{marginRight: '8px'}}></i>
                                                {giveawayResults.rental_winners}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{fontSize: '12px', color: 'var(--text-muted)', marginBottom: '5px'}}>Lift Ticket Prizes</div>
                                            <div style={{fontSize: '24px', fontWeight: '700', color: '#4ecdc4'}}>
                                                <i className="fas fa-ticket-alt" style={{marginRight: '8px'}}></i>
                                                {giveawayResults.ticket_winners}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <h4 style={{marginBottom: '15px', fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)'}}>
                                    <i className="fas fa-users" style={{marginRight: '8px', color: 'var(--umd-red)'}}></i>
                                    Winners ({giveawayResults.winners.length})
                                </h4>

                                <div style={{maxHeight: '400px', overflowY: 'auto'}}>
                                    {giveawayResults.winners.map((winner, idx) => (
                                        <div key={winner.id} style={{
                                            padding: '12px 15px',
                                            marginBottom: '10px',
                                            backgroundColor: 'var(--subtle-bg)',
                                            borderRadius: '6px',
                                            border: '1px solid var(--medium-gray)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <div>
                                                <div style={{fontWeight: '600', fontSize: '14px', marginBottom: '3px', color: 'var(--text-primary)'}}>
                                                    {idx + 1}. {winner.first_name} {winner.last_name}
                                                </div>
                                                <div style={{fontSize: '12px', color: 'var(--text-muted)'}}>{winner.email}</div>
                                            </div>
                                            <div style={{display: 'flex', gap: '6px'}}>
                                                {winner.won_rental && (
                                                    <span style={{
                                                        padding: '4px 10px',
                                                        fontSize: '11px',
                                                        fontWeight: '600',
                                                        backgroundColor: '#ff6b6b',
                                                        color: 'white',
                                                        borderRadius: '4px'
                                                    }}>
                                                        <i className="fas fa-snowboard" style={{marginRight: '4px'}}></i>Rental
                                                    </span>
                                                )}
                                                {winner.won_ticket && (
                                                    <span style={{
                                                        padding: '4px 10px',
                                                        fontSize: '11px',
                                                        fontWeight: '600',
                                                        backgroundColor: '#4ecdc4',
                                                        color: 'white',
                                                        borderRadius: '4px'
                                                    }}>
                                                        <i className="fas fa-ticket-alt" style={{marginRight: '4px'}}></i>Ticket
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                    <div className="modal-footer">
                        <button className="btn btn-primary" onClick={() => setModals(m => ({...m, giveawayResults: false}))}>
                            <i className="fas fa-check" style={{marginRight: '8px'}}></i>Done
                        </button>
                    </div>
                </div>
            </div>

            {/* 9. Confirmation Modal */}
            <div className={`modal-overlay ${modals.confirmation ? 'active' : ''}`} onClick={(e) => e.target === e.currentTarget && confirmConfig.onConfirm(false)}>
                <div className="modal" style={{width:'400px'}}>
                    <div className="modal-header"><h3 className="modal-title">Confirm</h3></div>
                    <div className="modal-body"><p>{confirmConfig.message}</p></div>
                    <div className="modal-footer">
                        <button className="btn btn-outline" onClick={() => confirmConfig.onConfirm(false)}>Cancel</button>
                        <button className="btn btn-danger" onClick={() => confirmConfig.onConfirm(true)}>Confirm</button>
                    </div>
                </div>
            </div>
        </div>
    );
}