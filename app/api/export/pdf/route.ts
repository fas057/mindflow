import { NextRequest, NextResponse } from 'next/server';
import { validate, parse } from '@tma.js/init-data-node';
import { supabaseServer } from '@/lib/supabaseServer';
import { jsPDF } from 'jspdf';
import fs from 'fs';
import path from 'path';


const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN!;



async function getTelegramUser(
  request: NextRequest
) {

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
 telegramId:string
){

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



 if(error || !data){

   throw new Error(
    'Profile not found'
   );

 }


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



 if(!from || !to){

  return NextResponse.json(
   {
    error:'Period missing'
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



 if(error){
  throw error;
 }




 const pdfBuffer =
 await generatePDF(
   entries || [],
   from,
   to
 );




 const fileName =
 `CBT_${from}_${to}.pdf`;



 const storagePath =
 `exports/${crypto.randomUUID()}-${fileName}`;





 const {
   error:uploadError
 } =
 await supabaseServer
 .storage
 .from('exports')
 .upload(
   storagePath,
   pdfBuffer,
   {
    contentType:
     'application/pdf',
    upsert:false
   }
 );



 if(uploadError){
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
  url:urlData.publicUrl
 }
 );



}
catch(error:any){


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









function generatePDF(
  entries:any[],
  from:string,
  to:string
):Promise<Buffer>{


return new Promise((resolve)=>{


const doc =
new jsPDF();



const fontPath =
path.join(
 process.cwd(),
 'public/fonts/DejaVuSans.ttf'
);



const font =
fs.readFileSync(
 fontPath
).toString(
 'base64'
);



doc.addFileToVFS(
 'DejaVuSans.ttf',
 font
);


doc.addFont(
 'DejaVuSans.ttf',
 'DejaVuSans',
 'normal'
);


doc.setFont(
 'DejaVuSans'
);



let y = 20;



doc.setFontSize(18);

doc.text(
 'Отчёт КПТ-дневника',
 20,
 y
);


y += 15;



doc.setFontSize(12);


doc.text(
 `Период: ${from} — ${to}`,
 20,
 y
);


y += 10;



doc.text(
 `Количество записей: ${entries.length}`,
 20,
 y
);


y += 15;



doc.setFontSize(14);


doc.text(
 'Последние записи',
 20,
 y
);


y += 10;



doc.setFontSize(10);



entries
.slice(-15)
.forEach(
(e:any)=>{


if(y > 270){

 doc.addPage();

 doc.setFont(
  'DejaVuSans'
 );

 y = 20;

}



const text =
`
Дата: ${e.entry_date}

Ситуация:
${e.situation || '-'}

Мысли:
${e.thoughts || '-'}

Эмоции:
${e.emotions || '-'}

Реакции:
${e.reactions || '-'}

Настроение:
${e.mood ?? '-'}


---------------------
`;



const lines =
doc.splitTextToSize(
 text,
 170
);



doc.text(
 lines,
 20,
 y
);



y +=
lines.length * 5;



});



const buffer =
Buffer.from(
 doc.output(
  'arraybuffer'
 )
);



resolve(buffer);



});


}