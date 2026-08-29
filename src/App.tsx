import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Header } from './components/Header';
import { GoldenBanner } from './components/GoldenBanner';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { PublicHome } from './pages/PublicHome';
import { Dashboard } from './pages/Dashboard';
import { PixArea } from './pages/PixArea';
import { BoletosArea } from './pages/BoletosArea';
import { CartoesArea } from './pages/CartoesArea';
import { SettlementSimulator } from './pages/SettlementSimulator';
import { DevPanel } from './pages/DevPanel';
import { SettingsReset } from './pages/SettingsReset';
import { MyProfile } from './pages/MyProfile';
import { Login } from './pages/Login';
import { Onboarding } from './pages/Onboarding';

const ProtectedLayout: React.FC = () => {
  const { user, loading, accounts } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F6F2] dark:bg-[#0F172A] text-[#19A999] font-mono text-xs">
        Carregando OptmaPay Sandbox...
      </div>
    );
  }

  // Se não estiver logado, redireciona para a tela de login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Se o usuário não tem nenhuma conta criada ainda, exibe tela de onboarding para abrir a primeira
  if (!accounts || accounts.length === 0) {
    return <Onboarding />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F6F2] dark:bg-[#0F172A] text-slate-900 dark:text-slate-100">
      <GoldenBanner />
      <Header />

      <div className="flex-1 flex max-w-7xl w-full mx-auto pb-16 md:pb-6">
        <Sidebar />
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/pix" element={<PixArea />} />
            <Route path="/boletos" element={<BoletosArea />} />
            <Route path="/cartoes" element={<CartoesArea />} />
            <Route path="/settlement" element={<SettlementSimulator />} />
            <Route path="/dev" element={<DevPanel />} />
            <Route path="/meus-dados" element={<MyProfile />} />
            <Route path="/settings" element={<SettingsReset />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>

      <BottomNav />
    </div>
  );
};

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            {/* Rota Pública Principal */}
            <Route path="/" element={<PublicHome />} />

            {/* Rotas de Autenticação e Onboarding */}
            <Route path="/login" element={<Login />} />
            <Route path="/onboarding" element={<Onboarding />} />

            {/* Rotas Privadas do Banco Digital */}
            <Route path="/*" element={<ProtectedLayout />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
