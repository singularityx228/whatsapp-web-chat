// Masaüstü ve Mobil Tarayıcı Bildirim Servisi (HTML5 Notification API + Service Worker)

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

export const showDesktopNotification = async (title, options = {}) => {
  if (!('Notification' in window)) return null;

  // İzin yoksa veya sorulmamışsa
  if (Notification.permission !== 'granted') {
    return null;
  }

  try {
    const defaultIcon = "https://api.dicebear.com/7.x/bottts/svg?seed=WhatsupChat";

    // 1. Mobil & PWA için ServiceWorker üzerinden bildirim (Android / iOS PWA)
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (registration && registration.showNotification) {
          await registration.showNotification(title, {
            icon: options.icon || defaultIcon,
            badge: defaultIcon,
            body: options.body || '',
            tag: options.tag || 'whatsup-notification',
            vibrate: [200, 100, 200],
            data: { url: window.location.href },
            ...options,
          });
          return true;
        }
      } catch (swErr) {}
    }

    // 2. Masaüstü Tarayıcılar İçin Standart HTML5 Notification
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
    console.warn('Notification error:', err);
    return null;
  }
};
