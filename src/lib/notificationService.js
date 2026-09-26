// Masaüstü ve Mobil Tarayıcı Bildirim Servisi (HTML5 Notification API)

export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    return 'unsupported';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (e) {
    return 'denied';
  }
};

export const getNotificationPermission = () => {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
};

export const showDesktopNotification = (title, options = {}) => {
  if (!('Notification' in window)) return null;
  if (Notification.permission !== 'granted') return null;

  try {
    const defaultIcon = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512' fill='%2300a884'><circle cx='256' cy='256' r='256' fill='%23111b21'/><path d='M256 80C158.8 80 80 158.8 80 256c0 34.6 9.8 67 26.8 94.6L80 432l84.6-26.2C191 422 222.6 432 256 432c97.2 0 176-78.8 176-176S353.2 80 256 80z' fill='%2300a884'/></svg>";

    const notification = new Notification(title, {
      icon: options.icon || defaultIcon,
      badge: defaultIcon,
      body: options.body || '',
      tag: options.tag || 'whatsup-notification',
      silent: false,
      ...options,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
      if (options.onClick) options.onClick();
    };

    return notification;
  } catch (err) {
    console.warn('Desktop notification error:', err);
    return null;
  }
};
