import { NextRequest, NextResponse } from 'next/server';
import { validate, parse } from '@tma.js/init-data-node';
import { supabaseServer } from '@/lib/supabaseServer';
import PDFDocument from 'pdfkit';


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


 return new Promise(
 (resolve,reject)=>{


 const chunks:Buffer[]=[];



 const doc =
 new PDFDocument({
  size:'A4',
  margin:40
 });



 doc.on(
  'data',
  (chunk)=>{
    chunks.push(chunk);
  }
 );


 doc.on(
  'end',
  ()=>{

   resolve(
    Buffer.concat(chunks)
   );

  }
 );


 doc.on(
  'error',
  reject
 );





 doc
 .fontSize(18)
 .text(
  'Отчёт КПТ-дневника',
  {
   align:'center'
  }
 );



 doc.moveDown();



 doc
 .fontSize(12)
 .text(
  `Период: ${from} — ${to}`
 );



 doc.text(
  `Количество записей: ${entries.length}`
 );



 doc.moveDown();



 doc
 .fontSize(15)
 .text(
  'Последние записи'
 );



 doc.moveDown();





 entries
 .slice(-15)
 .forEach(
 (e:any)=>{


 doc
 .fontSize(11)
 .text(
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

-------------------------
 `
 );


 }
 );




 doc.end();


 });


}