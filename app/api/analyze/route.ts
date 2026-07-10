import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import https from 'https';
import crypto from 'crypto';
import { validate, parse } from '@tma.js/init-data-node';


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
): Promise<boolean> {

  const initData =
    request.headers.get('x-telegram-init-data');


  if (!initData) {
    console.error('Нет Telegram initData');
    return false;
  }


  try {

    await validate(
      initData,
      TELEGRAM_BOT_TOKEN
    );


    const parsed = parse(initData);


    if (!parsed.user?.id) {
      console.error(
        'Telegram user отсутствует'
      );

      return false;
    }


    return true;


  } catch(error){

    console.error(
      'Ошибка Telegram validation:',
      error
    );

    return false;
  }
}





async function getToken(): Promise<string> {


  const now = Date.now();


  if (
    cachedToken &&
    now < tokenExpiry
  ) {
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



  if(!clientId || !clientSecret){

    throw new Error(
      'Нет GigaChat CLIENT_ID или CLIENT_SECRET'
    );

  }



  try {


    const response = await axios.post(

      GIGACHAT_OAUTH_URL,

      new URLSearchParams({
        scope
      }).toString(),


      {
        headers:{
          'RqUID':
            crypto.randomUUID(),

          'Content-Type':
            'application/x-www-form-urlencoded',
        },


        auth:{
          username:clientId,
          password:clientSecret,
        },


        httpsAgent,

      }

    );



    const {
      access_token,
      expires_in
    } = response.data;



    if(!access_token){

      throw new Error(
        'GigaChat не вернул токен'
      );

    }



    cachedToken =
      access_token;


    tokenExpiry =
      now +
      ((expires_in || 1800) - 60)
      *
      1000;



    return access_token;



  } catch(error:any){

    console.error(
      'Ошибка получения GigaChat token:',
      error.response?.data ||
      error.message
    );


    throw error;

  }

}






function extractJSON(
  text:string
){


  let clean =
    text
    .replace(/```json/g,'')
    .replace(/```/g,'')
    .trim();



  const start =
    clean.indexOf('{');


  if(start === -1){

    throw new Error(
      'GigaChat не вернул JSON'
    );

  }



  let depth = 0;
  let end = -1;



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


    const valid =
      await validateRequest(request);



    if(!valid){

      return NextResponse.json(
        {
          error:
          'Unauthorized'
        },
        {
          status:401
        }
      );

    }




    const body =
      await request.json();


    const text =
      body.text;



    if(
      !text ||
      text.trim().length < 5
    ){

      return NextResponse.json(
        {
          error:
          'Текст слишком короткий'
        },
        {
          status:400
        }
      );

    }





    const token =
      await getToken();





    const prompt = `

Ты КПТ-терапевт.

Проанализируй текст клиента.

Найди когнитивные искажения.

Ответь ТОЛЬКО JSON.

Формат:

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


Если искажений нет:
верни пустой массив.

Текст клиента:

${text}

`;






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


          temperature:0,


          max_tokens:1000,

        },


        {

          headers:{

            Authorization:
            `Bearer ${token}`,


            'Content-Type':
            'application/json',

          },


          httpsAgent,

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

      distortions:
      analysis.distortions || [],


      gentle_summary:
      analysis.gentle_summary || ''

    });




 }catch(error:any){


    console.error(
      'Ошибка анализа:',
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