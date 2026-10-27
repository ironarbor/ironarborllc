const HEADERS = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply = (body,status=200) => new Response(JSON.stringify(body),{status,headers:HEADERS});

// Google Form is linked to the Website RSVPs tab in the master tracker.
// Keep these question IDs aligned with that form; no Google credentials enter the browser.
const RESPONSE_URL = 'https://docs.google.com/forms/d/e/1FAIpQLScEhFgEdSGnqANyNJZe5dDq8UifIk-bALBCSLJmfc5NTouHQw/formResponse';
const sheetText = value => /^[=+@-]/.test(value.trimStart()) ? "'" + value : value;
async function syncToTracker(db, row) {
  const body = new URLSearchParams({
    'entry.229431896': sheetText(row.email),
    'entry.369864039': row.attendance === 'yes' ? 'Accepts with pleasure' : 'Declines with regret',
    'entry.524959291': String(row.guest_count),
    'entry.596165169': sheetText(row.guest_names),
    'entry.793509066': row.id,
    'entry.1207398236': sheetText(row.contact_name),
    'entry.2050523656': sheetText(row.first_name || ''),
    'entry.2090906309': sheetText(row.last_name || ''),
    'entry.1031146322': sheetText(row.cell_number || ''),
    'entry.1092850186': sheetText(row.note || ''),
    'fvv': '1', 'pageHistory': '0'
  });
  const response = await fetch(RESPONSE_URL, {
    method: 'POST', body,
    signal: AbortSignal.timeout(12000)
  });
  const confirmation = await response.text();
  if (!response.ok || !confirmation.includes('Your response has been recorded.')) throw new Error('Tracker delivery was not confirmed');
  await db.prepare("UPDATE rsvps SET sheet_synced_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?").bind(row.id).run();
}
async function retryPending(db, currentId) {
  const pending = await db.prepare('SELECT id,contact_name,email,attendance,guest_count,guest_names,first_name,last_name,cell_number,note FROM rsvps WHERE wedding = ? AND sheet_synced_at IS NULL AND id != ? ORDER BY created_at LIMIT 5').bind('sam-tiff',currentId).all();
  for (const row of pending.results || []) {
    try { await syncToTracker(db,row); }
    catch { console.error(JSON.stringify({event:'rsvp_tracker_retry_pending',wedding:'sam-tiff'})); break; }
  }
}

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
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();return reply({error:'Your response is too long.'},413);}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    data=JSON.parse(new TextDecoder().decode(bytes));
  } catch {return reply({error:'Please complete the form and try again.'},400);}
  if(!data||typeof data!=='object'||Array.isArray(data)) return reply({error:'Invalid response.'},400);
  if(data.website) return reply({ok:true});
  const clean = value => typeof value==='string'?value.trim():'';
  const validName = value => value.length>0 && value.length<=80 && !/[\r\n\x00-\x1f]/.test(value);
  const firstName=clean(data.firstName),lastName=clean(data.lastName);
  const name=firstName+' '+lastName;
  const email=clean(data.email).toLowerCase(),cellNumber=clean(data.cellNumber),note=clean(data.note);
  const attendance=data.attendance;
  if(!validName(firstName)||!validName(lastName)||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['yes','no'].includes(attendance))return reply({error:'Please provide your first and last name, a valid email address, and your attendance.'},400);
  if(cellNumber.length>35||!/^[+\d\s().-]+$/.test(cellNumber)||cellNumber.replace(/\D/g,'').length<7||cellNumber.replace(/\D/g,'').length>15)return reply({error:'Please enter a valid cell number, including your country code if outside the U.S.'},400);
  if(note.length>2000)return reply({error:'Please keep your note to 2,000 characters or fewer.'},400);
  if(!Array.isArray(data.guests)||data.guests.length>6)return reply({error:'You may add up to six invited guests.'},400);
  if(attendance==='no'&&data.guests.length)return reply({error:'Please remove attending guests when declining.'},400);
  const guests=data.guests.map(guest=>({firstName:clean(guest?.firstName),lastName:clean(guest?.lastName)}));
  if(guests.some(guest=>!validName(guest.firstName)||!validName(guest.lastName)))return reply({error:'Please enter both first and last names for every added guest.'},400);
  const guestCount=attendance==='yes'?1+guests.length:0;
  const guestNames=attendance==='yes'?[name,...guests.map(guest=>guest.firstName+' '+guest.lastName)].join('\n'):'';
  if(!env.RSVP_DB) return reply({error:'RSVPs are temporarily unavailable. Please contact the coordinator.'},503);
  try {
    const recent=await env.RSVP_DB.prepare("SELECT COUNT(*) AS total FROM rsvps WHERE wedding = ? AND email = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ','now','-5 minutes')").bind('sam-tiff',email).first();
    if(recent.total>=3) return reply({error:'Please wait a few minutes before submitting another response.'},429);
    const id=crypto.randomUUID();
    await env.RSVP_DB.prepare('INSERT INTO rsvps (id,wedding,contact_name,email,attendance,guest_count,guest_names,first_name,last_name,cell_number,note,guests_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,'sam-tiff',name,email,attendance,guestCount,guestNames,firstName,lastName,cellNumber,note,JSON.stringify(guests)).run();
    try {
      await syncToTracker(env.RSVP_DB,{id,contact_name:name,email,attendance,guest_count:guestCount,guest_names:guestNames,first_name:firstName,last_name:lastName,cell_number:cellNumber,note});
    } catch {
      console.error(JSON.stringify({event:'rsvp_tracker_delivery_pending',wedding:'sam-tiff'}));
    }
    // Retain unsynced backups and retry them on subsequent submissions.
    if (context.waitUntil) context.waitUntil(retryPending(env.RSVP_DB,id).catch(() => console.error(JSON.stringify({event:'rsvp_tracker_retry_error',wedding:'sam-tiff'}))));
    return reply({ok:true});
  } catch {console.error(JSON.stringify({event:'rsvp_storage_error',wedding:'sam-tiff'}));return reply({error:'Your response could not be saved. Please try again or contact the coordinator.'},503);}
}
