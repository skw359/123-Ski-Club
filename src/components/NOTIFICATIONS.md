# Toast Notification System

A global toast notification system for the admin dashboard that provides user feedback for all actions.

## Components

### NotificationContext
Provides the notification state and functions throughout the app.

### ToastContainer
Displays all active notifications in the top-right corner.

### Toast
Individual notification component with auto-dismiss and manual close.

## Usage

### Basic Usage

Import the `useNotify` hook in any component:

```jsx
import { useNotify } from '../context/NotificationContext';

function MyComponent() {
  const notify = useNotify();

  const handleAction = async () => {
    try {
      const response = await fetch('/api/some-endpoint', { method: 'POST' });

      if (response.ok) {
        notify({
          type: 'success',
          message: 'Action completed successfully!'
        });
      } else {
        const error = await response.json();
        notify({
          type: 'error',
          message: error.error || 'Action failed.'
        });
      }
    } catch (error) {
      notify({
        type: 'error',
        message: 'Network error occurred.'
      });
    }
  };

  return <button onClick={handleAction}>Do Something</button>;
}
```

### Notification Types

- `success` - Green toast for successful operations
- `error` - Red toast for errors
- `warning` - Orange toast for warnings
- `info` - Blue toast for informational messages

### Options

```jsx
notify({
  type: 'success',      // Required: 'success' | 'error' | 'warning' | 'info'
  message: 'Hello!',    // Required: The message to display
  duration: 6000        // Optional: Auto-dismiss time in ms (default: 6000)
});
```

### Using with API Helper

For cleaner API response handling, use the `handleApiResponse` utility:

```jsx
import { useNotify } from '../context/NotificationContext';
import { handleApiResponse } from '../utils/apiNotifications';

function MyComponent() {
  const notify = useNotify();

  const saveData = async () => {
    const response = await fetch('/api/save', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    await handleApiResponse(response, notify, {
      success: 'Data saved successfully!',
      error: 'Failed to save data'
    });
  };
}
```

## Features

- **Auto-dismiss**: Notifications automatically disappear after 6 seconds (configurable)
- **Manual dismiss**: Users can close notifications by clicking the × button
- **Stacking**: Multiple notifications stack vertically (newest on top)
- **Responsive**: Adapts to mobile screens
- **Animations**: Smooth slide-in and slide-out transitions
- **Accessible**: Proper ARIA labels and semantic HTML

## Integration Status

The notification system is integrated into the following admin actions:

### Trip Management
- ✅ Create trip
- ✅ Update trip
- ✅ Delete trip

### User Management
- ✅ Promote from waitlist (with email notification)
- ✅ Demote to waitlist
- ✅ Remove from trip
- ✅ Manually add person
- ✅ Reorder waitlist
- ✅ Add/remove strikes
- ✅ Clear all strikes

### Admin Management
- ✅ Add admin
- ✅ Remove admin

### Announcements
- ✅ Create announcement
- ✅ Update announcement
- ✅ Delete announcement
- ✅ Pause/activate announcement

### PDF Management
- ✅ Upload PDF
- ✅ Delete PDF

### Settings
- ✅ Toggle trip safety
- ✅ Toggle external emails

### Prizes & Giveaway
- ✅ Award/remove prize
- ✅ Run giveaway

### Check-ins
- ✅ Process expired check-ins

### Attendance
- ✅ Start attendance session
- ✅ Delete attendance sessions

## Customization

### Changing Toast Duration

Modify the default duration by passing it in the notify call:

```jsx
notify({
  type: 'info',
  message: 'Quick message',
  duration: 5000  // 5 seconds instead of default 10
});
```

### Styling

Toast colors and styles can be modified in `Toast.css`:

```css
.toast-success { background-color: #10b981; }
.toast-error { background-color: #ef4444; }
.toast-warning { background-color: #f59e0b; }
.toast-info { background-color: #3b82f6; }
```

## Testing

Test the notification system by triggering any admin action:

1. Create a new trip
2. Add a user to a trip
3. Upload a PDF
4. Toggle a setting

You should see appropriate success/error notifications appear in the top-right corner.
