import { BRAND } from '../brand';
import { useApp } from '../app/state';
import { BrandMark, Icon } from '../ui/icons';
import './signin.css';

export function SignIn(){
 const {backend,signIn,go,route}=useApp();
 const open=(role:'OWNER'|'OPERATOR')=>{
  const member=backend.db.memberships.find(m=>m.active&&m.role===role);if(!member)return;
  signIn(member.user_id,member.workspace_id);
  go(route.name!=='signin'?route:role==='OWNER'?'overview':'find');
 };
 return <div className="door customer-app">
 <aside className="door-side"><div className="door-side-top"><button className="door-brand" onClick={()=>go('home')}><BrandMark className="door-brand-mark"/><span className="door-brand-name">{BRAND.name}</span></button></div>
 <div className="door-side-body"><h1 className="door-title">Sample warehouse</h1><p className="door-lede">A few example pallets, two jobs and four locations. Look around to see how your crew would use it.</p><p className="muted">These are practice records saved in this browser.</p><a href={`${location.pathname}#signin`}>Customer sign-in →</a></div></aside>
 <main className="door-main" id="main"><div className="door-main-inner sample-choices"><h2>Choose a view</h2>
 <button className="sample-choice" onClick={()=>open('OWNER')}><Icon name="overview"/><span><strong>View a management dashboard</strong><small>See the warehouse, manage racks and labels, and give your team access.</small></span><Icon name="arrowRight"/></button>
 <button className="sample-choice" onClick={()=>open('OPERATOR')}><Icon name="scanner"/><span><strong>View an employee dashboard</strong><small>Receive a delivery, move a pallet and find what a job needs.</small></span><Icon name="arrowRight"/></button>
 <p className="muted">Short notes explain the screens. Browse in any order.</p><button className="btn ghost" onClick={()=>go('home')}>Back to the website</button>
 </div></main></div>;
}
