/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Home } from './pages/Home';
import { TerritoryDetail } from './pages/TerritoryDetail';
import { AdminLogin } from './components/AdminLogin';
import { GroupAccessGate } from './components/GroupAccessGate';
import { useSync } from './hooks/useSync';
import { LogOut, Wifi, WifiOff } from 'lucide-react';
import {
  GroupAccessSession,
  authenticateAdmin,
  clearGroupAccessSession,
  loadGroupAccessSession,
  saveGroupAccessSession,
} from './auth';

interface AuthenticatedAppProps {
  session: GroupAccessSession;
  onLogoutGroup: () => void;
}

function AuthenticatedApp({ session, onLogoutGroup }: AuthenticatedAppProps) {
  const [isAdmin, setIsAdmin] = useState(false);
  const { isOnline, isSyncing } = useSync();

  const handleLogin = (password: string) => {
    if (authenticateAdmin(password)) {
      setIsAdmin(true);
      return true;
    }
    return false;
  };

  const handleLogout = () => {
    setIsAdmin(false);
  };

  const handleGroupLogout = () => {
    setIsAdmin(false);
    onLogoutGroup();
  };

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
        <nav className="bg-white shadow-sm sticky top-0 z-40">
          <div className="container mx-auto px-4 py-3 flex justify-between items-center">
            <Link to="/" className="text-xl font-bold text-blue-600 flex items-center">
              Записи Території
            </Link>
            <div className="flex items-center space-x-3">
              <div className="hidden md:inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
                {session.groupLabel}
              </div>
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
              <button
                onClick={handleGroupLogout}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
              >
                <LogOut size={16} />
                <span className="hidden sm:inline">Вийти</span>
              </button>
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

export default function App() {
  const [groupSession, setGroupSession] = useState<GroupAccessSession | null>(() => loadGroupAccessSession());

  const handleUnlock = (session: GroupAccessSession) => {
    saveGroupAccessSession(session);
    setGroupSession(session);
  };

  const handleLogoutGroup = () => {
    clearGroupAccessSession();
    setGroupSession(null);
  };

  if (!groupSession) {
    return <GroupAccessGate onUnlock={handleUnlock} />;
  }

  return <AuthenticatedApp session={groupSession} onLogoutGroup={handleLogoutGroup} />;
}
