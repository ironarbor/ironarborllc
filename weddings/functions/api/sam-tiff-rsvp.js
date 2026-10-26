const HEADERS = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply = (body,status=200) => new Response(JSON.stringify(body),{status,headers:HEADERS});
export async function onRequest(context) {
  const {request,env}=context;
  if(request.method!=='POST') return new Response(JSON.stringify({error:'Method not allowed.'}),{status:405,headers:{...HEADERS,Allow:'POST'}});
  if(request.headers.get('Origin')!==new URL(request.url).origin) return reply({error:'Please submit your RSVP from the wedding website.'},403);
  if(!(request.headers.get('Content-Type')||'').startsWith('application/json')) return reply({error:'Invalid request format.'},415);
  let data;
  try {
    const reader=request.body?.getReader();
    if(!reader) return reply({error:'Please complete the form.'},400);
    let size=0; const chunks=[];
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();return reply({error:'Your response is too long.'},413);}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    data=JSON.parse(new TextDecoder().decode(bytes));
  } catch {return reply({error:'Please complete the form and try again.'},400);}
  if(!data||typeof data!=='object'||Array.isArray(data)) return reply({error:'Invalid response.'},400);
  if(data.website) return reply({ok:true});
  const name=typeof data.contactName==='string'?data.contactName.trim():'';
  const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';
  const attendance=data.attendance;
  const guestCount=data.guestCount;
  const guestNames=attendance==='yes'&&typeof data.guestNames==='string'?data.guestNames.trim():'';
  if(!name||name.length>160||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['yes','no'].includes(attendance)) return reply({error:'Please provide your full name, a valid email address, and your attendance.'},400);
  if(attendance==='yes'&&(!Number.isInteger(guestCount)||guestCount<1||guestCount>20||!guestNames||guestNames.length>1200)) return reply({error:'Please enter the number and full names of the invited guests attending.'},400);
  if(attendance==='no'&&guestCount!==0) return reply({error:'Please check your attendance selection.'},400);
  if(!env.RSVP_DB) return reply({error:'RSVPs are temporarily unavailable. Please contact the coordinator.'},503);
  try {
    const recent=await env.RSVP_DB.prepare("SELECT COUNT(*) AS total FROM rsvps WHERE wedding = ? AND email = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ','now','-5 minutes')").bind('sam-tiff',email).first();
    if(recent.total>=3) return reply({error:'Please wait a few minutes before submitting another response.'},429);
    await env.RSVP_DB.prepare('INSERT INTO rsvps (id,wedding,contact_name,email,attendance,guest_count,guest_names) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),'sam-tiff',name,email,attendance,guestCount,guestNames).run();
    return reply({ok:true});
  } catch {console.error(JSON.stringify({event:'rsvp_storage_error',wedding:'sam-tiff'}));return reply({error:'Your response could not be saved. Please try again or contact the coordinator.'},503);}
}
