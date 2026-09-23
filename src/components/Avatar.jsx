import React, { useState } from 'react';

const GRADIENTS = [
  'from-emerald-500 to-teal-700',
  'from-blue-500 to-indigo-700',
  'from-purple-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-red-700',
  'from-cyan-500 to-blue-600',
  'from-violet-500 to-purple-800',
  'from-teal-400 to-emerald-600',
];

export default function Avatar({
  name = 'User',
  seed = '',
  size = 'md',
  isOnline = false,
  showStatus = false,
  className = '',
}) {
  const [imgError, setImgError] = useState(false);

  const cleanName = name || 'User';
  const initial = cleanName.charAt(0).toUpperCase();
  const seedString = seed || cleanName;

  // Deterministik renk seçimi
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    hash = seedString.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colorIndex = Math.abs(hash) % GRADIENTS.length;
  const gradientClass = GRADIENTS[colorIndex];

  // Boyut sınıfları
  const sizeClasses = {
    xs: 'w-7 h-7 text-xs',
    sm: 'w-9 h-9 text-sm',
    md: 'w-11 h-11 text-base',
    lg: 'w-14 h-14 text-xl',
    xl: 'w-20 h-20 text-3xl',
  };

  const statusSize = {
    xs: 'w-2 h-2 border',
    sm: 'w-2.5 h-2.5 border-[1.5px]',
    md: 'w-3.5 h-3.5 border-2',
    lg: 'w-4 h-4 border-2',
    xl: 'w-5 h-5 border-[2.5px]',
  };

  // Dicebear avatar URL (MEB engeli ihtimaline karşı svg onError fallback hazır)
  const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
    seedString
  )}&backgroundColor=transparent`;

  return (
    <div className={`relative inline-flex flex-shrink-0 items-center justify-center ${className}`}>
      <div
        className={`${sizeClasses[size] || sizeClasses.md} rounded-full overflow-hidden flex items-center justify-center font-bold text-white shadow-sm bg-gradient-to-br ${gradientClass}`}
      >
        {!imgError ? (
          <img
            src={avatarUrl}
            alt={cleanName}
            className="w-full h-full object-cover p-0.5"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <span>{initial}</span>
        )}
      </div>

      {showStatus && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-[#111b21] ${statusSize[size] || statusSize.md} ${
            isOnline ? 'bg-[#00a884]' : 'bg-gray-400'
          }`}
          title={isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
        />
      )}
    </div>
  );
}
