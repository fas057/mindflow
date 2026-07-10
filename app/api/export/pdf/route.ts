import { NextRequest, NextResponse } from 'next/server';
import { validate, parse } from '@tma.js/init-data-node';
import { supabaseServer } from '@/lib/supabaseServer';
import PDFDocument from 'pdfkit';


const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN!;



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


 const id =
 parsed.user?.id;


 if(!id)
  throw new Error(
   'User missing'
  );


 return String(id);

}





async function getProfileId(
 telegramId:string
){

 const {data,error}
 =
 await supabaseServer
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



 const {searchParams}
 =
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





/*
 Получаем готовый отчет
*/


const {data:report,error}
=
await supabaseServer
.from('period_reports')
.select('*')
.eq(
 'user_id',
 profileId
)
.eq(
 'date_from',
 from
)
.eq(
 'date_to',
 to
)
.single();



if(error || !report)
{

 return NextResponse.json(
  {
   error:
   'Report not found. Run analysis first.'
  },
  {
   status:404
  }
 );

}





/*
 Последние записи
*/


const {data:entries}
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
  ascending:false
 }
)
.limit(10);





const doc =
new PDFDocument({
 size:'A4',
 margin:50
});



const chunks:Buffer[]=[];



doc.on(
 'data',
 chunk=>chunks.push(chunk)
);



const finished =
new Promise<Buffer>((resolve) => {

  doc.on(
   'end',
   ()=>{
    resolve(
     Buffer.concat(chunks)
    );
   }
  );

 }
);






/*
 PDF CONTENT
*/



doc
.fontSize(20)
.text(
 'КПТ-дневник — отчет',
 {
  align:'center'
 }
);


doc.moveDown();



doc.fontSize(12)
.text(
 `Период: ${from} — ${to}`
);


doc.text(
 `Количество записей: ${report.entries_count}`
);



if(report.average_mood)
{

 doc.text(
  `Среднее настроение: ${report.average_mood}/10`
 );

}



doc.moveDown();



doc.fontSize(15)
.text(
 'Топ эмоции'
);



doc.fontSize(12);



if(
 report.top_emotions &&
 report.top_emotions.length
)
{

 report.top_emotions.forEach(
  (e:any,index:number)=>{

   doc.text(
    `${index+1}. ${e.name} — ${e.count} раз (ср. ${e.avgIntensity})`
   );

  }
 );

}
else
{

 doc.text(
  'Нет данных'
 );

}




doc.moveDown();



doc.fontSize(15)
.text(
 'Анализ GigaChat'
);



doc.fontSize(12);



const analysis =
report.giga_analysis || {};



doc.text(
 `Динамика: ${analysis.dynamics || '-'}`
);


doc.text(
 `Резюме: ${analysis.summary || '-'}`
);


doc.text(
 `Рекомендация: ${analysis.recommendation || '-'}`
);



if(analysis.alert)
{

 doc.moveDown();

 doc.text(
  '⚠ Требуется дополнительное внимание',
  {
   underline:true
  }
 );

}




doc.moveDown();



doc.fontSize(15)
.text(
 'Последние записи'
);



doc.fontSize(11);



entries?.forEach(
 (e:any)=>{


  doc.moveDown(0.5);


  doc.text(
   `${e.entry_date}`
  );


  doc.text(
   `Ситуация: ${e.situation}`
  );


  doc.text(
   `Мысли: ${e.thoughts}`
  );


  doc.text(
   `Эмоции: ${e.emotions || '-'}`
  );


 }

);





doc.end();




const pdf = await finished;

return new NextResponse(
  new Uint8Array(pdf),
  {
    status: 200,

    headers: {
      'Content-Type': 'application/pdf',

      'Content-Disposition':
        `attachment; filename="CBT_${from}_${to}.pdf"`
    }
  }
);



}
catch(error:any)
{

 console.error(
  'PDF EXPORT ERROR',
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