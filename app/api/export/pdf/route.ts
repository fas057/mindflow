import { NextRequest, NextResponse } from 'next/server';
import { validate, parse } from '@tma.js/init-data-node';
import { supabaseServer } from '@/lib/supabaseServer';
import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

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

    if (error) {
      throw error;
    }

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

    const moodChart = await generateMoodChart(reportEntries);

    const pdfBuffer = await generatePDF({
      entries: reportEntries,
      from,
      to,
      averageMood,
      minMood,
      maxMood,
      topEmotions,
      moodTrend,
      moodChart,
    });

    // Генерируем PDF-файл, сохраняем во временное хранилище и возвращаем публичную ссылку
    const fileName = `CBT_${from}_${to}.pdf`;
    const storagePath = `exports/${crypto.randomUUID()}-${fileName}`;

    const { error: uploadError } = await supabaseServer.storage
      .from('exports')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: urlData } = supabaseServer.storage
      .from('exports')
      .getPublicUrl(storagePath);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (error: any) {
    console.error('PDF EXPORT ERROR', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function generateMoodChart(entries: any[]) {
  const width = 700;
  const height = 300;
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

  const data = entries
    .filter((e: any) => e.mood !== null && e.mood !== undefined)
    .map((e: any) => ({ date: e.entry_date, mood: Number(e.mood) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const configuration: any = {
    type: 'line',
    data: {
      labels: data.map((x) => x.date),
      datasets: [
        {
          label: 'Настроение',
          data: data.map((x) => x.mood),
          borderWidth: 3,
          tension: 0.3,
          fill: false,
        },
      ],
    },
    options: {
      responsive: false,
      plugins: { legend: { display: true } },
      scales: { y: { min: 1, max: 10 } },
    },
  };

  return await chartJSNodeCanvas.renderToDataURL(configuration);
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
  moodChart: string;
}): Promise<Buffer> {
  return new Promise((resolve) => {
    const { entries, from, to, averageMood, minMood, maxMood, topEmotions, moodTrend, moodChart } =
      report;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    // Шрифт
    const fontPath = path.join(process.cwd(), 'public/fonts/DejaVuSans.ttf');
    const font = fs.readFileSync(fontPath).toString('base64');
    doc.addFileToVFS('DejaVuSans.ttf', font);
    doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
    doc.setFont('DejaVuSans');

    let y = 20;

    function addText(text: string, size = 11, x = 20) {
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, pageWidth - 40);
      doc.text(lines, x, y);
      y += lines.length * 6 + 5;
    }

    function checkPage() {
      if (y > pageHeight - 30) {
        doc.addPage();
        y = 20;
      }
    }

    // Заголовок
    doc.setFontSize(20);
    doc.text('Отчёт КПТ-дневника', pageWidth / 2, y, { align: 'center' });
    y += 12;
    doc.setFontSize(11);
    doc.text(`Период: ${from} — ${to}`, pageWidth / 2, y, { align: 'center' });
    y += 15;
    doc.line(20, y, pageWidth - 20, y);
    y += 15;

    // Статистика
    doc.setFontSize(16);
    doc.text('Общая статистика', 20, y);
    y += 10;
    addText(`Количество записей: ${entries.length}`);
    addText(`Среднее настроение: ${averageMood ?? '-'} / 10`);
    addText(`Минимальная оценка: ${minMood ?? '-'} / 10`);
    addText(`Максимальная оценка: ${maxMood ?? '-'} / 10`);
    addText(`Динамика настроения: ${moodTrend}`);
    y += 5;

    // Топ эмоций
    checkPage();
    doc.setFontSize(16);
    doc.text('Топ эмоций', 20, y);
    y += 10;
    doc.setFontSize(11);

    if (topEmotions.length) {
      topEmotions.forEach((em, index) => {
        addText(
          `${index + 1}. ${em.name} — ${em.count} раз, средняя интенсивность ${em.avgIntensity}/10`
        );
      });
    } else {
      addText('Эмоции не указаны');
    }

    // График
    if (moodChart) {
      checkPage();
      doc.setFontSize(16);
      doc.text('Динамика настроения', 20, y);
      y += 10;
      doc.addImage(moodChart, 'PNG', 20, y, 170, 70);
      y += 85;
    }

    // Записи
    checkPage();
    doc.setFontSize(16);
    doc.text('Последние записи', 20, y);
    y += 12;
    doc.setFontSize(10);

    entries.slice(-15).forEach((e: any) => {
      checkPage();
      const emotions =
        (e.emotions_details || [])
          .map((em: any) => `${em.name} (${em.intensity})`)
          .join(', ') || '-';

      const text = `Дата: ${e.entry_date}\nСитуация:\n${e.situation || '-'}\nМысли:\n${e.thoughts || '-'}\nЭмоции:\n${emotions}\nРеакции:\n${e.reactions || '-'}\nНастроение:\n${e.mood ?? '-'}/10`;

      const lines = doc.splitTextToSize(text, 160);
      doc.roundedRect(20, y - 5, 170, lines.length * 5 + 10, 3, 3);
      doc.text(lines, 25, y);
      y += lines.length * 5 + 18;
    });

    // Номера страниц
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.text(`Страница ${i} из ${pages}`, pageWidth - 50, pageHeight - 10);
    }

    resolve(Buffer.from(doc.output('arraybuffer')));
  });
}