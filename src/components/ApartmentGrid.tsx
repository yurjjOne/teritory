import React from 'react';
import { Apartment } from '../db';
import { twMerge } from 'tailwind-merge';
import { Check, X, PhoneOff, BellOff, MessageSquare } from 'lucide-react';

interface ApartmentGridProps {
  apartments: Apartment[];
  onSelectApartment: (apartment: Apartment) => void;
}

export const ApartmentGrid: React.FC<ApartmentGridProps> = ({
  apartments,
  onSelectApartment,
}) => {
  const getStatusColor = (apt: Apartment) => {
    if (apt.status === 'success') return 'bg-green-500 text-white';
    if (apt.status === 'refusal') return 'bg-red-500 text-white';
    
    // If status is default, check attributes
    if (apt.noIntercom && apt.noBell) return 'bg-yellow-400 text-black border-4 border-orange-400';
    if (apt.noIntercom) return 'bg-yellow-400 text-black';
    if (apt.noBell) return 'bg-orange-400 text-white';
    
    return 'bg-gray-100 text-gray-700 hover:bg-gray-200';
  };

  return (
    <div className="flex flex-col gap-2 p-4">
      {apartments.map((apt) => (
        <button
          key={apt.id}
          onClick={() => onSelectApartment(apt)}
          className={twMerge(
            'w-full flex items-center p-3 rounded-xl transition-all duration-200 active:scale-99 shadow-sm text-left',
            getStatusColor(apt)
          )}
        >
          <div className="flex items-center justify-center w-10 h-10 font-bold text-lg mr-4 bg-white/20 rounded-full shrink-0">
            {apt.number}
          </div>
          
          <div className="flex-1 flex items-center justify-between overflow-hidden">
            <div className="flex items-center gap-2">
              {apt.status === 'success' && <span className="font-medium">Успішно</span>}
              {apt.status === 'refusal' && <span className="font-medium">Відмова</span>}
              {apt.status === 'default' && !apt.noIntercom && !apt.noBell && <span className="text-gray-500">Немає статусу</span>}
              
              <div className="flex gap-1">
                 {apt.noIntercom && <PhoneOff size={16} />}
                 {apt.noBell && <BellOff size={16} />}
              </div>
            </div>

            {apt.comments && apt.comments.length > 0 && (
              <div className="flex items-center text-xs opacity-80 ml-2 truncate max-w-[50%]">
                <MessageSquare size={14} className="mr-1 shrink-0" />
                <span className="truncate">{apt.comments[0].text}</span>
                {apt.comments.length > 1 && <span className="ml-1">+{apt.comments.length - 1}</span>}
              </div>
            )}
          </div>
          
          <div className="ml-2">
            {apt.status === 'success' && <Check size={20} />}
            {apt.status === 'refusal' && <X size={20} />}
          </div>
        </button>
      ))}
    </div>
  );
};
