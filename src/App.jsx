import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Trip from './pages/Trip';
import CheckIn from './pages/CheckIn';
import Admin from './pages/Admin';
import AboutUs from './pages/AboutUs';
import FAQs from './pages/FAQs';
import Information from './pages/Information';
import TripRedirect from './components/TripRedirect';
import ToastContainer from './components/ToastContainer';
import { useAuth } from './context/AuthContext';

const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!user || user.role !== 'admin') return <Navigate to="/" />;
  return children;
};

function App() {
  return (
    <Router>
      <ToastContainer />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/trip/:id" element={<Trip />} />
        <Route path="/trip" element={<TripRedirect />} />
        <Route path="/about" element={<AboutUs />} />
        <Route path="/faqs" element={<FAQs />} />
        <Route path="/information" element={<Information />} />
        <Route path="/checkin/:token" element={<CheckIn />} />
        <Route path="/admin/*" element={
          <AdminRoute>
            <Admin />
          </AdminRoute>
        } />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;
