import { NextRequest, NextResponse } from 'next/server';
import { validate, parse } from '@tma.js/init-data-node';
import { supabaseServer } from '@/lib/supabaseServer';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;


async function getTelegramUser(request: NextRequest) {

  const initData = request.headers.get(
    'x-telegram-init-data'
  );

  if (!initData) {
    throw new Error('Missing init data');
  }


  await validate(
    initData,
    TELEGRAM_BOT_TOKEN
  );


  const parsed = parse(initData);


  const telegramId = parsed.user?.id;


  if (!telegramId) {
    throw new Error('User not found');
  }


  return String(telegramId);

}



async function getProfileId(
  telegramId:string
){

  const {data,error} =
    await supabaseServer
      .from('profiles')
      .select('id')
      .eq(
        'telegram_id',
        telegramId
      )
      .single();


  if(error || !data){
    throw new Error(
      'Profile not found'
    );
  }


  return data.id;

}




function calculateStreak(
 entries:any[]
){

  if(entries.length===0)
    return 0;


  const dates =
    entries
      .map(e=>e.entry_date)
      .sort()
      .reverse();



  let streak = 1;


  let current =
    new Date(dates[0]);



  for(let i=1;i<dates.length;i++){

    const previous =
      new Date(dates[i]);


    const diff =
      Math.floor(
        (
          current.getTime()
          -
          previous.getTime()
        )
        /
        86400000
      );


    if(diff===1){
      streak++;
      current = previous;
    }
    else {
      break;
    }

  }


  return streak;

}





function getWeekdayName(
 date:string
){

 const days=[
  'Воскресенье',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота'
 ];


 return days[
   new Date(date).getDay()
 ];

}




export async function GET(
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




 const {data:entries,error} =
   await supabaseServer
    .from('diary_entries')
    .select('*')
    .eq(
      'user_id',
      profileId
    )
    .order(
      'entry_date',
      {
        ascending:true
      }
    );



 if(error)
   throw error;



 if(!entries)
   throw new Error(
    'No entries'
   );





 /*
    Общее количество
 */


 const totalEntries =
   entries.length;




 /*
    Среднее настроение
 */


 const moods =
   entries
    .filter(
      e=>e.mood!==null
    )
    .map(
      e=>Number(e.mood)
    );


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
    *
    10
   )
   /
   10
   :
   null;





 /*
    История настроения
 */


 const moodHistory =
   entries
    .filter(
      e=>e.mood!==null
    )
    .map(
      e=>({
        date:e.entry_date,
        mood:e.mood
      })
    );





 /*
    Эмоции
 */


 const emotionMap:any={};



 entries.forEach(e=>{


  if(
    !Array.isArray(
      e.emotions_details
    )
  )
    return;



  e.emotions_details.forEach(
    (emotion:any)=>{


      if(
        !emotionMap[emotion.name]
      ){

        emotionMap[emotion.name]={
          count:0,
          intensity:0
        };

      }


      emotionMap[emotion.name].count++;

      emotionMap[emotion.name].intensity
        += Number(
          emotion.intensity || 0
        );

    }
  );


 });



 const topEmotions =
   Object.entries(
     emotionMap
   )
   .map(
    ([name,value]:any)=>({

      name,

      count:value.count,

      avgIntensity:
        Math.round(
          (
           value.intensity
           /
           value.count
          )
          *
          10
        )
        /
        10

    })
   )
   .sort(
    (a,b)=>
      b.count-a.count
   )
   .slice(0,5);







 /*
    Частые мысли
 */


 const thoughts:any={};



 entries.forEach(e=>{

   if(!e.thoughts)
     return;


   const text =
     e.thoughts
       .trim()
       .toLowerCase();



   if(text.length<5)
     return;



   thoughts[text] =
     (thoughts[text] || 0)+1;


 });



 const topThoughts =
   Object.entries(thoughts)
    .map(
      ([text,count]:any)=>({
        text,
        count
      })
    )
    .sort(
      (a,b)=>
        b.count-a.count
    )
    .slice(0,5);






 /*
    Активность 30 дней
 */


 const now =
   new Date();


 const monthAgo =
   new Date(
     now.getTime()
     -
     30*86400000
   );



 const activeDays30 =
   new Set(
    entries
     .filter(
       e=>
       new Date(e.entry_date)
       >=monthAgo
     )
     .map(
       e=>e.entry_date
     )
   )
   .size;







 /*
    Лучший день недели
 */


 const weekday:any={};



 entries.forEach(e=>{


   const day =
    getWeekdayName(
      e.entry_date
    );


   if(!weekday[day])
     weekday[day]={
       sum:0,
       count:0
     };


   if(e.mood){

    weekday[day].sum+=e.mood;
    weekday[day].count++;

   }


 });



 let bestWeekday=null;
 let bestScore=0;


 Object.entries(weekday)
 .forEach(
 ([day,value]:any)=>{


  if(
    value.count
    &&
    value.sum/value.count
    >
    bestScore
  ){

    bestScore =
      value.sum/value.count;

    bestWeekday =
      day;

  }


 });







 return NextResponse.json({

   totalEntries,

   averageMood,

   moodHistory,

   topEmotions,

   topThoughts,

   activeDays30,

   streak:
     calculateStreak(
       entries
     ),

   bestWeekday,


   lastEntry:
     entries.length
     ?
     {
       date:
        entries[
          entries.length-1
        ].entry_date,

       mood:
        entries[
          entries.length-1
        ].mood

     }
     :
     null

 });


}
catch(error:any){


 console.error(
  'STATS ERROR',
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