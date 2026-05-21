import React, { useState } from 'react';
import { motion } from 'motion/react';
import { LockKeyhole } from 'lucide-react';
import { AuthSession, loginWithPassword } from '../auth';

interface GroupAccessGateProps {
  onAuthenticated: (session: AuthSession) => Promise<void> | void;
}

export const GroupAccessGate: React.FC<GroupAccessGateProps> = ({ onAuthenticated }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    setIsSubmitting(true);

    try {
      const session = await loginWithPassword(password);
      setError('');
      setPassword('');
      await onAuthenticated(session);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Невірний пароль');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-white/10 shadow-2xl backdrop-blur"
        >
          <div className="border-b border-white/10 bg-white/5 px-6 py-5">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/20 text-emerald-200">
              <LockKeyhole size={24} />
            </div>
            <h1 className="text-2xl font-bold">Введіть пароль</h1>
            <p className="mt-2 text-sm text-slate-300">
              Пароль групи відкриє тільки її території. Пароль адміністратора відкриє список усіх груп.
            </p>
          </div>

          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4 px-6 py-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">Пароль</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Введіть пароль"
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30"
                autoFocus
                disabled={isSubmitting}
              />
            </div>

            {error && <p className="text-sm text-rose-300">{error}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-2xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-70"
            >
              {isSubmitting ? 'Вхід...' : 'Увійти'}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
};
