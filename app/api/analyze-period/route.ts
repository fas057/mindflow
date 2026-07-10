import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import https from 'https';
import { validate, parse } from '@tma.js/init-data-node';
import { supabaseServer } from '@/lib/supabaseServer';
import crypto from 'crypto';


const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;

const GIGACHAT_OAUTH_URL =
  'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';

const GIGACHAT_API_URL =
  'https://gigachat.devices.sberbank.ru/api/v1/chat/completions';


let cachedToken: string | null = null;
let tokenExpiry = 0;


const httpsAgent = new https.Agent({
  rejectUnauthorized:false
});



async function getTelegramUser(
  request:NextRequest
){

  const initData =
    request.headers.get(
      'x-telegram-init-data'
    );


  if(!initData)
    throw new Error(
      'Missing init data'
    );


  await validate(
    initData,
    TELEGRAM_BOT_TOKEN
  );


  const parsed =
    parse(initData);


  const telegramId =
    parsed.user?.id;


  if(!telegramId)
    throw new Error(
      'Telegram user missing'
    );


  return String(telegramId);

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


 if(error || !data)
   throw new Error(
    'Profile not found'
   );


 return data.id;

}





async function getToken(){

 const now=Date.now();


 if(
   cachedToken &&
   now < tokenExpiry
 )
 return cachedToken;



 const clientId =
 process.env.GIGACHAT_CLIENT_ID?.trim();


 const clientSecret =
 process.env.GIGACHAT_CLIENT_SECRET?.trim();



 if(!clientId || !clientSecret)
   throw new Error(
    'GigaChat credentials missing'
   );



 const scope =
 process.env.GIGACHAT_SCOPE ||
 'GIGACHAT_API_PERS';



 const response =
 await axios.post(
  GIGACHAT_OAUTH_URL,

  new URLSearchParams({
    scope
  }).toString(),

  {

   headers:{
    'Content-Type':
    'application/x-www-form-urlencoded',

    'RqUID':
    crypto.randomUUID()
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
 (
  response.data.expires_in - 60
 )
 *1000;



 return cachedToken;

}





function extractJSON(
 text:string
){

 const start =
 text.indexOf('{');


 if(start===-1)
   throw new Error(
    'JSON not found'
   );


 let depth=0;
 let end=-1;


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
      end=i;
      break;
    }
  }

 }



 if(end===-1)
   throw new Error(
    'JSON broken'
   );


 return JSON.parse(
  text.substring(
    start,
    end+1
  )
 );

}






export async function POST(
 request:NextRequest
){

try{


 const telegramId =
 await getTelegramUser(
  request
 );


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
    error:'Period missing'
   },
   {
    status:400
   }
  );

 }




 const {data:entries,error}
 =
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
   throw error;



 if(!entries || entries.length===0)
 {

  return NextResponse.json(
   {
    error:
    'Нет записей за период'
   },
   {
    status:400
   }
  );

 }




/*
  Считаем статистику
*/


const moods =
 entries
 .filter(e=>e.mood!==null)
 .map(e=>e.mood);



const averageMood =
 moods.length
 ?
 Math.round(
  (
   moods.reduce(
    (a,b)=>a+b,
    0
   )
   /
   moods.length
  )
  *10
 )
 /10
 :
 null;




const emotionsMap:any={};



entries.forEach(e=>{


 if(!e.emotions_details)
   return;



 e.emotions_details.forEach(
  (em:any)=>{


   if(!emotionsMap[em.name])
   {

    emotionsMap[em.name]={
     count:0,
     totalIntensity:0
    };

   }



   emotionsMap[em.name].count++;


   emotionsMap[em.name].totalIntensity +=
    em.intensity;


  }
 );


});



const topEmotions =
Object.entries(emotionsMap)
.map(
 ([name,data]:any)=>({

  name,

  count:data.count,

  avgIntensity:
  Math.round(
   data.totalIntensity /
   data.count *
   10
  )/10

 })
)
.sort(
 (a,b)=>b.count-a.count
)
.slice(0,5);





const moodChart =
entries
.filter(e=>e.mood!==null)
.map(e=>({

 date:e.entry_date,

 mood:e.mood

}));





const entriesText =
entries.map(e=>

`
Дата: ${e.entry_date}

Ситуация:
${e.situation}

Мысли:
${e.thoughts}

Эмоции:
${e.emotions}

Реакции:
${e.reactions}

`

)
.join('\n------\n');





const prompt = `

Ты КПТ-терапевт.

Проанализируй дневник клиента.

Период:
${from} - ${to}


Записи:

${entriesText}


Ответ только JSON:

{
"dynamics":"",
"summary":"",
"recommendation":"",
"alert":false
}

`;





const token =
await getToken();




const giga =
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
giga.data
.choices?.[0]
?.message
?.content;



if(!content)
 throw new Error(
  'Empty GigaChat response'
 );



const gigaAnalysis =
extractJSON(
 content
 );





const reportData={

 user_id:profileId,

 date_from:from,

 date_to:to,

 entries_count:
 entries.length,

 average_mood:averageMood,

 top_emotions:
 topEmotions,

 mood_chart:
 moodChart,

 giga_analysis:
 gigaAnalysis

};





const {data:report,error:saveError}
=
await supabaseServer
.from('period_reports')
.upsert(
 reportData,
 {
  onConflict:
  'user_id,date_from,date_to'
 }
)
.select()
.single();




if(saveError)
 throw saveError;



return NextResponse.json(
 {
  success:true,

  report

 }
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