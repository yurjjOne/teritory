import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchTerritoryDetail, updateApartment } from '../api';
import { Apartment, Comment, Territory } from '../db';
import { ApartmentGrid } from '../components/ApartmentGrid';
import { StatusModal } from '../components/StatusModal';
import { ArrowLeft, MapPin } from 'lucide-react';

interface TerritoryDetailProps {
  syncVersion: number;
  isOnline: boolean;
}

export const TerritoryDetail: React.FC<TerritoryDetailProps> = ({ syncVersion, isOnline }) => {
  const { id } = useParams<{ id: string }>();
  const [territory, setTerritory] = useState<Territory | null>(null);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedApartment, setSelectedApartment] = useState<Apartment | null>(null);

  const loadTerritory = async () => {
    if (!id) {
      setError('Територію не знайдено');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const payload = await fetchTerritoryDetail(id);
      setTerritory(payload.territory);
      setApartments(payload.apartments);
      setError('');
    } catch (loadError) {
      setTerritory(null);
      setApartments([]);
      setError(loadError instanceof Error ? loadError.message : 'Не вдалося завантажити територію');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOnline && !territory) {
      setError('Немає з’єднання із сервером');
      setIsLoading(false);
      return;
    }

    if (isOnline) {
      void loadTerritory();
    }
  }, [id, syncVersion, isOnline]);

  const handleSelectApartment = (apartment: Apartment) => {
    setSelectedApartment(apartment);
  };

  const handleSaveStatus = async (
    status: Apartment['status'],
    noIntercom: boolean,
    noBell: boolean,
    comments: Comment[]
  ) => {
    if (!selectedApartment) {
      return;
    }

    if (!isOnline) {
      setError('Для збереження змін потрібен інтернет');
      return;
    }

    try {
      const updatedApartment = await updateApartment(selectedApartment.id, {
        status,
        noIntercom,
        noBell,
        comments,
      });

      setApartments((currentValue) =>
        currentValue.map((apartment) => (apartment.id === updatedApartment.id ? updatedApartment : apartment))
      );
      setSelectedApartment(updatedApartment);
      setError('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не вдалося зберегти зміни квартири');
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Завантаження території...</div>;
  }

  if (error && !territory) {
    return (
      <div className="container mx-auto px-4 py-8 pb-24">
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
        <Link to="/" className="text-blue-600 hover:text-blue-800">
          Повернутися до списку територій
        </Link>
      </div>
    );
  }

  if (!territory) {
    return <div className="p-8 text-center text-gray-500">Територію не знайдено</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8 pb-24">
      {error && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

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

      <ApartmentGrid apartments={apartments} onSelectApartment={handleSelectApartment} />

      <StatusModal
        isOpen={!!selectedApartment}
        onClose={() => setSelectedApartment(null)}
        apartment={selectedApartment}
        onSave={handleSaveStatus}
      />
    </div>
  );
};
