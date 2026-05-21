import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchGroups, GroupSummary, updateGroupPassword } from '../auth';

interface AdminGroupsPageProps {
  isOnline: boolean;
}

export const AdminGroupsPage: React.FC<AdminGroupsPageProps> = ({ isOnline }) => {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<GroupSummary | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const loadGroups = async () => {
      if (!isOnline) {
        if (!isCancelled) {
          setIsLoading(false);
          setError('Для керування групами потрібен інтернет');
        }
        return;
      }

      try {
        const nextGroups = await fetchGroups();
        if (!isCancelled) {
          setGroups(nextGroups);
          setError('');
        }
      } catch (loadError) {
        if (!isCancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Не вдалося завантажити групи');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadGroups();

    return () => {
      isCancelled = true;
    };
  }, [isOnline]);

  const selectedGroupTitle = useMemo(() => selectedGroup?.label || 'Група', [selectedGroup]);

  const handleSavePassword = async () => {
    if (!selectedGroup) {
      return;
    }

    const nextPassword = newPassword.trim();
    if (nextPassword.length < 3) {
      setError('Пароль групи має містити щонайменше 3 символи');
      return;
    }

    setIsSaving(true);

    try {
      await updateGroupPassword(selectedGroup.id, nextPassword);
      setError('');
      setSelectedGroup(null);
      setNewPassword('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не вдалося змінити пароль групи');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 pb-24">
      <header className="mb-8">
        <div className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
          <Users size={16} className="mr-2" />
          Режим адміністратора
        </div>
        <h1 className="mt-4 text-3xl font-bold text-gray-900">Групи</h1>
        <p className="mt-2 text-sm text-gray-500">
          Обери групу, щоб працювати з її територіями. Тут же можна змінити пароль доступу для будь-якої групи.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-gray-500">Завантаження груп...</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <div key={group.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">{group.label}</h2>
              <p className="mt-2 text-sm text-slate-500">Доступ до територій, квартир і приміток цієї групи.</p>
              <div className="mt-5 flex gap-3">
                <Link
                  to={`/admin/groups/${group.id}`}
                  className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-center font-medium text-white transition hover:bg-blue-700"
                >
                  Відкрити
                </Link>
                <button
                  onClick={() => {
                    setSelectedGroup(group);
                    setNewPassword('');
                    setError('');
                  }}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-slate-600 transition hover:bg-slate-100"
                >
                  <KeyRound size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selectedGroup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => !isSaving && setSelectedGroup(null)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-slate-900">Змінити пароль</h2>
              <p className="mt-2 text-sm text-slate-500">{selectedGroupTitle}</p>

              <div className="mt-5">
                <label className="mb-2 block text-sm font-medium text-slate-700">Новий пароль</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Введіть новий пароль"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  autoFocus
                  disabled={isSaving}
                />
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedGroup(null)}
                  className="rounded-xl px-4 py-2 text-slate-600 transition hover:bg-slate-100"
                  disabled={isSaving}
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  onClick={() => void handleSavePassword()}
                  className="rounded-xl bg-blue-600 px-5 py-2 font-medium text-white transition hover:bg-blue-700 disabled:opacity-70"
                  disabled={isSaving}
                >
                  {isSaving ? 'Збереження...' : 'Зберегти'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
