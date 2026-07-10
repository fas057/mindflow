'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Entry = {
  id: string;
  entry_date: string;
  situation: string;
  thoughts: string;
  emotions: string;
  reactions: string;
};

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [form, setForm] = useState({
    entry_date: new Date().toISOString().split('T')[0],
    situation: '',
    thoughts: '',
    emotions: '',
    reactions: '',
  });
  const [loading, setLoading] = useState(false);
  const [periodAnalysis, setPeriodAnalysis] = useState<any>(null);
  const [fromDate, setFromDate] = useState(
    new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) fetchEntries(fromDate, toDate);
    });
  }, []);

  const fetchEntries = async (from?: string, to?: string) => {
    if (!user) return;
    let url = `/api/entries?`;
    if (from) url += `from=${from}&`;
    if (to) url += `to=${to}&`;
    const res = await fetch(url, {
      headers: { 'x-user-id': user.id },
    });
    const data = await res.json();
    setEntries(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/entries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': user.id,
      },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({ ...form, situation: '', thoughts: '', emotions: '', reactions: '' });
      fetchEntries(fromDate, toDate);
    }
    setLoading(false);
  };

  const handleAnalyzePeriod = async () => {
    const res = await fetch('/api/analyze-period', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
      body: JSON.stringify({ from: fromDate, to: toDate, userId: user.id }),
    });
    const data = await res.json();
    if (res.ok) setPeriodAnalysis(data);
    else alert(data.error || 'Ошибка анализа');
  };

  if (!user) {
    return (
      <div className="p-6 max-w-md mx-auto mt-20 text-center">
        <h1 className="text-2xl font-light">Войдите в аккаунт</h1>
        <button
          onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })}
          className="mt-4 bg-indigo-500 text-white px-6 py-2 rounded"
        >
          Войти через Google
        </button>
        <p className="mt-4 text-sm text-gray-500">
          Или используйте email/пароль (добавьте форму самостоятельно)
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-3xl font-light mb-6">🧠 Умный КПТ-дневник</h1>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Форма новой записи */}
        <div className="bg-white p-6 rounded-xl shadow">
          <h2 className="text-xl font-medium mb-4">Новая запись (СМЭР)</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="date"
              className="w-full border p-2 rounded"
              value={form.entry_date}
              onChange={e => setForm({ ...form, entry_date: e.target.value })}
              required
            />
            <textarea
              placeholder="Ситуация"
              className="w-full border p-2 rounded"
              rows={2}
              value={form.situation}
              onChange={e => setForm({ ...form, situation: e.target.value })}
              required
            />
            <textarea
              placeholder="Мысли"
              className="w-full border p-2 rounded"
              rows={2}
              value={form.thoughts}
              onChange={e => setForm({ ...form, thoughts: e.target.value })}
              required
            />
            <textarea
              placeholder="Эмоции"
              className="w-full border p-2 rounded"
              rows={2}
              value={form.emotions}
              onChange={e => setForm({ ...form, emotions: e.target.value })}
              required
            />
            <textarea
              placeholder="Реакции (поведение)"
              className="w-full border p-2 rounded"
              rows={2}
              value={form.reactions}
              onChange={e => setForm({ ...form, reactions: e.target.value })}
              required
            />
            <button
              type="submit"
              className="w-full bg-indigo-500 text-white py-2 rounded hover:bg-indigo-600 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </form>
        </div>

        {/* История и анализ периода */}
        <div>
          <div className="bg-white p-6 rounded-xl shadow">
            <h2 className="text-xl font-medium mb-4">История</h2>
            <div className="flex gap-2 mb-4">
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="border p-1 rounded"
              />
              <span>—</span>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="border p-1 rounded"
              />
              <button
                onClick={() => fetchEntries(fromDate, toDate)}
                className="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300"
              >
                Обновить
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {entries.map(e => (
                <div key={e.id} className="border-l-4 border-indigo-300 pl-3 py-1 text-sm">
                  <div className="font-semibold">{e.entry_date}</div>
                  <div className="text-gray-600 line-clamp-2">{e.situation}</div>
                </div>
              ))}
              {entries.length === 0 && <p className="text-gray-400">Нет записей</p>}
            </div>
          </div>

          <button
            onClick={handleAnalyzePeriod}
            className="mt-4 w-full bg-green-500 text-white py-2 rounded hover:bg-green-600"
          >
            📊 Анализ за период
          </button>

          {periodAnalysis && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
              <h3 className="font-bold">📋 Итоговый анализ</h3>
              <p><span className="font-semibold">Динамика:</span> {periodAnalysis.dynamics}</p>
              <p><span className="font-semibold">Резюме:</span> {periodAnalysis.summary}</p>
              <p className="mt-2"><span className="font-semibold">Рекомендация:</span> {periodAnalysis.recommendation}</p>
              {periodAnalysis.alert && (
                <p className="mt-2 text-red-600 font-bold">⚠️ Рекомендуется обратиться к терапевту.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}