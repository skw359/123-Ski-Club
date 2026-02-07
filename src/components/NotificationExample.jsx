import React from 'react';
import { useNotify } from '../context/NotificationContext';

/**
 * Example component demonstrating the notification system usage
 *
 * This component is for demonstration purposes only.
 * You can use this as a reference for implementing notifications in your components.
 */
const NotificationExample = () => {
  const notify = useNotify();

  const showSuccessNotification = () => {
    notify({
      type: 'success',
      message: 'Operation completed successfully!',
      duration: 6000
    });
  };

  const showErrorNotification = () => {
    notify({
      type: 'error',
      message: 'An error occurred while processing your request.',
      duration: 6000
    });
  };

  const showWarningNotification = () => {
    notify({
      type: 'warning',
      message: 'Please review your input before proceeding.',
      duration: 6000
    });
  };

  const showInfoNotification = () => {
    notify({
      type: 'info',
      message: 'This is an informational message.',
      duration: 6000
    });
  };

  const showMultipleNotifications = () => {
    notify({ type: 'success', message: 'First notification' });
    setTimeout(() => {
      notify({ type: 'info', message: 'Second notification' });
    }, 500);
    setTimeout(() => {
      notify({ type: 'warning', message: 'Third notification' });
    }, 1000);
  };

  const handleApiCall = async () => {
    try {
      // Simulate API call
      const response = await fetch('/api/some-endpoint', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: 'example' })
      });

      if (response.ok) {
        const data = await response.json();
        notify({
          type: 'success',
          message: data.message || 'API call successful!'
        });
      } else {
        const error = await response.json();
        notify({
          type: 'error',
          message: error.error || 'API call failed.'
        });
      }
    } catch (error) {
      notify({
        type: 'error',
        message: 'Network error occurred.'
      });
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Notification System Examples</h2>
      <p>Click the buttons below to see different notification types:</p>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '20px' }}>
        <button onClick={showSuccessNotification} className="btn btn-success">
          Show Success
        </button>
        <button onClick={showErrorNotification} className="btn btn-danger">
          Show Error
        </button>
        <button onClick={showWarningNotification} className="btn btn-warning">
          Show Warning
        </button>
        <button onClick={showInfoNotification} className="btn btn-info">
          Show Info
        </button>
        <button onClick={showMultipleNotifications} className="btn btn-secondary">
          Show Multiple
        </button>
        <button onClick={handleApiCall} className="btn btn-primary">
          Simulate API Call
        </button>
      </div>

      <div style={{ marginTop: '30px' }}>
        <h3>Code Examples:</h3>
        <pre style={{ background: '#f5f5f5', padding: '15px', borderRadius: '5px', overflow: 'auto' }}>
{`// Import the hook
import { useNotify } from '../context/NotificationContext';

// In your component
const notify = useNotify();

// Basic usage
notify({
  type: 'success',
  message: 'Operation completed!',
  duration: 6000 // optional, defaults to 6000ms
});

// With API response handling
const response = await fetch('/api/endpoint', { ... });
if (response.ok) {
  notify({ type: 'success', message: 'Success!' });
} else {
  const error = await response.json();
  notify({ type: 'error', message: error.error || 'Failed' });
}`}
        </pre>
      </div>
    </div>
  );
};

export default NotificationExample;
