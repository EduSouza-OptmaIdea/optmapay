import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Header } from './components/Header';
import { GoldenBanner } from './components/GoldenBanner';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { CookieBanner } from './components/CookieBanner';
import { PublicHome } from './pages/PublicHome';
import { TermsOfUse } from './pages/TermsOfUse';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { Dashboard } from './pages/Dashboard';
import { PixArea } from './pages/PixArea';
import { BoletosArea } from './pages/BoletosArea';
import { CartoesArea } from './pages/CartoesArea';
import { SettlementSimulator } from './pages/SettlementSimulator';
import { DevPanel } from './pages/DevPanel';
import { SettingsReset } from './pages/SettingsReset';
import { MyProfile } from './pages/MyProfile';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { ResetPassword } from './pages/ResetPassword';
import { RefreshCw } from 'lucide-react';

const ProtectedLayout: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8F6F2] dark:bg-[#0F172A] text-slate-600 dark:text-slate-300 gap-3 font-mono text-xs">
        <RefreshCw className="w-6 h-6 text-[#19A999] animate-spin" />
        <span>Autenticando sessão OptmaPay...</span>
      </div>
    );
  }

  // Se não estiver logado, redireciona estritamente para /login
  if (!user) {
    return <Navigate to="/login" replace />;
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
      <CookieBanner />
    </div>
  );
};

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            {/* Rotas Públicas */}
            <Route path="/" element={<PublicHome />} />
            <Route path="/termos-de-uso" element={<TermsOfUse />} />
            <Route path="/politica-de-privacidade" element={<PrivacyPolicy />} />

            {/* Acessar Conta & Criar Conta */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/criar-conta" element={<Signup />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Rotas Privadas Estritamente Protegidas */}
            <Route path="/*" element={<ProtectedLayout />} />
          </Routes>
          <CookieBanner />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
