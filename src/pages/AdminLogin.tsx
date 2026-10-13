import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { Logo } from '../components/Logo';
import { supabase } from '../lib/supabase';
import { getPlatformIdentity } from '../services/platformStaffService';

export const AdminLogin: React.FC = () => {
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await supabase.auth.signInWithPassword({email:email.trim(),password});
      if (response.error) throw response.error;
      if (!(await getPlatformIdentity()).is_staff) {
        await supabase.auth.signOut();
        throw new Error('Esta conta não possui acesso administrativo autorizado.');
      }
      // AuthContext carrega o papel e renderiza /admin após validar no servidor.
    } catch (err: any) {
      setError(err?.message?.includes('Invalid login credentials') ? 'E-mail ou senha inválidos.' : (err?.message || 'Não foi possível autenticar.'));
    } finally {
      setBusy(false);
    }
  };
  return <div className="min-h-screen bg-[#F8F6F2] dark:bg-[#0F172A] text-slate-900 dark:text-white flex items-center justify-center p-4">
    <div className="max-w-md w-full bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-3xl shadow-xl p-7 space-y-6">
      <Link to="/" className="inline-flex"><Logo heightClass="h-9"/></Link>
      <div><ShieldCheck className="text-teal-500 mb-2"/><h1 className="text-2xl font-extrabold">Administração OptmaPay</h1><p className="text-sm text-slate-500 dark:text-slate-300 mt-2">Acesso exclusivo aos operadores autorizados da plataforma. Não é uma conta bancária fictícia.</p></div>
      {error && <p role="alert" className="text-sm p-3 bg-rose-100 text-rose-800 rounded-xl">{error}</p>}
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-semibold">E-mail administrativo<input className="block mt-1 w-full p-3 rounded-lg border text-slate-900" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
        <label className="block text-sm font-semibold">Senha<input className="block mt-1 w-full p-3 rounded-lg border text-slate-900" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
        <button type="submit" disabled={busy} className="w-full rounded-xl py-3 bg-teal-600 text-white font-bold disabled:opacity-60 inline-flex justify-center items-center gap-2"><LockKeyhole size={16}/>{busy?'Validando autorização...':'Acessar administração'}</button>
      </form>
      <Link to="/" className="text-sm text-teal-600 underline">Voltar ao site</Link>
    </div>
  </div>;
};
