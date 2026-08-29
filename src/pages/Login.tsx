import React, { useState } from 'react';
import { Logo } from '../components/Logo';
import { supabase } from '../lib/supabase';
import { LogIn, UserPlus, ShieldCheck } from 'lucide-react';

export const Login: React.FC = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      if (isRegister) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        alert('Cadastro realizado! Faça login com suas credenciais.');
        setIsRegister(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao realizar autenticação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900 text-slate-100">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-3xl p-8 space-y-6 shadow-2xl relative overflow-hidden">
        {/* Top Glow Deco */}
        <div className="absolute -top-12 -left-12 w-32 h-32 bg-teal-500/20 rounded-full blur-2xl pointer-events-none" />

        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <Logo showBadge={true} />
          </div>
          <p className="text-xs text-slate-400">
            Acesso ao Banco Sandbox de Desenvolvedores OptmaIdea
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-mono">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              E-mail do Operador
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:ring-2 focus:ring-teal-500 outline-none"
              placeholder="dev@optmaidea.com.br"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:ring-2 focus:ring-teal-500 outline-none"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-teal-950/40 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isRegister ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
            <span>{loading ? 'Aguarde...' : isRegister ? 'Criar Conta de Desenvolvedor' : 'Entrar no Sandbox'}</span>
          </button>
        </form>

        <div className="text-center pt-2 border-t border-slate-700/60">
          <button
            type="button"
            onClick={() => setIsRegister(!isRegister)}
            className="text-xs text-teal-400 hover:text-teal-300 transition"
          >
            {isRegister ? 'Já possui conta? Fazer login' : 'Não tem conta? Cadastrar operador de teste'}
          </button>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 pt-2 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-teal-500" />
          <span>Ambiente Isolado Supabase Auth</span>
        </div>
      </div>
    </div>
  );
};
