import React, { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AdminLoginProps {
  isAdmin: boolean;
  onLogin: (password: string) => boolean;
  onLogout: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({
  isAdmin,
  onLogin,
  onLogout,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (onLogin(password)) {
      setIsOpen(false);
      setPassword('');
      setError('');
    } else {
      setError('Невірний пароль адміністратора');
    }
  };

  return (
    <>
      <button
        onClick={() => (isAdmin ? onLogout() : setIsOpen(true))}
        className="fixed bottom-4 right-4 bg-gray-800 text-white p-3 rounded-full shadow-lg hover:bg-gray-700 transition-colors z-50"
        aria-label={isAdmin ? 'Вийти з адмінки' : 'Вхід для адміна'}
      >
        {isAdmin ? <Unlock size={20} /> : <Lock size={20} />}
      </button>

      <AnimatePresence>
        {isOpen && !isAdmin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-bold mb-4">Вхід для адміністратора</h2>
              <form onSubmit={handleLogin}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Введіть пароль"
                  className="w-full p-3 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
                  autoFocus
                />
                {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Скасувати
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Увійти
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
