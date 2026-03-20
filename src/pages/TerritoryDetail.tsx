import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useParams, Link } from 'react-router-dom';
import { Apartment, Comment, db } from '../db';
import { cacheTerritoryDetailFromServer, flushPendingMutations, saveApartmentLocally } from '../offlineSync';
import { ApartmentGrid } from '../components/ApartmentGrid';
import { StatusModal } from '../components/StatusModal';
import { ArrowLeft, MapPin } from 'lucide-react';

interface TerritoryDetailProps {
  syncVersion: number;
  isOnline: boolean;
}

export const TerritoryDetail: React.FC<TerritoryDetailProps> = ({ syncVersion, isOnline }) => {
  const { id } = useParams<{ id: string }>();
  const territory = useLiveQuery(() => (id ? db.territories.get(id) : undefined), [id]);
  const apartments = useLiveQuery(
    () => (id ? db.apartments.where('territoryId').equals(id).sortBy('number') : Promise.resolve([])),
    [id],
    []
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedApartmentId, setSelectedApartmentId] = useState<string | null>(null);
  const lastScrollPositionRef = useRef(0);

  const selectedApartment = useMemo(
    () => apartments.find((apartment) => apartment.id === selectedApartmentId) ?? null,
    [apartments, selectedApartmentId]
  );

  useEffect(() => {
    if (territory) {
      setIsLoading(false);

      if (!isOnline) {
        setError('');
      }
    }
  }, [isOnline, territory]);

  useEffect(() => {
    if (isOnline) {
      setNotice('');
    }
  }, [isOnline, syncVersion]);

  useEffect(() => {
    setIsLoading(true);
    setError('');
    setNotice('');
    setSelectedApartmentId(null);
  }, [id]);

  useEffect(() => {
    let isCancelled = false;

    const refreshTerritory = async () => {
      if (!id) {
        if (!isCancelled) {
          setError('Територію не знайдено');
          setIsLoading(false);
        }
        return;
      }

      if (!isOnline) {
        if (!isCancelled) {
          setIsLoading(false);
          setError(territory ? '' : 'Немає з’єднання із сервером');
        }
        return;
      }

      try {
        await cacheTerritoryDetailFromServer(id);

        if (!isCancelled) {
          setError('');
        }
      } catch (loadError) {
        if (!isCancelled && !territory) {
          setError(loadError instanceof Error ? loadError.message : 'Не вдалося завантажити територію');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void refreshTerritory();

    return () => {
      isCancelled = true;
    };
  }, [id, isOnline, syncVersion]);

  const restoreScrollPosition = () => {
    const scrollTop = lastScrollPositionRef.current;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: scrollTop });
      });
    });
  };

  const handleSelectApartment = (apartment: Apartment) => {
    lastScrollPositionRef.current = window.scrollY;
    setSelectedApartmentId(apartment.id);
  };

  const handleCloseModal = () => {
    setSelectedApartmentId(null);
    restoreScrollPosition();
  };

  const handleSaveStatus = async (
    status: Apartment['status'],
    noIntercom: boolean,
    noBell: boolean,
    comments: Comment[]
  ) => {
    if (!selectedApartment) {
      return false;
    }

    const updatedApartment: Apartment = {
      ...selectedApartment,
      status,
      noIntercom,
      noBell,
      comments,
      updatedAt: Date.now(),
    };

    try {
      await saveApartmentLocally(updatedApartment);

      if (isOnline) {
        const syncResult = await flushPendingMutations();

        if (syncResult.pendingCount === 0) {
          setNotice('');
        } else {
          setNotice('Зміни збережено на пристрої. Вони відправляться на сервер, щойно з’явиться інтернет.');
        }
      } else {
        setNotice('Зміни збережено на пристрої. Вони відправляться на сервер, щойно з’явиться інтернет.');
      }

      setError('');
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не вдалося зберегти зміни квартири');
      return false;
    }
  };

  if (isLoading && !territory) {
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

      {notice && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {notice}
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
        onClose={handleCloseModal}
        apartment={selectedApartment}
        onSave={handleSaveStatus}
      />
    </div>
  );
};
