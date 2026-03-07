import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Territory } from '../db';
import { TerritoryCard } from '../components/TerritoryCard';
import { DeleteConfirmationModal } from '../components/DeleteConfirmationModal';
import { Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface HomeProps {
  isAdmin: boolean;
}

export const Home: React.FC<HomeProps> = ({ isAdmin }) => {
  const territories = useLiveQuery(() => db.territories.orderBy('createdAt').reverse().toArray());
  const [isAdding, setIsAdding] = useState(false);
  const [territoryToDelete, setTerritoryToDelete] = useState<string | null>(null);
  const [newTerritory, setNewTerritory] = useState({
    name: '',
    imageUrl: '',
    mapLink: '',
    startNumber: 1,
    endNumber: 10,
  });

  const handleAddTerritory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTerritory.name || newTerritory.endNumber < newTerritory.startNumber) return;

    const id = crypto.randomUUID();
    const territory: Territory = {
      id,
      name: newTerritory.name,
      imageUrl: newTerritory.imageUrl || 'https://picsum.photos/seed/territory/800/600',
      mapLink: newTerritory.mapLink,
      startNumber: newTerritory.startNumber,
      endNumber: newTerritory.endNumber,
      createdAt: Date.now(),
    };

    await db.transaction('rw', db.territories, db.apartments, db.mutations, async () => {
      await db.territories.add(territory);
      await db.mutations.add({
        type: 'territory',
        data: territory,
        timestamp: Date.now(),
      });

      // Initialize apartments
      const apartments = [];
      for (let i = territory.startNumber; i <= territory.endNumber; i++) {
        apartments.push({
          id: `${id}-${i}`,
          territoryId: id,
          number: i,
          status: 'default',
          noIntercom: false,
          noBell: false,
          comments: [],
          updatedAt: Date.now(),
        });
      }
      // Bulk add apartments
      await db.apartments.bulkAdd(apartments as any);
    });

    setIsAdding(false);
    setNewTerritory({ name: '', imageUrl: '', mapLink: '', startNumber: 1, endNumber: 10 });
  };

  const handleDeleteClick = (id: string) => {
    setTerritoryToDelete(id);
  };

  const confirmDelete = async () => {
    if (territoryToDelete) {
      await db.transaction('rw', db.territories, db.apartments, db.mutations, async () => {
        await db.territories.delete(territoryToDelete);
        await db.apartments.where('territoryId').equals(territoryToDelete).delete();
        await db.mutations.add({
          type: 'territory',
          data: { id: territoryToDelete, _deleted: true }, // Mark as deleted for sync
          timestamp: Date.now(),
        });
      });
      setTerritoryToDelete(null);
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {territories?.map((territory) => (
          <TerritoryCard 
            key={territory.id} 
            {...territory} 
            apartmentCount={territory.endNumber - territory.startNumber + 1}
            isAdmin={isAdmin}
            onDelete={handleDeleteClick}
          />
        ))}
        {territories?.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-500">
            Територій не знайдено. {isAdmin ? 'Додайте нову територію.' : 'Попросіть адміністратора додати територію.'}
          </div>
        )}
      </div>

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
                      onChange={(e) => setNewTerritory({ ...newTerritory, startNumber: parseInt(e.target.value) })}
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
                      onChange={(e) => setNewTerritory({ ...newTerritory, endNumber: parseInt(e.target.value) })}
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
