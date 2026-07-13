import { NextRequest, NextResponse } from 'next/server';
import { validate, parse } from '@tma.js/init-data-node';
import { supabaseServer } from '@/lib/supabaseServer';
import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;

async function getTelegramUser(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const initData =
    request.headers.get('x-telegram-init-data') || searchParams.get('initData');

  if (!initData) {
    throw new Error('Missing init data');
  }

  await validate(initData, TELEGRAM_BOT_TOKEN);
  const parsed = parse(initData);
  const telegramId = parsed.user?.id;

  if (!telegramId) {
    throw new Error('User not found');
  }

  return String(telegramId);
}

async function getProfileId(telegramId: string) {
  const { data, error } = await supabaseServer
    .from('profiles')
    .select('id')
    .eq('telegram_id', telegramId)
    .single();

  if (error || !data) {
    throw new Error('Profile not found');
  }

  return data.id;
}

export async function GET(request: NextRequest) {
  try {
    const telegramId = await getTelegramUser(request);
    const profileId = await getProfileId(telegramId);

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!from || !to) {
      return NextResponse.json({ error: 'Period missing' }, { status: 400 });
    }

    const { data: entries, error } = await supabaseServer
      .from('diary_entries')
      .select('*')
      .eq('user_id', profileId)
      .gte('entry_date', from)
      .lte('entry_date', to)
      .order('entry_date', { ascending: true });

    if (error) throw error;

    const reportEntries = entries || [];

    const moods = reportEntries
      .filter((e: any) => e.mood !== null && e.mood !== undefined)
      .map((e: any) => Number(e.mood));

    const averageMood = moods.length
      ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10
      : null;

    const minMood = moods.length ? Math.min(...moods) : null;
    const maxMood = moods.length ? Math.max(...moods) : null;

    const emotionMap: Record<string, { count: number; intensity: number }> = {};

    reportEntries.forEach((e: any) => {
      (e.emotions_details || []).forEach((em: any) => {
        if (!emotionMap[em.name]) {
          emotionMap[em.name] = { count: 0, intensity: 0 };
        }
        emotionMap[em.name].count++;
        emotionMap[em.name].intensity += Number(em.intensity || 0);
      });
    });

    const topEmotions = Object.entries(emotionMap)
      .map(([name, data]) => ({
        name,
        count: data.count,
        avgIntensity: Math.round((data.intensity / data.count) * 10) / 10,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    let moodTrend = 'стабильное';
    if (moods.length >= 2) {
      const middle = Math.ceil(moods.length / 2);
      const first = moods.slice(0, middle);
      const second = moods.slice(middle);

      const firstAvg = first.reduce((a, b) => a + b, 0) / first.length;
      const secondAvg = second.reduce((a, b) => a + b, 0) / second.length;

      if (secondAvg - firstAvg >= 1) moodTrend = 'улучшение ↑';
      if (firstAvg - secondAvg >= 1) moodTrend = 'ухудшение ↓';
    }

    const pdfBuffer = await generatePDF({
      entries: reportEntries,
      from,
      to,
      averageMood,
      minMood,
      maxMood,
      topEmotions,
      moodTrend,
    });

    // Сохраняем PDF в Supabase Storage (как CSV)
    const fileName = `CBT_${from}_${to}.pdf`;
    const storagePath = `exports/${crypto.randomUUID()}-${fileName}`;

    const { error: uploadError } = await supabaseServer.storage
      .from('exports')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabaseServer.storage
      .from('exports')
      .getPublicUrl(storagePath);

    // Возвращаем URL в JSON (точно как CSV)
    return NextResponse.json({ url: urlData.publicUrl }, { status: 200 });
  } catch (error: any) {
    console.error('PDF EXPORT ERROR', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function generatePDF(report: {
  entries: any[];
  from: string;
  to: string;
  averageMood: number | null;
  minMood: number | null;
  maxMood: number | null;
  topEmotions: any[];
  moodTrend: string;
}): Promise<Buffer> {
  return new Promise((resolve) => {
    const { entries, from, to, averageMood, minMood, maxMood, topEmotions, moodTrend } = report;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    const primaryColor: [number, number, number] = [99, 102, 241];
    const textDark: [number, number, number] = [30, 41, 59];
    const textGray: [number, number, number] = [100, 116, 139];
    const white: [number, number, number] = [255, 255, 255];

    const fontPath = path.join(process.cwd(), 'public/fonts/DejaVuSans.ttf');
    const font = fs.readFileSync(fontPath).toString('base64');
    doc.addFileToVFS('DejaVuSans.ttf', font);
    doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
    doc.setFont('DejaVuSans');

    const addHeader = () => {
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, pageWidth, 40, 'F');
      doc.setFontSize(22);
      doc.setTextColor(...white);
      doc.text('🧠 КПТ-отчёт', pageWidth / 2, 20, { align: 'center' });
      doc.setFontSize(11);
      doc.text(`Период: ${from} — ${to}`, pageWidth / 2, 32, { align: 'center' });
      doc.setTextColor(0, 0, 0);
    };

    const checkPage = (neededSpace: number) => {
      if (y + neededSpace > pageHeight - 20) {
        doc.addPage();
        y = 20;
        addHeader();
        y += 25;
      }
    };

    const drawProgressBar = (x: number, y: number, w: number, h: number, percent: number) => {
      doc.setFillColor(230, 234, 242);
      doc.roundedRect(x, y, w, h, 1, 1, 'F');
      const fillWidth = Math.max(0, (w * Math.min(percent, 1)));
      if (fillWidth > 0) {
        doc.setFillColor(...primaryColor);
        doc.roundedRect(x, y, fillWidth, h, 1, 1, 'F');
      }
    };

    addHeader();
    let y = 50;

    // Сводка
    checkPage(60);
    doc.setFontSize(16);
    doc.setTextColor(...primaryColor);
    doc.text('📊 Общая статистика', 15, y);
    y += 8;
    doc.setFontSize(10);
    doc.setTextColor(...textDark);

    const stats = [
      { emoji: '📝', label: 'Записей:', value: entries.length.toString() },
      { emoji: '📈', label: 'Среднее настроение:', value: averageMood ? `${averageMood}/10` : '—' },
      { emoji: '🔽', label: 'Минимум:', value: minMood ? `${minMood}/10` : '—' },
      { emoji: '🔼', label: 'Максимум:', value: maxMood ? `${maxMood}/10` : '—' },
      { emoji: moodTrend.includes('улучшение') ? '⬆️' : moodTrend.includes('ухудшение') ? '⬇️' : '➡️', label: 'Динамика:', value: moodTrend },
    ];

    stats.forEach((stat) => {
      doc.setFillColor(245, 247, 255);
      doc.roundedRect(15, y, 180, 10, 2, 2, 'F');
      doc.text(`${stat.emoji} ${stat.label} ${stat.value}`, 18, y + 7);
      y += 14;
    });

    // Топ эмоций
    y += 5;
    checkPage(20 + topEmotions.length * 16);
    doc.setFontSize(16);
    doc.setTextColor(...primaryColor);
    doc.text('🎭 Самые частые эмоции', 15, y);
    y += 10;

    if (topEmotions.length === 0) {
      doc.setFontSize(10);
      doc.setTextColor(...textGray);
      doc.text('Нет данных об эмоциях', 15, y);
      y += 10;
    } else {
      topEmotions.forEach((em) => {
        checkPage(16);
        const maxCount = topEmotions[0]?.count || 1;
        const percent = em.count / maxCount;
        const emoji = getEmotionEmoji(em.name);
        doc.setFontSize(10);
        doc.setTextColor(...textDark);
        doc.text(`${emoji} ${em.name}`, 15, y + 5);
        doc.text(`${em.count} раз`, 90, y + 5);
        doc.text(`ср. ${em.avgIntensity}/10`, 130, y + 5);
        drawProgressBar(15, y + 8, 180, 4, percent);
        y += 16;
      });
    }

    // Записи
    y += 8;
    checkPage(30);
    doc.setFontSize(16);
    doc.setTextColor(...primaryColor);
    doc.text('📋 Последние записи', 15, y);
    y += 10;

    entries.slice(-15).forEach((e: any) => {
      const emotionsText = (e.emotions_details || [])
        .map((em: any) => `${getEmotionEmoji(em.name)} ${em.name}(${em.intensity})`)
        .join(', ') || '—';

      const moodText = e.mood ? `${e.mood}/10` : '—';

      const lines = [
        `📅 ${e.entry_date}`,
        `💬 Ситуация: ${e.situation || '—'}`,
        `🧠 Мысли: ${e.thoughts || '—'}`,
        `😌 Эмоции: ${emotionsText}`,
        `🏃 Реакции: ${e.reactions || '—'}`,
        `🌡️ Настроение: ${moodText}`,
      ];

      const estimatedHeight = lines.length * 8 + 12;
      checkPage(estimatedHeight);

      doc.setFillColor(248, 250, 252);
      doc.roundedRect(12, y, 186, estimatedHeight, 2, 2, 'F');
      doc.setTextColor(...textDark);
      doc.setFontSize(9);
      lines.forEach((line, i) => {
        doc.text(line, 16, y + 8 + i * 8);
      });
      y += estimatedHeight + 4;
    });

    // Номера страниц
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setTextColor(...textGray);
      doc.text(`Страница ${i} из ${pages}`, pageWidth - 40, pageHeight - 10, { align: 'right' });
    }

    resolve(Buffer.from(doc.output('arraybuffer')));
  });
}

function getEmotionEmoji(name: string): string {
  const map: Record<string, string> = {
    радость: '😊', грусть: '😢', гнев: '😠', страх: '😨', удивление: '😲',
    отвращение: '🤢', спокойствие: '😌', тревога: '😰', вина: '😔', стыд: '😳',
    обида: '😤', злость: '🤬', раздражение: '😒', восторг: '🤩', любовь: '❤️',
    благодарность: '🙏', надежда: '🌟', уныние: '😞', апатия: '😐', интерес: '🤔',
    скука: '🥱', нежность: '🥰', гордость: '😎', печаль: '😥',
  };
  return map[name] || '🔹';
}