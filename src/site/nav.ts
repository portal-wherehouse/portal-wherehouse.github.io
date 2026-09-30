import type { SiteRouteName } from '../app/state';
export const SITE_NAV: {route:SiteRouteName;label:string;blurb:string}[] = [
{route:'product',label:'How it works',blurb:'Receive. Move. Find.'},
{route:'fit',label:'Is it for me?',blurb:'Does it work for your business?'},
{route:'why',label:'Why Wherehouse',blurb:'A shared answer for the next shift.'},
{route:'hardware',label:'Printing & scanning',blurb:'Start with the equipment you have.'},
{route:'pricing',label:'Pricing',blurb:'Software, equipment and setup options.'},
{route:'contact',label:'Get help',blurb:'Talk to a person.'}];
export const SITE_FOOTER_EXTRA: {route:SiteRouteName;label:string;blurb:string}[] = [
{route:'mission',label:'Our mission',blurb:''},{route:'showcase',label:'Process walkthrough',blurb:''},{route:'simple',label:'Why Wherehouse',blurb:''},{route:'customers',label:'Getting started',blurb:''},{route:'founder',label:'About',blurb:''},{route:'security',label:'Your records',blurb:''}];
