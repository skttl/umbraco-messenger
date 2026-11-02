// @vitest-environment jsdom
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { LitElement } from 'lit';
const mocked=vi.hoisted(()=>({context:{} as any,listener:undefined as undefined|((data:any)=>void),data:{} as any}));
vi.mock('@umbraco-cms/backoffice/lit-element',()=>({UmbLitElement:class extends LitElement {
 localize={term:(key:string)=>key,lang:()=> 'en'};
 consumeContext(_token:unknown,callback:(context:unknown)=>void){callback(mocked.context);}
 observe(_source:unknown,callback:(data:unknown)=>void){mocked.listener=callback;callback(mocked.data);}
}}));
vi.mock('./messenger.context',()=>({MESSENGER_CONTEXT:{}}));
import { MessengerHeaderElement } from './messenger-header.element';
const deferred=()=>{let resolve!:(value:boolean)=>void;const promise=new Promise<boolean>(r=>resolve=r);return {promise,resolve};};
let element:MessengerHeaderElement;
const update=async()=>{await element.updateComplete;await Promise.resolve();await element.updateComplete;};
const publish=(change:Record<string,unknown>)=>{mocked.data={...mocked.data,...change};mocked.listener?.(mocked.data);};
const button=(label:string)=>element.shadowRoot!.querySelector<HTMLElement>(`uui-button[label="messenger_${label}"]`)!;
const input=(label:string)=>element.shadowRoot!.querySelector<HTMLElement&{value:string}>(`#flow [label="messenger_${label}"]`)!;
const edit=(label:string,value:string)=>{const field=input(label);field.value=value;field.dispatchEvent(new Event('input',{bubbles:true}));};
beforeEach(async()=>{
 Object.defineProperties(HTMLDialogElement.prototype,{
  showModal:{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}},
  show:{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}},
  close:{configurable:true,value:function(this:HTMLDialogElement){this.open=false;this.dispatchEvent(new Event('close'));}},
 });
 mocked.data={authorized:true,open:false,conversations:[],unreadCount:0,messages:[],nextBefore:null,drafts:{},directory:{users:[{id:'anna',name:'Anna'}],groups:[]},loading:false,detailLoading:false,directoryLoading:false,busy:false,live:'connected',online:{},typing:{}};
 mocked.context={state:{},setOpen:vi.fn((open:boolean)=>publish({open})),stopTyping:vi.fn(),clearError:vi.fn(),directory:vi.fn(),create:vi.fn(),markDisplayed:vi.fn()};
 element=new MessengerHeaderElement();document.body.append(element);await update();
 const launcher=element.shadowRoot!.querySelector<HTMLElement>('#launcher')!;launcher.tabIndex=0;
 button('open').click();await update();
});
afterEach(()=>{element.remove();vi.restoreAllMocks();});
describe('Messenger keyboard and pending flows',()=>{
 it('returns focus to its connected launcher after Escape and the close button',async()=>{
   const launcher=element.shadowRoot!.querySelector<HTMLElement>('#launcher')!;
   window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',cancelable:true}));await update();
   expect(element.shadowRoot!.activeElement).toBe(launcher);
   button('open').click();await update();button('close').click();await update();
   expect(element.shadowRoot!.activeElement).toBe(launcher);
 });
 it('does not steal focus during logout cleanup',async()=>{
   const editor=document.createElement('input');document.body.append(editor);editor.focus();
   publish({authorized:false,open:false});await update();expect(document.activeElement).toBe(editor);editor.remove();
 });
 it('locks native cancellation and reopening while submission is pending, preserving the submitted draft',async()=>{
   await button('new').click();await update();edit('subject','First subject');edit('message','First message');
   const checkbox=element.shadowRoot!.querySelector<HTMLInputElement>('#flow input[type="checkbox"]')!;checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));await update();
   const delayed=deferred();mocked.context.create.mockImplementation(()=>{publish({busy:true});return delayed.promise;});
   const dialog=element.shadowRoot!.querySelector<HTMLDialogElement>('#flow')!;
   dialog.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await update();
   const cancel=new Event('cancel',{cancelable:true});dialog.dispatchEvent(cancel);if(!cancel.defaultPrevented)dialog.close();
   expect(cancel.defaultPrevented).toBe(true);expect(dialog.open).toBe(true);
   button('new').click();await update();expect(input('subject').value).toBe('First subject');expect(input('message').value).toBe('First message');
   expect(dialog.textContent).toContain('messenger_saving');
   publish({busy:false});delayed.resolve(true);await update();await update();expect(dialog.open).toBe(false);
   button('new').click();await update();edit('subject','Second subject');expect(input('subject').value).toBe('Second subject');
 });
});
