import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { validate, parse } from '@tma.js/init-data-node';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;

async function validateRequest(request: NextRequest): Promise<{ valid: boolean; userId: string | null; error?: string }> {
  const initData = request.headers.get('x-telegram-init-data');
  if (!initData) {
    return { valid: false, userId: null, error: 'Missing init data' };
  }
  try {
    await validate(initData, TELEGRAM_BOT_TOKEN);
    const parsed = parse(initData);
    const userId = parsed.user?.id;
    if (!userId) {
      return { valid: false, userId: null, error: 'No user in init data' };
    }
    return { valid: true, userId: String(userId) };
  } catch (e) {
    console.error('Ошибка валидации initData:', e);
    return { valid: false, userId: null, error: 'Invalid init data' };
  }
}

// ===== GET =====
export async function GET(request: NextRequest) {
  const auth = await validateRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { data, error } = await supabaseServer
    .from('diary_entries')
    .select('*')
    .eq('user_id', auth.userId)
    .order('entry_date', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// ===== POST =====
export async function POST(request: NextRequest) {
  const auth = await validateRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const body = await request.json();
  const { entry_date, situation, thoughts, emotions_details, reactions, mood } = body;

  if (!entry_date || !situation || !thoughts || !reactions) {
    return NextResponse.json({ error: 'Все поля обязательны' }, { status: 400 });
  }

  const emotionsData = Array.isArray(emotions_details) ? emotions_details : [];
  const emotionsText = emotionsData.map(e => `${e.name}(${e.intensity})`).join(', ');

  const { data, error } = await supabaseServer
    .from('diary_entries')
    .insert({
      user_id: auth.userId,
      entry_date,
      situation,
      thoughts,
      reactions,
      mood: mood || null,
      emotions_details: emotionsData,
      emotions: emotionsText || null,
    })
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data[0], { status: 201 });
}

// ===== PATCH =====
export async function PATCH(request: NextRequest) {
  const auth = await validateRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const body = await request.json();
  const { id, entry_date, situation, thoughts, emotions_details, reactions, mood, analysis } = body;

  if (!id) {
    return NextResponse.json({ error: 'ID обязателен' }, { status: 400 });
  }

  const { data: existing, error: checkError } = await supabaseServer
    .from('diary_entries')
    .select('id')
    .eq('id', id)
    .eq('user_id', auth.userId)
    .single();

  if (checkError || !existing) {
    return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 });
  }

  const updates: any = {};
  if (entry_date !== undefined) updates.entry_date = entry_date;
  if (situation !== undefined) updates.situation = situation;
  if (thoughts !== undefined) updates.thoughts = thoughts;
  if (reactions !== undefined) updates.reactions = reactions;
  if (mood !== undefined) updates.mood = mood;
  if (analysis !== undefined) updates.analysis = analysis;

  if (emotions_details !== undefined) {
    const emotionsData = Array.isArray(emotions_details) ? emotions_details : [];
    updates.emotions_details = emotionsData;
    updates.emotions = emotionsData.map(e => `${e.name}(${e.intensity})`).join(', ') || null;
  }

  const { data, error } = await supabaseServer
    .from('diary_entries')
    .update(updates)
    .eq('id', id)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data[0]);
}

// ===== DELETE =====
export async function DELETE(request: NextRequest) {
  const auth = await validateRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'ID обязателен' }, { status: 400 });
  }

  const { data: existing, error: checkError } = await supabaseServer
    .from('diary_entries')
    .select('id')
    .eq('id', id)
    .eq('user_id', auth.userId)
    .single();

  if (checkError || !existing) {
    return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 });
  }

  const { error } = await supabaseServer
    .from('diary_entries')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}