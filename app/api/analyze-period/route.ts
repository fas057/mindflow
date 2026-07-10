import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import https from 'https';
import crypto from 'crypto';
import { validate, parse } from '@tma.js/init-data-node';
import { supabaseServer } from '@/lib/supabaseServer';


const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN!;


const GIGACHAT_OAUTH_URL =
  'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';


const GIGACHAT_API_URL =
  'https://gigachat.devices.sberbank.ru/api/v1/chat/completions';



let cachedToken: string | null = null;
let tokenExpiry = 0;



const httpsAgent = new https.Agent({
  rejectUnauthorized:false,
});





async function validateRequest(
  request:NextRequest
):Promise<{
  valid:boolean;
  userId:string|null;
}> {


  const initData =
    request.headers.get(
      'x-telegram-init-data'
    );


  if(!initData){

    console.error(
      'Нет Telegram initData'
    );

    return {
      valid:false,
      userId:null
    };

  }



  try{


    await validate(
      initData,
      TELEGRAM_BOT_TOKEN
    );



    const parsed =
      parse(initData);



    const telegramId =
      parsed.user?.id;



    if(!telegramId){

      console.error(
        'Нет Telegram пользователя'
      );

      return {
        valid:false,
        userId:null
      };

    }



    return {

      valid:true,

      userId:
        String(telegramId)

    };



  }catch(error){


    console.error(
      'Ошибка Telegram validation:',
      error
    );


    return {
      valid:false,
      userId:null
    };

  }

}






async function getToken():Promise<string>{


  const now =
    Date.now();



  if(
    cachedToken &&
    now < tokenExpiry
  ){

    return cachedToken;

  }




  const clientId =
    process.env.GIGACHAT_CLIENT_ID?.trim();



  const clientSecret =
    process.env.GIGACHAT_CLIENT_SECRET?.trim();



  const scope =
    process.env.GIGACHAT_SCOPE?.trim()
    ||
    'GIGACHAT_API_PERS';





  if(
    !clientId ||
    !clientSecret
  ){

    throw new Error(
      'Нет GigaChat credentials'
    );

  }





  const response =
    await axios.post(


      GIGACHAT_OAUTH_URL,


      new URLSearchParams({
        scope
      }).toString(),


      {


        headers:{

          RqUID:
            crypto.randomUUID(),


          'Content-Type':
          'application/x-www-form-urlencoded'

        },



        auth:{

          username:
          clientId,


          password:
          clientSecret

        },


        httpsAgent


      }


    );





  const {
    access_token,
    expires_in
  } =
    response.data;





  if(!access_token){

    throw new Error(
      'GigaChat token отсутствует'
    );

  }





  cachedToken =
    access_token;



  tokenExpiry =
    now +
    ((expires_in || 1800)-60)
    *
    1000;




  return access_token;


}







function extractJSON(
 text:string
){


  const clean =
    text
    .replace(/```json/g,'')
    .replace(/```/g,'')
    .trim();



  const start =
    clean.indexOf('{');



  if(start===-1){

    throw new Error(
      'Нет JSON в ответе GigaChat'
    );

  }



  let depth=0;
  let end=-1;



  for(
    let i=start;
    i<clean.length;
    i++
  ){

    if(clean[i]==='{'){
      depth++;
    }


    if(clean[i]==='}'){

      depth--;

      if(depth===0){

        end=i;
        break;

      }

    }

  }





  if(end===-1){

    throw new Error(
      'JSON поврежден'
    );

  }





  return JSON.parse(
    clean.substring(
      start,
      end+1
    )
  );

}









export async function POST(
 request:NextRequest
){



try{


  const auth =
    await validateRequest(request);



  if(!auth.valid || !auth.userId){

    return NextResponse.json(
      {
        error:'Unauthorized'
      },
      {
        status:401
      }
    );

  }






  const body =
    await request.json();



  const {
    from,
    to
  } = body;





  if(!from || !to){

    return NextResponse.json(
      {
        error:
        'Не указан период'
      },
      {
        status:400
      }
    );

  }






  const {
    data:entries,
    error
  } = await supabaseServer

    .from('diary_entries')

    .select('*')

    .eq(
      'user_id',
      auth.userId
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







  if(error){

    throw error;

  }





  if(
    !entries ||
    entries.length===0
  ){

    return NextResponse.json(
      {
        error:
        'Нет записей за выбранный период'
      },
      {
        status:400
      }
    );

  }








  const entriesText =
    entries.map(e =>


`Дата: ${e.entry_date}
Ситуация: ${e.situation}
Мысли: ${e.thoughts}
Эмоции: ${e.emotions || ''}
Реакции: ${e.reactions}`


    )
    .join('\n---\n');









  const prompt = `

Ты КПТ-терапевт.

Проанализируй дневниковые записи клиента
за период ${from} - ${to}.


Записи:

${entriesText}



Ответь строго JSON:


{
"summary":"",
"recommendation":"",
"dynamics":"",
"alert":false
}



`;






  const token =
    await getToken();






  const gigaResponse =
    await axios.post(


      GIGACHAT_API_URL,


      {


        model:
        'GigaChat',


        messages:[
          {
            role:'user',
            content:prompt
          }
        ],


        temperature:
        0.3,


        max_tokens:
        800

      },


      {

        headers:{

          Authorization:
          `Bearer ${token}`,


          'Content-Type':
          'application/json'

        },


        httpsAgent

      }


    );








  const content =
    gigaResponse.data
    ?.choices?.[0]
    ?.message?.content;






  if(!content){

    throw new Error(
      'Пустой ответ GigaChat'
    );

  }







  const analysis =
    extractJSON(content);






  return NextResponse.json({

    summary:
      analysis.summary || '',


    recommendation:
      analysis.recommendation || '',


    dynamics:
      analysis.dynamics || 'стабильная',


    alert:
      Boolean(analysis.alert)

  });





}catch(error:any){


  console.error(
    'Ошибка агрегированного анализа:',
    error.response?.data ||
    error.message ||
    error
  );



  return NextResponse.json(

    {
      error:
      error.message ||
      'Ошибка анализа'
    },

    {
      status:500
    }

  );


}


}