import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import https from 'https';
import { validate } from '@tma.js/init-data-node';
import { supabaseServer } from '@/lib/supabaseServer';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const GIGACHAT_OAUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
const GIGACHAT_API_URL = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions';

let cachedToken: string | null = null;
let tokenExpiry: number = 0;
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function validateRequest(request: NextRequest) {
  const initData = request.headers.get('x-telegram-init-data');
  if (!initData) return false;
  try {
    await validate(initData, TELEGRAM_BOT_TOKEN);
    return true;
  } catch {
    return false;
  }
}

async function getToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) return cachedToken;

  const clientId = process.env.GIGACHAT_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.GIGACHAT_CLIENT_SECRET?.trim() || '';
  const scope = process.env.GIGACHAT_SCOPE?.trim() || 'GIGACHAT_API_PERS';

  if (!clientId || !clientSecret) {
    throw new Error('GigaChat credentials missing');
  }

  const response = await axios.post(
    GIGACHAT_OAUTH_URL,
    new URLSearchParams({ scope }).toString(),
    {
      headers: {
        'RqUID': crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      auth: { username: clientId, password: clientSecret },
      httpsAgent,
    }
  );

  const { access_token, expires_in } = response.data;
  cachedToken = access_token;
  tokenExpiry = now + (expires_in - 60) * 1000;
  return access_token;
}

function extractJSON(text: string): any {
  const start = text.indexOf('{');
  if (start === -1) throw new Error('Нет JSON');
  let depth = 0, end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) throw new Error('Не найдена закрывающая скобка');
  return JSON.parse(text.substring(start, end + 1));
}

export async function POST(request: NextRequest) {
  try {
    const isValid = await validateRequest(request);
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { from, to, userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'Missing user ID' }, { status: 400 });
    }

    const { data: entries, error } = await supabaseServer
      .from('diary_entries')
      .select('*')
      .eq('user_id', userId)
      .gte('entry_date', from)
      .lte('entry_date', to)
      .order('entry_date', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!entries || entries.length === 0) {
      return NextResponse.json({ error: 'Нет записей' }, { status: 400 });
    }

    const entriesText = entries.map(e =>
      `Дата: ${e.entry_date}\nСитуация: ${e.situation}\nМысли: ${e.thoughts}\nЭмоции: ${e.emotions}\nРеакции: ${e.reactions}`
    ).join('\n---\n');

    const prompt = `
Ты — КПТ-терапевт. Перед тобой дневниковые записи (СМЭР) клиента за период с ${from} по ${to}.
Записи:
${entriesText}

Проанализируй динамику: есть ли улучшение/ухудшение, повторяются ли негативные мысли, какие эмоции преобладают, как меняются реакции.

Сделай общий вывод в формате JSON:
{
  "summary": "краткое резюме (2-3 предложения)",
  "recommendation": "рекомендация (поддержка или совет обратиться к специалисту)",
  "dynamics": "положительная/отрицательная/стабильная",
  "alert": true или false
}
`;

    const token = await getToken();
    const gigaResponse = await axios.post(
      GIGACHAT_API_URL,
      {
        model: 'GigaChat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 800,
      },
      {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        httpsAgent,
      }
    );

    const content = gigaResponse.data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Пустой ответ');

    const analysis = extractJSON(content);
    return NextResponse.json(analysis);
  } catch (error: any) {
    console.error('Ошибка агрегированного анализа:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}