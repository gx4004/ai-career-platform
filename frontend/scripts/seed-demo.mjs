// Seeds a demo user with profile facts, a resume run, a job match and a CV via the API.
// Usage: node scripts/seed-demo.mjs <email@example.com> <password>   (backend on :8000)
// Then also run, from backend/ with DATABASE_URL set:
//   python -m tests.seed_discovery_listings <email>; python -m tests.seed_campaigns <email>; python -m tests.promote_admin <email>
const resumeText = `
Alex Morgan
Backend Engineer

Summary
Backend engineer with six years of experience building reliable Python
services, data pipelines, and internal platforms for distributed teams.

Experience
- Led delivery of a FastAPI service used by 40 internal teams and reduced
  request latency by 35 percent through query tuning and cache design.
- Owned PostgreSQL schema changes, migration rehearsals, monitoring, and
  incident response for a workflow processing 2 million events a month.
- Built CI pipelines that cut deployment time from 25 minutes to 8 minutes
  while preserving rollback and audit controls.
- Mentored four engineers and coordinated delivery with product, design,
  security, and support partners across three quarterly releases.

Skills
Python, FastAPI, PostgreSQL, SQLAlchemy, React, TypeScript, Docker, AWS

Education
BSc Computer Science
`.trim()

const jobDescription = `
Senior Backend Engineer (Platform)

We're hiring a backend engineer to own our FastAPI services and PostgreSQL
data layer. You'll lead schema migrations, build CI/CD pipelines, and
mentor engineers across product teams. Required: Python, FastAPI,
PostgreSQL, SQLAlchemy, Docker, and CI/CD experience. AWS a plus.
`.trim()

const cvStudioSeed = {
  name: 'Alex Morgan',
  sections: [
    {
      id: 'summary', kind: 'summary', title: 'Summary', visible: true, position: 0,
      entries: [{
        id: 'summary-1', evidence_item_id: null, position: 0,
        body: 'Backend engineer with six years of experience building reliable Python services, data pipelines, and internal platforms for distributed teams.',
      }],
    },
    {
      id: 'experience', kind: 'experience', title: 'Experience', visible: true, position: 1,
      entries: [
        {
          id: 'exp-1', evidence_item_id: null, position: 0,
          heading: 'Senior Backend Engineer', subheading: 'Northwind Labs', location: 'Berlin',
          start_date: 'Mar 2022', end_date: 'Present',
          bullets: [
            'Led the move of 14 services to FastAPI and PostgreSQL, cutting p95 latency by 38%.',
            'Built the CI/CD pipeline that took releases from weekly to several times a day.',
            'Mentored four engineers through their first on-call rotations.',
          ],
          body: 'Led the move of 14 services to FastAPI and PostgreSQL, cutting p95 latency by 38%.\nBuilt the CI/CD pipeline that took releases from weekly to several times a day.\nMentored four engineers through their first on-call rotations.',
        },
        {
          id: 'exp-2', evidence_item_id: null, position: 1,
          heading: 'Backend Engineer', subheading: 'Brightline Data', location: 'Remote',
          start_date: 'Jun 2019', end_date: 'Feb 2022',
          bullets: [
            'Designed SQLAlchemy data models for a billing platform serving 2M invoices a month.',
            'Automated schema migrations with Alembic and zero-downtime deploys on AWS.',
          ],
          body: 'Designed SQLAlchemy data models for a billing platform serving 2M invoices a month.\nAutomated schema migrations with Alembic and zero-downtime deploys on AWS.',
        },
      ],
    },
    {
      id: 'education', kind: 'education', title: 'Education', visible: true, position: 2,
      entries: [{
        id: 'edu-1', evidence_item_id: null, position: 0,
        heading: 'BSc Computer Science', subheading: 'University of Leeds', start_date: '2015', end_date: '2019',
        body: 'BSc Computer Science', bullets: [],
      }],
    },
    {
      id: 'skills', kind: 'skills', title: 'Skills', visible: true, position: 3,
      entries: [{
        id: 'skills-1', evidence_item_id: null, position: 0,
        body: 'Python, FastAPI, PostgreSQL, SQLAlchemy, React, TypeScript, Docker, AWS, CI/CD',
      }],
    },
  ],
}
const B='http://127.0.0.1:8000/api/v1'; const [email,password]=process.argv.slice(2); let cookie='';
async function req(m,p,d){const r=await fetch(B+p,{method:m,headers:{'content-type':'application/json',cookie},body:d?JSON.stringify(d):undefined});const sc=r.headers.getSetCookie?.()||[];if(sc.length)cookie=sc.map(c=>c.split(';')[0]).join('; ');const t=await r.text();if(!r.ok)console.error(m,p,r.status,t.slice(0,200));try{return JSON.parse(t)}catch{return t}}
await req('POST','/auth/register',{email,password,full_name:'Demo User',tos_accepted:true});
await req('POST','/auth/login',{email,password});
for (const item of [
 {kind:'experience',provenance:'user-entered',content:{title:'Senior Backend Engineer',company:'Northwind Labs',summary:'Leads the platform team building the services the rest of the company runs on.'}},
 {kind:'skill',provenance:'user-entered',content:{text:'Python, FastAPI, PostgreSQL, SQLAlchemy'}},
 {kind:'education',provenance:'user-entered',content:{degree:'BSc Computer Science',school:'TU Berlin'}},
 {kind:'achievement',provenance:'imported',content:{text:'Cut p95 latency by 38% moving 14 services to FastAPI and PostgreSQL.'}},
 {kind:'skill',provenance:'imported',content:{text:'Docker, AWS, CI/CD'}}]) await req('POST','/evidence-profile/items',item);
await req('POST','/resume/analyze',{resume_text:resumeText});
await req('POST','/job-match/match',{resume_text:resumeText,job_description:jobDescription});
const cv=await req('POST','/cv-documents',cvStudioSeed);
if(cv?.id){await req('PATCH',`/cv-documents/${cv.id}`,{style:{template_id:'professional-editorial',font_id:'pt-serif',accent_color:'#075985',density:'normal',ats_mode:false}});await req('POST',`/cv-documents/${cv.id}/variants`,{name:'Platform roles',target_role:'Senior Backend Engineer'});}
console.log('api seed done');
