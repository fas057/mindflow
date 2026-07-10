import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import https from 'https';
import { validate } from '@telegram-apps/init-data-node';

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
    // Валидация Telegram
    const isValid = await validateRequest(request);
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { text } = await request.json();
    if (!text || text.trim().length < 5) {
      return NextResponse.json({ error: 'Текст слишком короткий' }, { status: 400 });
    }

    const token = await getToken();

    const prompt = `
Ты — КПТ-терапевт. Найди в тексте клиента когнитивные искажения.
ОТВЕЧАЙ ТОЛЬКО В ФОРМАТЕ JSON.
Формат:
{
  "distortions": [
    { "type": "тип", "quote": "цитата", "rational_response": "ответ" }
  ],
  "gentle_summary": "поддерживающая фраза"
}
Если искажений нет, верни пустой массив.

Текст: ${text}
`;

    const gigaResponse = await axios.post(
      GIGACHAT_API_URL,
      {
        model: 'GigaChat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.0,
        max_tokens: 1000,
      },
      {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        httpsAgent,
      }
    );

    const content = gigaResponse.data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Пустой ответ');

    const analysis = extractJSON(content);
    if (!analysis.distortions) analysis.distortions = [];
    if (!analysis.gentle_summary) analysis.gentle_summary = '';

    return NextResponse.json(analysis);
  } catch (error: any) {
    console.error('Ошибка анализа:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}