import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      showToast: (msg) => console.log('Toast:', msg),
      showSuccess: (msg) => console.log('Success:', msg),
      showError: (msg) => console.error('Error:', msg),
    };
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const showSuccess = useCallback((msg) => addToast(msg, 'success'), [addToast]);
  const showError = useCallback((msg) => addToast(msg, 'error', 4000), [addToast]);
  const showInfo = useCallback((msg) => addToast(msg, 'info'), [addToast]);

  return (
    <ToastContext.Provider value={{ showToast: showInfo, showSuccess, showError, showInfo }}>
      {children}
      {/* Toast Render Area */}
      <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2 max-w-sm w-full px-4 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 p-3.5 rounded-xl shadow-2xl border text-sm font-medium animate-pop-in ${
              toast.type === 'success'
                ? 'bg-[#111b21] border-[#00a884] text-[#00a884]'
                : toast.type === 'error'
                ? 'bg-[#111b21] border-red-500 text-red-400'
                : 'bg-[#202c33] border-[#2a3942] text-gray-100'
            }`}
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-[#00a884]" />}
              {toast.type === 'error' && <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400" />}
              {toast.type === 'info' && <Info className="w-5 h-5 flex-shrink-0 text-sky-400" />}
              <span className="truncate">{toast.message}</span>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 text-gray-400 hover:text-white rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
