import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../app/state';
import { useJobsOn } from '../app/words';
const notes:Record<string,[string,string][]>= {
 overview:[['overview-summary','This is the shift overview: pallets on hand and anything that needs attention.']],
 find:[['find-search','Try “Example pallet 1” or “JOB-1”. Open a result to see its location and history.'],['find-filters','Narrow the list by status, job or rack.']],
 receive:[['receive-form','Pick a job and describe the pallet. Saving gives it a unique label.']],
 move:[['move-steps','Scan or type the pallet code, then the rack. You review the move before it is saved.']],
 pallet:[['pallet-where','This is the last confirmed location. Every saved move updates it for the team.'],['pallet-history','The history keeps the previous location, time and person for each change.']],
 jobs:[['jobs-table','A job groups the pallets for one project. Open a job to see what is still here.']],
 locations:[['locations-table','Each location has a printable label. Open a rack to see its pallets.']],
 labels:[['labels-source','Print pallet or rack labels on an ordinary printer or a 4 × 6 label printer.']],
 activity:[['activity-filters','This is the movement log. Filter it by person or type of change.']],
 people:[['people-list','Managers authorize email addresses. Each employee signs in with their own account.']],
};
/** The same hints for a warehouse that has turned jobs off, so none of them asks for a job that is not there. */
const NO_JOBS:Record<string,[string,string][]>={
 find:[['find-search','Try “Example pallet 1”. Open a result to see its location and history.'],['find-filters','Narrow the list by status or rack.']],
 receive:[['receive-form','Describe the pallet. Saving gives it a unique label.']],
};
export function SampleHints(){
 const {backend,route,guideStep}=useApp();const jobsOn=useJobsOn();const [targets,setTargets]=useState<{element:Element;text:string}[]>([]);
 useLayoutEffect(()=>{
  if(!backend.sampleMode||guideStep!==null)return;
  const fallback:Record<string,string>={receive:jobsOn?'Choose an example job and describe what arrived. Saving creates a pallet label.':'Describe what arrived. Saving creates a pallet label.',move:'Scan or type a pallet code, then a rack code. Review the destination before confirming.',map:'Each rack shows its recorded pallet count. Select a rack to see what is on it.',people:'Use People to authorize employee emails and choose their access.',job:'Pallets for this job stay together in this list, even when they are on different racks.',location:'This page shows the pallets recorded at this rack and its printable label.',export:'Managers can download the records and movement history for the office.',import:'Bring an existing list in using the CSV template.',reconcile:'These lists collect pallets that need a check, a location or a replacement label.',settings:'These settings apply to this sample in your browser.',scanners:'Connect a scanner or use a phone camera to read pallet and rack labels.'};
  const selected=((jobsOn?notes:{...notes,...NO_JOBS})[route.name]||[]).flatMap(([key,text])=>{const target=document.querySelector(`[data-tour="${key}"]`);if(!target)return [];const element=document.createElement('div');target.insertAdjacentElement('afterend',element);return [{element,text}];});
  if(!selected.length&&fallback[route.name]){const target=document.querySelector('.page-head');if(target){const element=document.createElement('div');target.insertAdjacentElement('afterend',element);selected.push({element,text:fallback[route.name]});}}
  setTargets(selected);return()=>selected.forEach(t=>t.element.remove());
 },[backend,route.name,route.id,guideStep,jobsOn]);
 if(!backend.sampleMode||guideStep!==null)return null;
 return <>{targets.map((t,i)=>createPortal(<aside className="sample-note" role="note"><span aria-hidden="true">i</span>{t.text}</aside>,t.element,String(i)))}</>;
}
