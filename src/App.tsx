/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Home } from './pages/Home';
import { TerritoryDetail } from './pages/TerritoryDetail';
import { AdminLogin } from './components/AdminLogin';
import { useSync } from './hooks/useSync';
import { Wifi, WifiOff } from 'lucide-react';

export default function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const { isOnline, isSyncing } = useSync();

  const handleLogin = (password: string) => {
    // Simple hardcoded password for demo
    if (password === 'admin123') {
      setIsAdmin(true);
      return true;
    }
    return false;
  };

  const handleLogout = () => {
    setIsAdmin(false);
  };

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
        <nav className="bg-white shadow-sm sticky top-0 z-40">
          <div className="container mx-auto px-4 py-3 flex justify-between items-center">
            <Link to="/" className="text-xl font-bold text-blue-600 flex items-center">
              Записи Території
            </Link>
            <div className="flex items-center space-x-4">
              <div className="flex items-center text-sm text-gray-500">
                {isSyncing ? (
                  <span className="animate-pulse text-blue-500 mr-2">Синхронізація...</span>
                ) : isOnline ? (
                  <Wifi size={16} className="text-green-500 mr-1" />
                ) : (
                  <WifiOff size={16} className="text-red-500 mr-1" />
                )}
                <span className="hidden sm:inline">{isOnline ? 'Онлайн' : 'Офлайн'}</span>
              </div>
            </div>
          </div>
        </nav>

        <main>
          <Routes>
            <Route path="/" element={<Home isAdmin={isAdmin} />} />
            <Route path="/territory/:id" element={<TerritoryDetail />} />
          </Routes>
        </main>

        <AdminLogin
          isAdmin={isAdmin}
          onLogin={handleLogin}
          onLogout={handleLogout}
        />
      </div>
    </Router>
  );
}
