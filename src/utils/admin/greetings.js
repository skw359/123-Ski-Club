/**
 * j a fun time-based greeting message with the user's name
 * @param {string} name - name to include in the greeting
 * @returns {string} greeting message based on current time
 */
export const getTimeBasedGreeting = (name) => {
    const hour = new Date().getHours();
    let greeting = 'Happy Late Night';
    if (hour >= 5 && hour < 12) greeting = 'Good Morning';
    else if (hour >= 12 && hour < 17) greeting = 'Good Afternoon';
    else if (hour >= 17 && hour < 21) greeting = 'Good Evening';
    else if (hour >= 21 || hour === 0) greeting = 'Good Evening';
    return `${greeting}, ${name}`;
};
