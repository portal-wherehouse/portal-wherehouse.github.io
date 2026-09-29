import type { SiteRouteName } from '../app/state';
export const SITE_NAV: {route:SiteRouteName;label:string;blurb:string}[] = [
{route:'product',label:'How it works',blurb:'Receive. Move. Find.'},
{route:'hardware',label:'Printing & scanning',blurb:'Start with the equipment you have.'},
{route:'pricing',label:'Pricing',blurb:'One price. Remote support included.'},
{route:'contact',label:'Get help',blurb:'Talk to a person.'}];
export const SITE_FOOTER_EXTRA: {route:SiteRouteName;label:string;blurb:string}[] = [
{route:'mission',label:'Our mission',blurb:''},{route:'showcase',label:'Process walkthrough',blurb:''},{route:'simple',label:'What we leave out',blurb:''},{route:'customers',label:'Getting started',blurb:''},{route:'founder',label:'About',blurb:''},{route:'security',label:'Your records',blurb:''}];
