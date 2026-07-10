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


async function validateRequest(request: NextRequest) {

  const initData = request.headers.get(
    'x-telegram-init-data'
  );

  if (!initData)
    return null;


  try {

    await validate(
      initData,
      TELEGRAM_BOT_TOKEN
    );


    const parsed = parse(initData);

    const telegramId =
      parsed.user?.id;


    if (!telegramId)
      return null;


    return String(telegramId);


  } catch(e){

    console.error(e);
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
    throw new Error(
      'Профиль пользователя не найден'
    );
  }


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
 process.env.GIGACHAT_CLIENT_ID!;

 const clientSecret =
 process.env.GIGACHAT_CLIENT_SECRET!;


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
 });


 cachedToken =
 response.data.access_token;


 tokenExpiry =
 now +
 (response.data.expires_in-60)*1000;


 return cachedToken;

}




function extractJSON(text:string){

 const start=text.indexOf('{');

 if(start<0)
  throw new Error('JSON не найден');


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
    return JSON.parse(
      text.substring(start,i+1)
    );
  }
 }


 throw new Error('JSON ошибка');

}




export async function POST(
 request:NextRequest
){

try{


const telegramId =
 await validateRequest(request);


if(!telegramId)
 return NextResponse.json(
 {error:'Unauthorized'},
 {status:401}
 );


const profileId =
 await getProfileId(
 telegramId
 );



const {text}=await request.json();


if(!text)
 return NextResponse.json(
 {error:'Нет текста'},
 {status:400}
 );



const token =
 await getToken();



const prompt=`

Ты КПТ терапевт.

Найди когнитивные искажения.

Ответ только JSON:

{
"distortions":[
{
"type":"",
"quote":"",
"rational_response":""
}
],
"gentle_summary":""
}


Текст:

${text}

`;



const response =
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
temperature:0,
max_tokens:1000
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
response.data
.choices?.[0]
?.message
?.content;


const analysis =
extractJSON(content);



return NextResponse.json(
analysis
);



}
catch(error:any){

console.error(
'ANALYZE ERROR',
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