'use client';

import { useEffect, useState, useRef } from 'react';
import { supabaseClient } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import html2canvas from 'html2canvas';
import pdfMake from 'pdfmake/build/pdfmake';

// ---------- КОМПОНЕНТ ПОДСКАЗКИ ----------
const FieldWithTooltip: React.FC<{ label: string; tooltip: string; children: React.ReactNode }> = ({
  label,
  tooltip,
  children,
}) => {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
        {label}
        <span className="relative group inline-block cursor-help">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 text-gray-400 group-hover:text-indigo-500 transition-colors"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="absolute hidden group-hover:block bg-gray-800 text-white text-xs rounded-md p-2 w-56 -left-24 top-6 z-50 shadow-lg">
            {tooltip}
          </span>
        </span>
      </label>
      {children}
    </div>
  );
};

// ---------- КАСТОМНЫЙ АВТОКОМПЛИТ ----------
const EmotionAutocomplete: React.FC<{
  value: string;
  onChange: (value: string) => void;
  onSelect: (emotion: string) => void;
  placeholder?: string;
}> = ({ value, onChange, onSelect, placeholder = 'Выберите эмоцию или начните ввод' }) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const EMOTIONS_LIST = [
    'радость', 'грусть', 'гнев', 'страх', 'удивление', 'отвращение',
    'спокойствие', 'тревога', 'вина', 'стыд', 'обида', 'злость',
    'раздражение', 'восторг', 'любовь', 'благодарность', 'надежда',
    'уныние', 'апатия', 'интерес', 'скука', 'нежность', 'гордость', 'печаль'
  ];

  const EMOTION_EMOJI_MAP: Record<string, string> = {
    радость: '😊',
    грусть: '😢',
    гнев: '😠',
    страх: '😨',
    удивление: '😲',
    отвращение: '🤢',
    спокойствие: '😌',
    тревога: '😰',
    вина: '😔',
    стыд: '😳',
    обида: '😤',
    злость: '🤬',
    раздражение: '😒',
    восторг: '🤩',
    любовь: '❤️',
    благодарность: '🙏',
    надежда: '🌟',
    уныние: '😞',
    апатия: '😐',
    интерес: '🤔',
    скука: '🥱',
    нежность: '🥰',
    гордость: '😎',
    печаль: '😥',
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    if (val.length > 0) {
      const filtered = EMOTIONS_LIST.filter(em =>
        em.toLowerCase().includes(val.toLowerCase())
      );
      setSuggestions(filtered);
      setShowSuggestions(true);
    } else {
      setSuggestions(EMOTIONS_LIST);
      setShowSuggestions(true);
    }
  };

  const handleFocus = () => {
    if (value.length === 0) {
      setSuggestions(EMOTIONS_LIST);
      setShowSuggestions(true);
    } else {
      const filtered = EMOTIONS_LIST.filter(em =>
        em.toLowerCase().includes(value.toLowerCase())
      );
      setSuggestions(filtered);
      setShowSuggestions(true);
    }
  };

  const handleSelect = (emotion: string) => {
    onSelect(emotion);
    onChange(emotion);
    setShowSuggestions(false);
    inputRef.current?.blur();
  };

  return (
    <div className="relative flex-1 min-w-0">
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors"
      />
      {showSuggestions && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
          {suggestions.map((em) => (
            <li
              key={em}
              onMouseDown={() => handleSelect(em)}
              className="px-4 py-2 hover:bg-indigo-50 cursor-pointer flex items-center gap-2"
            >
              <span>{EMOTION_EMOJI_MAP[em] || '🔹'}</span>
              <span>{em}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ---------- ТИПЫ ----------
type Emotion = {
  name: string;
  intensity: number;
};

type Entry = {
  id: string;
  entry_date: string;
  situation: string;
  thoughts: string;
  emotions: string | null;
  emotions_details: Emotion[];
  reactions: string;
  mood: number | null;
  analysis: any;
};

// ---------- КАРТА ЭМОДЗИ ----------
const EMOTION_EMOJI_MAP: Record<string, string> = {
  радость: '😊',
  грусть: '😢',
  гнев: '😠',
  страх: '😨',
  удивление: '😲',
  отвращение: '🤢',
  спокойствие: '😌',
  тревога: '😰',
  вина: '😔',
  стыд: '😳',
  обида: '😤',
  злость: '🤬',
  раздражение: '😒',
  восторг: '🤩',
  любовь: '❤️',
  благодарность: '🙏',
  надежда: '🌟',
  уныние: '😞',
  апатия: '😐',
  интерес: '🤔',
  скука: '🥱',
  нежность: '🥰',
  гордость: '😎',
  печаль: '😥',
};

// ---------- ПРИВЕТСТВИЕ ПО ВРЕМЕНИ ----------
const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'Доброе утро';
  if (hour >= 12 && hour < 18) return 'Добрый день';
  if (hour >= 18 && hour < 23) return 'Добрый вечер';
  return 'Доброй ночи';
};

export default function Dashboard() {
  const router = useRouter();

  // ---------- СОСТОЯНИЯ ----------
  const [userData, setUserData] = useState<any>(null);
  const [userName, setUserName] = useState<string>('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [periodAnalysis, setPeriodAnalysis] = useState<any>(null);
  const [fromDate, setFromDate] = useState(
    new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);

  const [form, setForm] = useState({
    entry_date: new Date().toISOString().split('T')[0],
    situation: '',
    thoughts: '',
    reactions: '',
    mood: 5,
  });

  const [selectedEmotion, setSelectedEmotion] = useState('');
  const [emotionIntensity, setEmotionIntensity] = useState(5);
  const [emotionList, setEmotionList] = useState<Emotion[]>([]);

  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [editForm, setEditForm] = useState({
    entry_date: '',
    situation: '',
    thoughts: '',
    reactions: '',
    mood: 5,
  });
  const [editEmotionList, setEditEmotionList] = useState<Emotion[]>([]);
  const [editSelectedEmotion, setEditSelectedEmotion] = useState('');
  const [editEmotionIntensity, setEditEmotionIntensity] = useState(5);
  const [editLoading, setEditLoading] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {

  const initTelegram = () => {

    try {

      const tg = window.Telegram?.WebApp;


      if (!tg) {
        console.error(
          'Telegram WebApp API не найден'
        );

        setTelegramError(true);
        return;
      }


      tg.ready();

      tg.expand();


      console.log(
        'Telegram initData:',
        tg.initData
      );


      console.log(
        'Telegram user:',
        tg.initDataUnsafe?.user
      );


      setInitDataRaw(
        tg.initData || ''
      );


      if (tg.initDataUnsafe?.user) {

        setTelegramUser(
          tg.initDataUnsafe.user
        );

      }


      setTelegramReady(true);


    } catch (error) {

      console.error(
        'Telegram init error:',
        error
      );

      setTelegramError(true);

    }

  };


  initTelegram();


}, []);



  
  // ---------- ЗАГРУЗКА ПРОФИЛЯ ПО TELEGRAM ID ----------
  const fetchOrCreateProfile = async (
  telegramId: number,
  firstName: string,
  lastName: string,
  username: string
) => {

  console.log(
    'CREATE PROFILE START',
    telegramId
  );


  const {
    data: profile,
    error
  } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('telegram_id', telegramId)
    .maybeSingle();


  console.log(
    'PROFILE SELECT RESULT',
    {
      profile,
      error
    }
  );


  if (profile) {
    console.log('PROFILE EXISTS');
    return profile;
  }


  const fullName =
    `${firstName} ${lastName}`.trim() ||
    firstName ||
    'Пользователь';


  console.log(
    'TRY INSERT PROFILE',
    {
      telegramId,
      fullName
    }
  );


  const {
    data: newProfile,
    error: insertError
  } = await supabaseClient
    .from('profiles')
    .insert({
      telegram_id: telegramId,
      email: `${telegramId}@telegram.local`,
      full_name: fullName,
      username: username || '',
      role: 'client',
    })
    .select()
    .single();


  console.log(
    'INSERT RESULT',
    {
      newProfile,
      insertError
    }
  );


  if (insertError) {
    console.error(
      'Ошибка создания профиля:',
      insertError
    );

    return null;
  }


  return newProfile;
};



  const fetchEntries = async () => {
  const res = await fetch('/api/entries', {
    headers: {
      'x-telegram-init-data': initDataRaw,
    },
  });

  const data = await res.json();

  console.log('ENTRIES RESPONSE:', data);

  if (Array.isArray(data)) {
    setEntries(data);
  } else {
    setEntries([]);
  }
};
// ---------- TELEGRAM DATA ----------
  const [telegramUser, setTelegramUser] = useState<any>(null);
  const [initDataRaw, setInitDataRaw] = useState<string>('');
  const [telegramReady, setTelegramReady] = useState<boolean>(false);
  const [telegramError, setTelegramError] = useState<boolean>(false);
  useEffect(() => {
    if (!telegramReady) return;
    if (!telegramUser) {
      setUserName('Гость (откройте в Telegram)');
      return;
    }

    const init = async () => {
      const firstName = telegramUser.first_name || '';
      const lastName = telegramUser.last_name || '';
      const username = telegramUser.username || '';
      const profile = await fetchOrCreateProfile(telegramUser.id, firstName, lastName, username);
      if (profile) {
        setUserData(profile);
        setUserName(profile.full_name || firstName || 'Пользователь');
        fetchEntries();
      } else {
        setUserName('Гость');
      }
    };
    init();
  }, [telegramReady, telegramUser, initDataRaw]);

  // ---------- ОСТАЛЬНЫЕ ФУНКЦИИ ----------
  const addEmotion = () => {
    if (!selectedEmotion) return;
    if (emotionList.some(e => e.name === selectedEmotion)) {
      alert('Эта эмоция уже добавлена');
      return;
    }
    setEmotionList([...emotionList, { name: selectedEmotion, intensity: emotionIntensity }]);
    setSelectedEmotion('');
    setEmotionIntensity(5);
  };

  const removeEmotion = (index: number) => {
    setEmotionList(emotionList.filter((_, i) => i !== index));
  };

  const addEditEmotion = () => {
    if (!editSelectedEmotion) return;
    if (editEmotionList.some(e => e.name === editSelectedEmotion)) {
      alert('Эта эмоция уже добавлена');
      return;
    }
    setEditEmotionList([...editEmotionList, { name: editSelectedEmotion, intensity: editEmotionIntensity }]);
    setEditSelectedEmotion('');
    setEditEmotionIntensity(5);
  };

  const removeEditEmotion = (index: number) => {
    setEditEmotionList(editEmotionList.filter((_, i) => i !== index));
  };

  const filteredEntries = entries.filter((e) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    const searchable = [
      e.situation,
      e.thoughts,
      e.emotions,
      e.reactions,
      e.entry_date,
      ...(e.emotions_details || []).map(em => em.name),
    ].join(' ').toLowerCase();
    return searchable.includes(term);
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/entries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userData.id,
        'x-telegram-init-data': initDataRaw,
      },
      body: JSON.stringify({
        ...form,
        emotions_details: emotionList,
      }),
    });
    if (res.ok) {
      const newEntry = await res.json();
      setForm({
        ...form,
        situation: '',
        thoughts: '',
        reactions: '',
        mood: 5,
      });
      setEmotionList([]);
      fetchEntries();

      if (newEntry.id) {
        const emotionText = emotionList.map(e => `${e.name} (${e.intensity}/10)`).join(', ');
        const fullText = `Ситуация: ${newEntry.situation}\nМысли: ${newEntry.thoughts}\nЭмоции: ${emotionText || 'не указаны'}\nРеакции: ${newEntry.reactions}`;
        try {
          const analyzeRes = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-telegram-init-data': initDataRaw,
            },
            body: JSON.stringify({ text: fullText }),
          });
          if (analyzeRes.ok) {
            const analysis = await analyzeRes.json();
            await fetch('/api/entries', {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'x-user-id': userData.id,
                'x-telegram-init-data': initDataRaw,
              },
              body: JSON.stringify({ id: newEntry.id, analysis }),
            });
          }
        } catch (err) {
          console.warn('Автоанализ не удался');
        }
      }
    } else {
      const err = await res.json();
      alert(err.error || 'Ошибка сохранения');
    }
    setLoading(false);
  };

  const handleAnalyzePeriod = async () => {
    const res = await fetch('/api/analyze-period', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userData.id,
        'x-telegram-init-data': initDataRaw,
      },
      body: JSON.stringify({ from: fromDate, to: toDate, userId: userData.id }),
    });
    const data = await res.json();
    if (res.ok) setPeriodAnalysis(data);
    else alert(data.error || 'Ошибка анализа');
  };

  const exportCSV = async () => {

  try {

    const res = await fetch(
      `/api/export/csv?from=${fromDate}&toDate=${toDate}`,
      {
        headers: {
          'x-telegram-init-data': initDataRaw,
        },
      }
    );


    if (!res.ok) {
      const error = await res.json();
      alert(error.error || 'Ошибка экспорта CSV');
      return;
    }


    const blob = await res.blob();


    const url = URL.createObjectURL(blob);


    // Открываем файл вместо принудительного download
    // чтобы Telegram Mini App не блокировал sandbox
    window.open(url, '_blank');


    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 5000);


  } catch (error) {

    console.error(
      'CSV export error:',
      error
    );

    alert('Не удалось экспортировать CSV');

  }

};

  const exportPDF = async () => {
    const periodEntries = entries.filter(e => 
      e.entry_date >= fromDate && e.entry_date <= toDate
    );
    if (periodEntries.length === 0) {
      alert('Нет записей за выбранный период.');
      return;
    }

    const total = periodEntries.length;
    const moods = periodEntries.filter(e => e.mood !== null).map(e => e.mood as number);
    const avgMood = moods.length > 0 ? Math.round(moods.reduce((a,b) => a+b, 0) / moods.length * 10) / 10 : null;

    const emotionStats: Record<string, { count: number, totalIntensity: number }> = {};
    periodEntries.forEach(e => {
      if (!e.emotions_details) return;
      e.emotions_details.forEach(em => {
        if (!emotionStats[em.name]) emotionStats[em.name] = { count: 0, totalIntensity: 0 };
        emotionStats[em.name].count += 1;
        emotionStats[em.name].totalIntensity += em.intensity;
      });
    });
    const topEmotions = Object.entries(emotionStats)
      .map(([name, data]) => ({
        name,
        count: data.count,
        avgIntensity: Math.round(data.totalIntensity / data.count * 10) / 10,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    let chartImage = '';
    const chartElement = chartContainerRef.current;
    if (chartElement) {
      try {
        const canvas = await html2canvas(chartElement, { scale: 2, useCORS: true, logging: false });
        chartImage = canvas.toDataURL('image/png');
      } catch (e) {
        console.warn('Не удалось захватить график', e);
      }
    }

    pdfMake.addFonts({
      Roboto: {
        normal: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.72/fonts/Roboto/Roboto-Regular.ttf',
        bold: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.72/fonts/Roboto/Roboto-Medium.ttf',
        italics: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.72/fonts/Roboto/Roboto-Italic.ttf',
        bolditalics: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.72/fonts/Roboto/Roboto-MediumItalic.ttf'
      }
    });

    const content: any[] = [];
    content.push({
      text: '📊 Отчёт КПТ-дневника',
      style: 'header',
      alignment: 'center',
      margin: [0, 0, 0, 10],
    });
    content.push({
      text: `Период: ${fromDate} — ${toDate}`,
      style: 'subheader',
      alignment: 'center',
      margin: [0, 0, 0, 5],
    });
    content.push({
      text: `Количество записей: ${total}`,
      margin: [0, 0, 0, 5],
    });
    if (avgMood !== null) {
      content.push({
        text: `Среднее настроение: ${avgMood}/10`,
        margin: [0, 0, 0, 5],
      });
    }
    if (topEmotions.length > 0) {
      content.push({
        text: 'Топ эмоции:',
        margin: [0, 5, 0, 5],
      });
      topEmotions.forEach((em, idx) => {
        content.push({
          text: `  ${idx+1}. ${em.name} (${em.count} раз, ср. интенсивность ${em.avgIntensity})`,
          margin: [0, 0, 0, 3],
        });
      });
    } else {
      content.push({
        text: 'Эмоции не указаны',
        margin: [0, 5, 0, 5],
      });
    }
    if (chartImage) {
      content.push({
        image: chartImage,
        width: 500,
        alignment: 'center',
        margin: [0, 10, 0, 10],
      });
    }
    if (periodAnalysis) {
      content.push({
        text: '📋 Анализ',
        style: 'subheader',
        margin: [0, 10, 0, 5],
      });
      content.push({
        text: `Динамика: ${periodAnalysis.dynamics}`,
        margin: [0, 0, 0, 3],
      });
      content.push({
        text: `Резюме: ${periodAnalysis.summary}`,
        margin: [0, 0, 0, 3],
      });
      content.push({
        text: `Рекомендация: ${periodAnalysis.recommendation}`,
        margin: [0, 0, 0, 3],
      });
      if (periodAnalysis.alert) {
        content.push({
          text: '⚠️ Рекомендуется обратиться к терапевту.',
          color: 'red',
          margin: [0, 5, 0, 5],
        });
      }
    } else {
      content.push({
        text: '(Анализ не выполнен. Нажмите "Анализ периода" перед экспортом.)',
        margin: [0, 10, 0, 5],
        color: 'gray',
      });
    }
    content.push({
      text: '📝 Записи',
      style: 'subheader',
      margin: [0, 10, 0, 5],
    });
    const maxEntries = Math.min(periodEntries.length, 15);
    for (let i = 0; i < maxEntries; i++) {
      const e = periodEntries[i];
      const emotionsStr = e.emotions_details?.map(em => `${em.name}(${em.intensity})`).join(', ') || '—';
      content.push({
        text: `${e.entry_date}: ${e.situation} [${emotionsStr}]`,
        margin: [0, 0, 0, 3],
        fontSize: 10,
      });
    }
    if (periodEntries.length > 15) {
      content.push({
        text: `... и ещё ${periodEntries.length - 15} записей`,
        margin: [0, 0, 0, 3],
        fontSize: 10,
      });
    }
    const styles = {
      header: { fontSize: 18, bold: true },
      subheader: { fontSize: 14, bold: true },
    };
    const docDefinition = {
      content,
      styles,
      defaultStyle: {
        font: 'Roboto',
        fontSize: 12,
      },
    };
    pdfMake.createPdf(docDefinition).download(`КПТ-отчёт_${fromDate}_${toDate}.pdf`);
  };

  const handleLogout = () => {
    setUserData(null);
    setEntries([]);
    router.push('/');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить запись?')) return;
    const res = await fetch(`/api/entries?id=${id}`, {
      method: 'DELETE',
      headers: {
        'x-user-id': userData.id,
        'x-telegram-init-data': initDataRaw,
      },
    });
    if (res.ok) fetchEntries();
    else {
      const err = await res.json();
      alert(err.error || 'Ошибка удаления');
    }
  };

  const openEditModal = (entry: Entry) => {
    setEditingEntry(entry);
    setEditForm({
      entry_date: entry.entry_date,
      situation: entry.situation,
      thoughts: entry.thoughts,
      reactions: entry.reactions,
      mood: entry.mood ?? 5,
    });
    setEditEmotionList(entry.emotions_details || []);
    setEditSelectedEmotion('');
    setEditEmotionIntensity(5);
  };

  const closeEditModal = () => {
    setEditingEntry(null);
    setEditForm({
      entry_date: '',
      situation: '',
      thoughts: '',
      reactions: '',
      mood: 5,
    });
    setEditEmotionList([]);
    setEditSelectedEmotion('');
    setEditEmotionIntensity(5);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;
    setEditLoading(true);
    const res = await fetch('/api/entries', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userData.id,
        'x-telegram-init-data': initDataRaw,
      },
      body: JSON.stringify({
        id: editingEntry.id,
        ...editForm,
        emotions_details: editEmotionList,
      }),
    });
    if (res.ok) {
      closeEditModal();
      fetchEntries();
    } else {
      const err = await res.json();
      alert(err.error || 'Ошибка обновления');
    }
    setEditLoading(false);
  };

  const chartData = entries
    .filter(e => e.mood !== null && e.mood !== undefined && e.entry_date >= fromDate && e.entry_date <= toDate)
    .map(e => ({
      date: e.entry_date,
      mood: e.mood,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const emotionStats = entries.reduce((acc, entry) => {
    if (!entry.emotions_details || entry.emotions_details.length === 0) return acc;
    entry.emotions_details.forEach(e => {
      if (!acc[e.name]) acc[e.name] = { count: 0, totalIntensity: 0 };
      acc[e.name].count += 1;
      acc[e.name].totalIntensity += e.intensity;
    });
    return acc;
  }, {} as Record<string, { count: number; totalIntensity: number }>);

  const topEmotions = Object.entries(emotionStats)
    .map(([name, data]) => ({
      name,
      count: data.count,
      avgIntensity: Math.round(data.totalIntensity / data.count * 10) / 10,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ---------- РЕНДЕР ----------
  if (!telegramReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-lg text-gray-700">Загрузка Telegram...</p>
        </div>
      </div>
    );
  }

  if (telegramError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white p-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">📱</div>
          <h1 className="text-2xl font-light text-gray-800 mb-2">Не удалось подключиться к Telegram</h1>
          <p className="text-gray-600 mb-4">
            Убедитесь, что вы открываете это приложение через бота в Telegram.
            <br />
            <span className="text-sm">(Проверьте настройки Mini App в BotFather)</span>
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  if (!telegramUser) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center p-6 max-w-md">
          <div className="text-6xl mb-4">👤</div>
          <h1 className="text-2xl font-light text-gray-800 mb-2">Пользователь не найден</h1>
          <p className="text-gray-600">
            Не удалось получить данные пользователя из Telegram.
          </p>
        </div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-lg text-gray-700">Загрузка профиля...</p>
        </div>
      </div>
    );
  }

  const greeting = getGreeting();

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Шапка */}
        <div className="flex flex-wrap justify-between items-center gap-2">
          <div>
            <h1 className="text-2xl md:text-3xl font-light text-gray-800">
              🧠 Умный КПТ-дневник
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {greeting}, {userName || 'гость'}! 👋
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors"
          >
            Выйти
          </button>
        </div>

        {/* Две колонки */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Левая колонка – форма */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-medium text-gray-800 mb-4">Новая запись</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Дата</label>
                <input
                  type="date"
                  className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors"
                  value={form.entry_date}
                  onChange={e => setForm({ ...form, entry_date: e.target.value })}
                  required
                />
              </div>

              <FieldWithTooltip
                label="Ситуация"
                tooltip="Опишите конкретную ситуацию: где, когда, с кем, что произошло."
              >
                <textarea
                  placeholder="Ситуация"
                  className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors resize-none"
                  rows={2}
                  value={form.situation}
                  onChange={e => setForm({ ...form, situation: e.target.value })}
                  required
                />
              </FieldWithTooltip>

              <FieldWithTooltip
                label="Мысли"
                tooltip="Запишите автоматические мысли, возникшие в этой ситуации."
              >
                <textarea
                  placeholder="Мысли"
                  className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors resize-none"
                  rows={2}
                  value={form.thoughts}
                  onChange={e => setForm({ ...form, thoughts: e.target.value })}
                  required
                />
              </FieldWithTooltip>

              <FieldWithTooltip
                label="Эмоции"
                tooltip="Добавьте эмоции и их интенсивность от 1 до 10."
              >
                <div className="space-y-2">
                  <div className="flex gap-2 items-center">
                    <EmotionAutocomplete
                      value={selectedEmotion}
                      onChange={setSelectedEmotion}
                      onSelect={setSelectedEmotion}
                      placeholder="Выберите эмоцию или начните ввод"
                    />
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={emotionIntensity}
                      onChange={(e) => setEmotionIntensity(parseInt(e.target.value))}
                      className="w-20"
                    />
                    <span className="text-sm text-gray-500 min-w-[20px]">{emotionIntensity}</span>
                    <button
                      type="button"
                      onClick={addEmotion}
                      className="px-3 py-2 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 transition-colors"
                    >
                      ➕
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {emotionList.map((em, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-indigo-50 text-indigo-700 rounded-md">
                        {EMOTION_EMOJI_MAP[em.name] || '🔹'} {em.name} ({em.intensity})
                        <button
                          type="button"
                          onClick={() => removeEmotion(idx)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {emotionList.length === 0 && (
                      <span className="text-sm text-gray-400">Эмоции не добавлены</span>
                    )}
                  </div>
                </div>
              </FieldWithTooltip>

              <FieldWithTooltip
                label="Реакции (поведение)"
                tooltip="Что вы сделали в ответ на ситуацию?"
              >
                <textarea
                  placeholder="Реакции (поведение)"
                  className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors resize-none"
                  rows={2}
                  value={form.reactions}
                  onChange={e => setForm({ ...form, reactions: e.target.value })}
                  required
                />
              </FieldWithTooltip>

              <FieldWithTooltip
                label="Настроение"
                tooltip="Оцените общее настроение за день от 1 до 10."
              >
                <div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={form.mood}
                    onChange={e => setForm({ ...form, mood: parseInt(e.target.value) })}
                    className="w-full"
                  />
                  <span className="text-sm text-gray-500">{form.mood}/10</span>
                </div>
              </FieldWithTooltip>

              <button
                type="submit"
                className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading}
              >
                {loading ? 'Сохранение...' : 'Сохранить'}
              </button>
            </form>
          </div>

          {/* Правая колонка */}
          <div className="space-y-6">
            {/* История */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-medium text-gray-800 mb-4">История</h2>
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="🔍 Поиск по записям..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors"
                />
              </div>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {filteredEntries.map((e) => (
                  <div key={e.id} className="border-l-4 border-indigo-300 pl-3 py-2 hover:bg-gray-50 rounded-md transition-colors">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-medium text-gray-800">{e.entry_date}</div>
                        <div className="text-sm text-gray-600 line-clamp-2">{e.situation}</div>
                        {e.emotions_details && e.emotions_details.length > 0 && (
                          <div className="text-xs text-gray-400 flex flex-wrap gap-1 mt-0.5">
                            {e.emotions_details.map((em, idx) => (
                              <span key={idx} className="bg-gray-100 px-1.5 rounded">
                                {EMOTION_EMOJI_MAP[em.name] || '🔹'} {em.name}({em.intensity})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 ml-2">
                        <button
                          onClick={() => openEditModal(e)}
                          className="text-gray-400 hover:text-indigo-500 text-sm"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => handleDelete(e.id)}
                          className="text-gray-400 hover:text-red-500 text-sm"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredEntries.length === 0 && (
                  <p className="text-sm text-gray-400">
                    {searchTerm ? 'Ничего не найдено' : 'Нет записей'}
                  </p>
                )}
              </div>
            </div>

            {/* Топ эмоций */}
            {topEmotions.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <h3 className="text-lg font-medium text-gray-800 mb-2">📊 Топ эмоций</h3>
                <div className="grid grid-cols-2 gap-2">
                  {topEmotions.map((em) => (
                    <div key={em.name} className="bg-indigo-50/50 p-2 rounded-md">
                      <div className="font-medium text-gray-800">
                        {EMOTION_EMOJI_MAP[em.name] || '🔹'} {em.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {em.count} раз, ср. {em.avgIntensity}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* График */}
            {chartData.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4" ref={chartContainerRef}>
                <h3 className="text-lg font-medium text-gray-800 mb-2">📈 Динамика настроения</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fill: '#6b7280' }} />
                    <YAxis domain={[1, 10]} tick={{ fill: '#6b7280' }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="mood" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Кнопки */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[100px]">
                  <label className="block text-sm text-gray-500">С</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={e => setFromDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors text-sm"
                  />
                </div>
                <div className="flex-1 min-w-[100px]">
                  <label className="block text-sm text-gray-500">По</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={e => setToDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors text-sm"
                  />
                </div>
                <button
                  onClick={handleAnalyzePeriod}
                  className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors"
                >
                  📊 ИИ-Анализ
                </button>
                <button
                  onClick={exportPDF}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 transition-colors"
                >
                  📄 Экспорт в PDF
                </button>
                <button
                  onClick={exportCSV}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  📊 Экспорт в CSV
                </button>
              </div>
            </div>

            {periodAnalysis && (
              <div className="bg-indigo-50/50 border border-indigo-200 rounded-2xl p-4">
                <h3 className="font-semibold text-gray-800">📋 Итоговый анализ</h3>
                <p className="text-sm"><span className="font-medium">Динамика:</span> {periodAnalysis.dynamics}</p>
                <p className="text-sm"><span className="font-medium">Резюме:</span> {periodAnalysis.summary}</p>
                <p className="text-sm"><span className="font-medium">Рекомендация:</span> {periodAnalysis.recommendation}</p>
                {periodAnalysis.alert && (
                  <p className="mt-2 text-red-600 font-bold text-sm">⚠️ Рекомендуется обратиться к терапевту.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Модалка редактирования */}
      {editingEntry && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Редактировать запись</h2>
              <button
                onClick={closeEditModal}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Дата</label>
                <input
                  type="date"
                  className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors"
                  value={editForm.entry_date}
                  onChange={e => setEditForm({ ...editForm, entry_date: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Ситуация</label>
                <textarea
                  className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors resize-none"
                  rows={2}
                  value={editForm.situation}
                  onChange={e => setEditForm({ ...editForm, situation: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Мысли</label>
                <textarea
                  className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors resize-none"
                  rows={2}
                  value={editForm.thoughts}
                  onChange={e => setEditForm({ ...editForm, thoughts: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Эмоции</label>
                <div className="flex gap-2 items-center mt-1">
                  <EmotionAutocomplete
                    value={editSelectedEmotion}
                    onChange={setEditSelectedEmotion}
                    onSelect={setEditSelectedEmotion}
                    placeholder="Выберите эмоцию или начните ввод"
                  />
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={editEmotionIntensity}
                    onChange={(e) => setEditEmotionIntensity(parseInt(e.target.value))}
                    className="w-20"
                  />
                  <span className="text-sm text-gray-500 min-w-[20px]">{editEmotionIntensity}</span>
                  <button
                    type="button"
                    onClick={addEditEmotion}
                    className="px-3 py-2 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 transition-colors"
                  >
                    ➕
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {editEmotionList.map((em, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-indigo-50 text-indigo-700 rounded-md">
                      {EMOTION_EMOJI_MAP[em.name] || '🔹'} {em.name} ({em.intensity})
                      <button
                        type="button"
                        onClick={() => removeEditEmotion(idx)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {editEmotionList.length === 0 && (
                    <span className="text-sm text-gray-400">Эмоции не добавлены</span>
                  )}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Реакции (поведение)</label>
                <textarea
                  className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors resize-none"
                  rows={2}
                  value={editForm.reactions}
                  onChange={e => setEditForm({ ...editForm, reactions: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Настроение: {editForm.mood}/10</label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={editForm.mood}
                  onChange={e => setEditForm({ ...editForm, mood: parseInt(e.target.value) })}
                  className="w-full"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 transition-colors disabled:opacity-50"
                  disabled={editLoading}
                >
                  {editLoading ? 'Сохранение...' : 'Сохранить изменения'}
                </button>
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}