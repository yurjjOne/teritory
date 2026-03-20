import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { createTerritory, deleteTerritory } from '../api';
import { db } from '../db';
import { cacheTerritoriesFromServer } from '../offlineSync';
import { TerritoryCard } from '../components/TerritoryCard';
import { DeleteConfirmationModal } from '../components/DeleteConfirmationModal';
import { Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface HomeProps {
  isAdmin: boolean;
  syncVersion: number;
  isOnline: boolean;
}

export const Home: React.FC<HomeProps> = ({ isAdmin, syncVersion, isOnline }) => {
  const territories = useLiveQuery(() => db.territories.orderBy('createdAt').reverse().toArray(), [], []);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [territoryToDelete, setTerritoryToDelete] = useState<string | null>(null);
  const [newTerritory, setNewTerritory] = useState({
    name: '',
    imageUrl: '',
    mapLink: '',
    startNumber: 1,
    endNumber: 10,
  });

  useEffect(() => {
    if (territories.length > 0) {
      setIsLoading(false);

      if (!isOnline) {
        setError('');
      }
    }
  }, [isOnline, territories]);

  useEffect(() => {
    let isCancelled = false;

    const refreshTerritories = async () => {
      if (!isOnline) {
        if (!isCancelled) {
          setIsLoading(false);
          setError(territories.length === 0 ? 'Немає з’єднання із сервером' : '');
        }
        return;
      }

      try {
        await cacheTerritoriesFromServer();

        if (!isCancelled) {
          setError('');
        }
      } catch (loadError) {
        if (!isCancelled && territories.length === 0) {
          setError(loadError instanceof Error ? loadError.message : 'Не вдалося завантажити території');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void refreshTerritories();

    return () => {
      isCancelled = true;
    };
  }, [isOnline, syncVersion]);

  const handleAddTerritory = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isOnline) {
      setError('Для створення території потрібен інтернет');
      return;
    }

    if (
      !newTerritory.name ||
      !Number.isInteger(newTerritory.startNumber) ||
      !Number.isInteger(newTerritory.endNumber) ||
      newTerritory.endNumber < newTerritory.startNumber
    ) {
      setError('Перевірте назву і діапазон квартир');
      return;
    }

    try {
      const territory = await createTerritory({
        id: crypto.randomUUID(),
        name: newTerritory.name,
        imageUrl: newTerritory.imageUrl || 'https://picsum.photos/seed/territory/800/600',
        mapLink: newTerritory.mapLink,
        startNumber: newTerritory.startNumber,
        endNumber: newTerritory.endNumber,
      });

      await db.territories.put(territory);
      setError('');
      setIsAdding(false);
      setNewTerritory({ name: '', imageUrl: '', mapLink: '', startNumber: 1, endNumber: 10 });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Не вдалося створити територію');
    }
  };

  const handleDeleteClick = (id: string) => {
    setTerritoryToDelete(id);
  };

  const confirmDelete = async () => {
    if (!territoryToDelete) {
      return;
    }

    if (!isOnline) {
      setError('Для видалення території потрібен інтернет');
      return;
    }

    try {
      await deleteTerritory(territoryToDelete);
      await db.transaction('rw', db.territories, db.apartments, async () => {
        await db.territories.delete(territoryToDelete);
        await db.apartments.where('territoryId').equals(territoryToDelete).delete();
      });
      setTerritoryToDelete(null);
      setError('');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Не вдалося видалити територію');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 pb-24">
      <header className="mb-8 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Записи Території</h1>
        {isAdmin && (
          <button
            onClick={() => setIsAdding(true)}
            className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg flex items-center transition-colors"
          >
            <Plus size={20} className="mr-2" />
            Додати
          </button>
        )}
      </header>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {isLoading && territories.length === 0 ? (
        <div className="py-12 text-center text-gray-500">Завантаження територій...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {territories.map((territory) => (
            <TerritoryCard
              key={territory.id}
              {...territory}
              apartmentCount={territory.endNumber - territory.startNumber + 1}
              isAdmin={isAdmin}
              onDelete={handleDeleteClick}
            />
          ))}
          {territories.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500">
              Територій не знайдено. {isAdmin ? 'Додайте нову територію.' : 'Попросіть адміністратора додати територію.'}
            </div>
          )}
        </div>
      )}

      <DeleteConfirmationModal
        isOpen={!!territoryToDelete}
        onClose={() => setTerritoryToDelete(null)}
        onConfirm={confirmDelete}
        title="Видалити територію?"
        message="Ви впевнені, що хочете видалити цю територію? Цю дію неможливо скасувати."
      />

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Додати нову територію</h2>
                <button onClick={() => setIsAdding(false)} className="text-gray-500 hover:text-gray-700">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleAddTerritory} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Назва</label>
                  <input
                    type="text"
                    required
                    value={newTerritory.name}
                    onChange={(e) => setNewTerritory({ ...newTerritory, name: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="напр. Головна вул. 123"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">URL зображення (необов'язково)</label>
                  <input
                    type="url"
                    value={newTerritory.imageUrl}
                    onChange={(e) => setNewTerritory({ ...newTerritory, imageUrl: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Посилання на карту (необов'язково)</label>
                  <input
                    type="url"
                    value={newTerritory.mapLink}
                    onChange={(e) => setNewTerritory({ ...newTerritory, mapLink: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="https://maps.google.com/..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Квартира від</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={newTerritory.startNumber}
                      onChange={(e) => setNewTerritory({ ...newTerritory, startNumber: Number(e.target.value) })}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Квартира до</label>
                    <input
                      type="number"
                      required
                      min={newTerritory.startNumber}
                      value={newTerritory.endNumber}
                      onChange={(e) => setNewTerritory({ ...newTerritory, endNumber: Number(e.target.value) })}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Скасувати
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
                  >
                    Створити
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
