import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Trash2 } from 'lucide-react';

interface TerritoryCardProps {
  id: string;
  name: string;
  imageUrl: string;
  mapLink: string;
  apartmentCount: number;
  isAdmin?: boolean;
  onDelete?: (id: string) => void;
}

export const TerritoryCard: React.FC<TerritoryCardProps> = ({
  id,
  name,
  imageUrl,
  mapLink,
  apartmentCount,
  isAdmin,
  onDelete,
}) => {
  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300 relative group">
      <div className="relative h-48 w-full">
        <img
          src={imageUrl}
          alt={name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
          <h3 className="text-white text-xl font-bold truncate">{name}</h3>
          <p className="text-white/80 text-sm">{apartmentCount} Квартир</p>
        </div>
        
        {isAdmin && onDelete && (
          <button 
            onClick={(e) => {
              e.preventDefault();
              onDelete(id);
            }}
            className="absolute top-2 right-2 bg-red-600 text-white p-2 rounded-full shadow-md hover:bg-red-700 transition-colors z-10"
            aria-label="Видалити територію"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>
      <div className="p-4 flex justify-between items-center">
        <Link
          to={`/territory/${id}`}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg flex-1 text-center mr-2 transition-colors"
        >
          Відкрити
        </Link>
        <a
          href={mapLink}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 p-2 rounded-lg transition-colors"
          aria-label="Navigate"
        >
          <MapPin size={24} />
        </a>
      </div>
    </div>
  );
};
