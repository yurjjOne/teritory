/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useParams, Link } from 'react-router-dom';
import { Home } from './pages/Home';
import { TerritoryDetail } from './pages/TerritoryDetail';
import { AdminGroupsPage } from './pages/AdminGroupsPage';
import { GroupAccessGate } from './components/GroupAccessGate';
import { useSync } from './hooks/useSync';
import { LogOut, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { AuthSession, fetchAuthSession, getGroupLabel, logout } from './auth';
import { clearOfflineState } from './offlineSync';

interface AuthenticatedAppProps {
  session: AuthSession;
  onLogout: () => Promise<void>;
}

function AdminGroupHomeRoute({ isOnline, syncVersion }: { isOnline: boolean; syncVersion: number }) {
  const { groupId = '' } = useParams<{ groupId: string }>();

  if (!groupId) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <Home
      isAdmin
      syncVersion={syncVersion}
      isOnline={isOnline}
      currentGroupId={groupId}
      currentGroupLabel={getGroupLabel(groupId)}
      detailPathBuilder={(territoryId) => `/admin/groups/${groupId}/territory/${territoryId}`}
      backTo="/admin"
      backLabel="До списку груп"
    />
  );
}

function AdminGroupTerritoryRoute({ isOnline, syncVersion }: { isOnline: boolean; syncVersion: number }) {
  const { groupId = '' } = useParams<{ groupId: string }>();

  if (!groupId) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <TerritoryDetail
      syncVersion={syncVersion}
      isOnline={isOnline}
      currentGroupId={groupId}
      backTo={`/admin/groups/${groupId}`}
      backLabel={getGroupLabel(groupId)}
    />
  );
}

function AuthenticatedApp({ session, onLogout }: AuthenticatedAppProps) {
  const { isOnline, isSyncing, syncVersion } = useSync();
  const isAdmin = session.role === 'admin';

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
        <nav className="sticky top-0 z-40 bg-white shadow-sm">
          <div className="container mx-auto flex items-center justify-between px-4 py-3">
            <Link to={isAdmin ? '/admin' : '/'} className="text-xl font-bold text-blue-600 flex items-center">
              Записи Території
            </Link>
            <div className="flex items-center space-x-3">
              <div className="hidden rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600 md:inline-flex">
                {session.label}
              </div>
              <div className="flex items-center text-sm text-gray-500">
                {!isOnline ? (
                  <>
                    <WifiOff size={16} className="mr-1 text-red-500" />
                    <span className="hidden sm:inline">Офлайн</span>
                  </>
                ) : isSyncing ? (
                  <>
                    <RefreshCw size={16} className="mr-1 text-blue-500" />
                    <span className="hidden sm:inline">Синхронізація</span>
                  </>
                ) : (
                  <>
                    <Wifi size={16} className="mr-1 text-green-500" />
                    <span className="hidden sm:inline">Онлайн</span>
                  </>
                )}
              </div>
              <button
                onClick={() => void onLogout()}
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
            {isAdmin ? (
              <>
                <Route path="/" element={<Navigate to="/admin" replace />} />
                <Route path="/admin" element={<AdminGroupsPage isOnline={isOnline} />} />
                <Route path="/admin/groups/:groupId" element={<AdminGroupHomeRoute isOnline={isOnline} syncVersion={syncVersion} />} />
                <Route
                  path="/admin/groups/:groupId/territory/:id"
                  element={<AdminGroupTerritoryRoute isOnline={isOnline} syncVersion={syncVersion} />}
                />
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </>
            ) : (
              <>
                <Route
                  path="/"
                  element={
                    <Home
                      isAdmin={false}
                      syncVersion={syncVersion}
                      isOnline={isOnline}
                      currentGroupId={session.groupId}
                      currentGroupLabel={session.groupLabel}
                      detailPathBuilder={(territoryId) => `/territory/${territoryId}`}
                    />
                  }
                />
                <Route
                  path="/territory/:id"
                  element={
                    <TerritoryDetail
                      syncVersion={syncVersion}
                      isOnline={isOnline}
                      currentGroupId={session.groupId}
                      backTo="/"
                      backLabel={session.groupLabel}
                    />
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </>
            )}
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    const bootstrapSession = async () => {
      try {
        const nextSession = await fetchAuthSession();
        if (!isCancelled) {
          setSession(nextSession);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Session bootstrap error:', error);
          setSession(null);
        }
      } finally {
        if (!isCancelled) {
          setIsBootstrapping(false);
        }
      }
    };

    void bootstrapSession();

    return () => {
      isCancelled = true;
    };
  }, []);

  const handleAuthenticated = async (nextSession: AuthSession) => {
    await clearOfflineState();
    setSession(nextSession);
  };

  const handleLogout = async () => {
    await logout();
    await clearOfflineState();
    setSession(null);
  };

  if (isBootstrapping) {
    return <div className="p-8 text-center text-gray-500">Завантаження...</div>;
  }

  if (!session) {
    return <GroupAccessGate onAuthenticated={handleAuthenticated} />;
  }

  return <AuthenticatedApp session={session} onLogout={handleLogout} />;
}
