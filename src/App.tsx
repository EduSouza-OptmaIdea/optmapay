import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { GoldenBanner } from './components/GoldenBanner';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { Dashboard } from './pages/Dashboard';
import { PixArea } from './pages/PixArea';
import { BoletosArea } from './pages/BoletosArea';
import { CartoesArea } from './pages/CartoesArea';
import { SettlementSimulator } from './pages/SettlementSimulator';
import { DevPanel } from './pages/DevPanel';
import { SettingsReset } from './pages/SettingsReset';
import { Login } from './pages/Login';
import { Onboarding } from './pages/Onboarding';

const MainLayout: React.FC = () => {
  const { loading, accounts } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-teal-400 font-mono text-xs">
        Carregando OptmaPay Sandbox...
      </div>
    );
  }

  // If no accounts created yet, land on onboarding / account opening screen!
  if (!accounts || accounts.length === 0) {
    return <Onboarding />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <GoldenBanner />
      <Header />

      <div className="flex-1 flex max-w-7xl w-full mx-auto pb-16 md:pb-6">
        <Sidebar />
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pix" element={<PixArea />} />
            <Route path="/boletos" element={<BoletosArea />} />
            <Route path="/cartoes" element={<CartoesArea />} />
            <Route path="/settlement" element={<SettlementSimulator />} />
            <Route path="/dev" element={<DevPanel />} />
            <Route path="/settings" element={<SettingsReset />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      <BottomNav />
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/*" element={<MainLayout />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
