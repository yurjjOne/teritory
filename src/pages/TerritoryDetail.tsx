import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Apartment } from '../db';
import { ApartmentGrid } from '../components/ApartmentGrid';
import { StatusModal } from '../components/StatusModal';
import { ArrowLeft, MapPin } from 'lucide-react';

export const TerritoryDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const territory = useLiveQuery(() => db.territories.get(id!), [id]);
  const apartments = useLiveQuery(() => 
    db.apartments.where('territoryId').equals(id!).toArray()
      .then(apts => apts.sort((a, b) => a.number - b.number)), 
    [id]
  );

  const [selectedApartment, setSelectedApartment] = useState<Apartment | null>(null);

  const handleSelectApartment = (apartment: Apartment) => {
    setSelectedApartment(apartment);
  };

  const handleSaveStatus = async (status: Apartment['status'], noIntercom: boolean, noBell: boolean, comments: any[]) => {
    if (selectedApartment) {
      const updatedApartment = {
        ...selectedApartment,
        status,
        noIntercom,
        noBell,
        comments,
        updatedAt: Date.now(),
      };

      await db.transaction('rw', db.apartments, db.mutations, async () => {
        await db.apartments.put(updatedApartment);
        await db.mutations.add({
          type: 'apartment',
          data: updatedApartment,
          timestamp: Date.now(),
        });
      });
    }
  };

  if (!territory) return <div className="p-8 text-center">Завантаження території...</div>;

  return (
    <div className="container mx-auto px-4 py-8 pb-24">
      <header className="mb-6 flex items-center justify-between">
        <Link to="/" className="text-gray-600 hover:text-gray-900 flex items-center">
          <ArrowLeft size={24} className="mr-2" />
          Назад
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 truncate max-w-[200px]">{territory.name}</h1>
        <a
          href={territory.mapLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800"
        >
          <MapPin size={24} />
        </a>
      </header>

      <ApartmentGrid
        apartments={apartments || []}
        onSelectApartment={handleSelectApartment}
      />

      <StatusModal
        isOpen={!!selectedApartment}
        onClose={() => setSelectedApartment(null)}
        apartment={selectedApartment}
        onSave={handleSaveStatus}
      />
    </div>
  );
};
