/**
 * utility functions for handling api responses with notifs
 */

/**
 * ok so this handles an api response and triggers appropriate notification
 * @param {Response} response - get response object
 * @param {Function} notify - notif function from useNotify hook
 * @param {Object} messages - hashtag custom success/error messages
 * @param {string} messages.success - success message
 * @param {string} messages.error - error message prefix (will append server error if available)
 * @returns {Promise<any>} - parsed response data if successful, throws error if not
 */
export const handleApiResponse = async (response, notify, messages = {}) => {
  if (response.ok) {
    const data = await response.json().catch(() => ({}));

    if (messages.success) {
      notify({
        type: 'success',
        message: messages.success,
      });
    }

    return data;
  } else {
    let errorMessage = messages.error || 'An error occurred';

    try {
      const errorData = await response.json();
      if (errorData.error) {
        errorMessage = `${messages.error ? messages.error + ': ' : ''}${errorData.error}`;
      } else if (errorData.message) {
        errorMessage = `${messages.error ? messages.error + ': ' : ''}${errorData.message}`;
      }
    } catch (e) {
      // oh no!!!!!! could not parse error response
    }

    notify({
      type: 'error',
      message: errorMessage,
    });

    throw new Error(errorMessage);
  }
};

/**
 * wrapps an api call with error handling and notifications
 * @param {Function} apiCall - async function that makes the API call
 * @param {Function} notify - notif function from useNotify hook
 * @param {Object} messages - custom success/error messages
 * @returns {Promise<any>} - result from apiCall if successful, null if error
 */
export const withNotification = async (apiCall, notify, messages = {}) => {
  try {
    const result = await apiCall();

    if (messages.success) {
      notify({
        type: 'success',
        message: messages.success,
      });
    }

    return result;
  } catch (error) {
    const errorMessage = messages.error
      ? `${messages.error}${error.message ? ': ' + error.message : ''}`
      : error.message || 'An error occurred';

    notify({
      type: 'error',
      message: errorMessage,
    });

    return null;
  }
};
