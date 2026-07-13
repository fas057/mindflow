import { NextRequest, NextResponse } from 'next/server';
import { validate, parse } from '@tma.js/init-data-node';
import { supabaseServer } from '@/lib/supabaseServer';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;


async function getTelegramUser(request: NextRequest) {

  const { searchParams } =
    new URL(request.url);


  const initData =
    request.headers.get(
      'x-telegram-init-data'
    ) ||
    searchParams.get(
      'initData'
    );


  if (!initData) {
    throw new Error(
      'Missing init data'
    );
  }


  await validate(
    initData,
    TELEGRAM_BOT_TOKEN
  );


  const parsed =
    parse(initData);


  const telegramId =
    parsed.user?.id;


  if (!telegramId) {
    throw new Error(
      'User not found'
    );
  }


  return String(telegramId);

}



async function getProfileId(
  telegramId: string
) {

  const {
    data,
    error
  } =
    await supabaseServer
      .from('profiles')
      .select('id')
      .eq(
        'telegram_id',
        telegramId
      )
      .single();


  if (error || !data) {

    console.error(
      'PROFILE ERROR',
      error
    );


    throw new Error(
      'Profile not found'
    );

  }


  return data.id;

}



function escapeCSV(
  value: any
) {

  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }


  return `"${String(value)
    .replace(
      /"/g,
      '""'
    )
    .replace(
      /\r?\n/g,
      ' '
    )
  }"`;

}




export async function GET(
  request: NextRequest
) {

  try {


    const telegramId =
      await getTelegramUser(
        request
      );


    const profileId =
      await getProfileId(
        telegramId
      );



    const {
      searchParams
    } =
      new URL(
        request.url
      );


    const from =
      searchParams.get(
        'from'
      );


    const to =
      searchParams.get(
        'to'
      );



    if (!from || !to) {

      return NextResponse.json(
        {
          error:
            'Period missing'
        },
        {
          status:400
        }
      );

    }




    const {
      data: entries,
      error
    } =
      await supabaseServer
        .from('diary_entries')
        .select('*')
        .eq(
          'user_id',
          profileId
        )
        .gte(
          'entry_date',
          from
        )
        .lte(
          'entry_date',
          to
        )
        .order(
          'entry_date',
          {
            ascending:true
          }
        );



    if(error) {
      throw error;
    }




    const headers = [
      'Дата',
      'Ситуация',
      'Мысли',
      'Эмоции',
      'Реакции',
      'Настроение'
    ];



    const rows =
      (entries || []).map(e =>
        [
          e.entry_date,
          e.situation,
          e.thoughts,
          e.emotions_details
            ?.map(
              (em:any)=>
                `${em.name}(${em.intensity})`
            )
            .join(', ') ||
            '',
          e.reactions,
          e.mood

        ]
        .map(
          escapeCSV
        )
        .join(';')
      );




    const csv =
      [
        headers.join(';'),
        ...rows
      ]
      .join('\n');




    const fileName =
      `CBT_${from}_${to}.csv`;



    const storagePath =
      `exports/${crypto.randomUUID()}-${fileName}`;




    const {
      error: uploadError
    } =
      await supabaseServer
        .storage
        .from('exports')
        .upload(
          storagePath,
          Buffer.from(
            '\uFEFF' + csv,
            'utf8'
          ),
          {
            contentType:
              'text/csv; charset=utf-8',
            upsert:false
          }
        );



    if(uploadError) {

      console.error(
        'STORAGE UPLOAD ERROR',
        uploadError
      );


      throw uploadError;

    }




    const {
      data:urlData
    } =
      supabaseServer
        .storage
        .from('exports')
        .getPublicUrl(
          storagePath
        );





    return NextResponse.json(
      {
        url:
          urlData.publicUrl
      },
      {
        status:200
      }
    );



  }
  catch(error:any) {


    console.error(
      'CSV EXPORT ERROR',
      error
    );



    return NextResponse.json(
      {
        error:
          error.message
      },
      {
        status:500
      }
    );

  }

}