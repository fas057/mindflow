import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import https from 'https';
import crypto from 'crypto';
import { validate, parse } from '@tma.js/init-data-node';
import { supabaseServer } from '@/lib/supabaseServer';


const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;

const GIGACHAT_OAUTH_URL =
  'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';

const GIGACHAT_API_URL =
  'https://gigachat.devices.sberbank.ru/api/v1/chat/completions';


let cachedToken: string | null = null;
let tokenExpiry = 0;


const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});



async function validateRequest(
  request: NextRequest
) {

  const initData =
    request.headers.get(
      'x-telegram-init-data'
    );


  if (!initData)
    return null;


  try {

    await validate(
      initData,
      TELEGRAM_BOT_TOKEN
    );


    const parsed =
      parse(initData);


    const telegramId =
      parsed.user?.id;


    if(!telegramId)
      return null;


    return String(telegramId);


  } catch(error){

    console.error(
      'Telegram validation error',
      error
    );

    return null;
  }

}




async function getProfileId(
 telegramId:string
){

 const {data,error}=await supabaseServer
 .from('profiles')
 .select('id')
 .eq(
   'telegram_id',
   telegramId
 )
 .single();


 if(error || !data){

   console.error(
    'Profile error',
    error
   );

   throw new Error(
    'Профиль пользователя не найден'
   );

 }


 return data.id;

}




async function getToken(){

 const now =
 Date.now();


 if(
  cachedToken &&
  now < tokenExpiry
 )
 {
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



 if(!clientId || !clientSecret)
 {
  throw new Error(
   'GigaChat credentials missing'
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
   username:clientId,
   password:clientSecret
 },


 httpsAgent

 }

 );



 cachedToken =
 response.data.access_token;


 tokenExpiry =
 now +
 (response.data.expires_in-60)
 *1000;



 return cachedToken;

}




function extractJSON(
 text:string
){

 const start =
 text.indexOf('{');


 if(start===-1)
 {
  throw new Error(
   'JSON не найден'
  );
 }


 let depth=0;


 for(
  let i=start;
  i<text.length;
  i++
 ){

  if(text[i]==='{')
    depth++;


  if(text[i]==='}')
  {

   depth--;


   if(depth===0)
   {

    return JSON.parse(
      text.substring(
       start,
       i+1
      )
    );

   }

  }

 }


 throw new Error(
  'Ошибка JSON'
 );

}





export async function POST(
 request:NextRequest
){


try{


 const telegramId =
 await validateRequest(
  request
 );


 if(!telegramId)
 {
  return NextResponse.json(
   {
    error:'Unauthorized'
   },
   {
    status:401
   }
  );
 }



 const profileId =
 await getProfileId(
  telegramId
 );



 const body =
 await request.json();



 const {
  from,
  to
 } = body;



 if(!from || !to)
 {

  return NextResponse.json(
   {
    error:'Не указан период'
   },
   {
    status:400
   }
  );

 }



 const {
  data:entries,
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




 if(error)
 {

  console.error(
   error
  );


  return NextResponse.json(
   {
    error:error.message
   },
   {
    status:500
   }
  );

 }



 if(!entries || entries.length===0)
 {

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
 entries.map(e=>`

Дата:
${e.entry_date}

Ситуация:
${e.situation}

Мысли:
${e.thoughts}

Эмоции:
${e.emotions}

Реакции:
${e.reactions}

`).join(
'\n---\n'
);





 const prompt = `


Ты КПТ терапевт.

Проанализируй дневниковые записи клиента.


Период:
${from} - ${to}


Записи:

${entriesText}


Ответ только JSON:


{
"summary":"",
"recommendation":"",
"dynamics":"positive|negative|stable",
"alert":false
}

`;




 const token =
 await getToken();




 const gigaResponse =
 await axios.post(

 GIGACHAT_API_URL,

 {

 model:'GigaChat',

 messages:[
 {
  role:'user',
  content:prompt
 }
 ],

 temperature:0.3,

 max_tokens:800

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
 .choices?.[0]
 ?.message
 ?.content;



 if(!content)
 {
  throw new Error(
   'Пустой ответ GigaChat'
  );
 }



 const analysis =
 extractJSON(
  content
 );



 return NextResponse.json(
  analysis
 );




}
catch(error:any)
{

 console.error(
  'ANALYZE PERIOD ERROR',
  error
 );


 return NextResponse.json(
 {
  error:error.message
 },
 {
  status:500
 }
 );


}

}