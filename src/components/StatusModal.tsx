import React, { useEffect, useState } from 'react';
import { Apartment, Comment } from '../db';
import { motion, AnimatePresence } from 'motion/react';
import { Check, X, PhoneOff, BellOff, Save, Trash2 } from 'lucide-react';

interface StatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  apartment: Apartment | null;
  onSave: (
    status: Apartment['status'],
    noIntercom: boolean,
    noBell: boolean,
    comments: Comment[]
  ) => Promise<boolean>;
}

export const StatusModal: React.FC<StatusModalProps> = ({
  isOpen,
  onClose,
  apartment,
  onSave,
}) => {
  const [status, setStatus] = useState<Apartment['status']>('default');
  const [noIntercom, setNoIntercom] = useState(false);
  const [noBell, setNoBell] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (apartment) {
      setStatus(apartment.status);
      setNoIntercom(apartment.noIntercom || false);
      setNoBell(apartment.noBell || false);
      setComments(apartment.comments || []);
      setNewComment('');
      setIsSaving(false);
    }
  }, [apartment]);

  const handleSave = async () => {
    if (isSaving) {
      return;
    }

    let updatedComments = [...comments];
    if (newComment.trim()) {
      updatedComments.unshift({
        id: crypto.randomUUID(),
        text: newComment.trim(),
        timestamp: Date.now(),
      });
    }

    setIsSaving(true);
    const wasSaved = await onSave(status, noIntercom, noBell, updatedComments);
    setIsSaving(false);

    if (wasSaved) {
      onClose();
    }
  };

  const handleDeleteComment = (id: string) => {
    setComments(comments.filter((comment) => comment.id !== id));
  };

  if (!isOpen || !apartment) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="bg-white rounded-t-2xl w-full max-w-md p-6 pb-10 shadow-xl max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Квартира {apartment.number}</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700" disabled={isSaving}>
              <X size={24} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => setStatus(status === 'success' ? 'default' : 'success')}
              className={`p-4 rounded-xl flex flex-col items-center justify-center transition-colors ${
                status === 'success' ? 'bg-green-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              <Check size={24} className="mb-2" />
              <span className="font-medium">Успішно</span>
            </button>
            <button
              onClick={() => setStatus(status === 'refusal' ? 'default' : 'refusal')}
              className={`p-4 rounded-xl flex flex-col items-center justify-center transition-colors ${
                status === 'refusal' ? 'bg-red-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              <X size={24} className="mb-2" />
              <span className="font-medium">Відмова</span>
            </button>
            <button
              onClick={() => setNoIntercom(!noIntercom)}
              className={`p-4 rounded-xl flex flex-col items-center justify-center transition-colors ${
                noIntercom ? 'bg-yellow-400 text-black' : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              <PhoneOff size={24} className="mb-2" />
              <span className="font-medium">Немає домофону</span>
            </button>
            <button
              onClick={() => setNoBell(!noBell)}
              className={`p-4 rounded-xl flex flex-col items-center justify-center transition-colors ${
                noBell ? 'bg-orange-400 text-white' : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              <BellOff size={24} className="mb-2" />
              <span className="font-medium">Немає дзвінка</span>
            </button>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Історія коментарів
            </label>
            <div className="space-y-2 mb-4 max-h-40 overflow-y-auto">
              {comments.map((comment) => (
                <div key={comment.id} className="bg-gray-50 p-3 rounded-lg flex justify-between items-start group">
                  <div>
                    <p className="text-sm text-gray-800">{comment.text}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(comment.timestamp).toLocaleString('uk-UA', {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteComment(comment.id)}
                    className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    disabled={isSaving}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="text-sm text-gray-400 italic">Коментарів немає</p>
              )}
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-2">
              Додати коментар
            </label>
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none h-24"
              placeholder="Введіть новий коментар..."
            />
          </div>

          <button
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-4 rounded-xl flex items-center justify-center transition-colors"
          >
            <Save size={20} className="mr-2" />
            {isSaving ? 'Збереження...' : 'Зберегти зміни'}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
