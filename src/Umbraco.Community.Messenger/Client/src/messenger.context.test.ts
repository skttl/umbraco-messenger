import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({api:{getMessengerConversations:vi.fn(),getMessengerConversation:vi.fn(),getMessengerMessages:vi.fn(),postMessengerMessage:vi.fn(),postMessengerConversation:vi.fn(),putMessengerRead:vi.fn()},authConsumer:undefined as undefined|((auth:unknown)=>void), hub:{start:vi.fn(),stop:vi.fn(),invoke:vi.fn(),on:vi.fn(),onclose:vi.fn(),onreconnecting:vi.fn(),onreconnected:vi.fn()},hubOptions:undefined as any}));
vi.mock('@umbraco-cms/backoffice/class-api',()=>({UmbContextBase:class { consumeContext(_t:unknown,cb:(v:unknown)=>void){mocks.authConsumer=cb;} observe(source:{value:unknown},cb:(v:unknown)=>void){cb(source.value);} hostConnected(){} hostDisconnected(){} destroy(){} }}));
vi.mock('@umbraco-cms/backoffice/context-api',()=>({UmbContextToken:class {}}));
vi.mock('@umbraco-cms/backoffice/observable-api',()=>({UmbObjectState:class {constructor(public value:unknown){} getValue(){return this.value;} setValue(v:unknown){this.value=v;} asObservable(){return this;}}}));
vi.mock('@umbraco-cms/backoffice/auth',()=>({UMB_AUTH_CONTEXT:{}}));
vi.mock('@umbraco-cms/backoffice/external/signalr',()=>({HubConnectionBuilder:class {withUrl(_url:unknown,options:unknown){mocks.hubOptions=options;return this;} withAutomaticReconnect(){return this;} build(){return mocks.hub;}}}));
vi.mock('./api/sdk.gen',()=>mocks.api);
import { MessengerContext } from './messenger.context';
const thread=(id:string,muted=false,unreadCount=1)=>({id,subject:id,isActive:true,muted,unreadCount,lastReadSequence:0,lastMessage:null,participants:[]});
const message=(sequence:number)=>({id:String(sequence),sequence,senderId:'other',senderName:'Anna',body:'<script>alert(1)</script>',createdUtc:'2026-11-02T10:00:00Z'});
const deferred=<T>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};};
let context:MessengerContext;
const settle=async()=>{for(let n=0;n<10;n++)await Promise.resolve();};
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();mocks.hub.start.mockResolvedValue(undefined);mocks.hub.stop.mockResolvedValue(undefined);mocks.hub.invoke.mockResolvedValue([]); const doc=new EventTarget();Object.assign(doc,{visibilityState:'visible',hasFocus:()=>true});vi.stubGlobal('document',doc);vi.stubGlobal('window',new EventTarget());mocks.api.getMessengerConversations.mockResolvedValue({data:{items:[],unreadConversationCount:0}});mocks.api.getMessengerConversation.mockImplementation(async({path})=>({data:thread(path.id)}));mocks.api.getMessengerMessages.mockResolvedValue({data:{items:[message(2)],nextBeforeSequence:null}});context=new MessengerContext({} as never);mocks.authConsumer!({isAuthorized:{value:true},getOpenApiConfiguration:()=>({base:'http://localhost'}),configureClient(){}});});
afterEach(()=>{context.destroy();vi.useRealTimers();vi.unstubAllGlobals();});
describe('Messenger state',()=>{
 it.each([100000,100001])('validates a reply of %s characters before calling the API',async(length)=>{
   await context.select('a');const body='æ'.repeat(length);context.setDraft('a',body);mocks.api.postMessengerMessage.mockResolvedValue({data:message(3)});
   expect(await context.send()).toBe(length===100000);
   if(length===100000){expect(mocks.api.postMessengerMessage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({path:{id:'a'},body:{body}}));expect(context.snapshot.drafts.a).toBe('');}
   else{expect(mocks.api.postMessengerMessage).not.toHaveBeenCalled();expect(context.snapshot.drafts.a).toBe(body);}
 });
 it('counts unmuted unread conversations, not messages',async()=>{mocks.api.getMessengerConversations.mockResolvedValue({data:{items:[thread('a',false,9),thread('b',true,2),thread('c',false,0)],unreadConversationCount:1}});await context.refresh();expect(context.snapshot.unreadCount).toBe(1);});
 it('does not replace a selected thread with an earlier response',async()=>{const a=deferred<any>();mocks.api.getMessengerConversation.mockImplementation(({path})=>path.id==='a'?a.promise:Promise.resolve({data:thread('b')}));const first=context.select('a');await context.select('b');a.resolve({data:thread('a')});await first;expect(context.snapshot.detail?.id).toBe('b');});
 it('marks only displayed messages in an open focused active thread',async()=>{await context.select('a');await context.markDisplayed(2);expect(mocks.api.putMessengerRead).not.toHaveBeenCalled();context.setOpen(true);Object.assign(document,{visibilityState:'hidden'});await context.markDisplayed(2);expect(mocks.api.putMessengerRead).not.toHaveBeenCalled();Object.assign(document,{visibilityState:'visible'});mocks.api.putMessengerRead.mockResolvedValue({});await context.markDisplayed(2);expect(mocks.api.putMessengerRead).toHaveBeenCalledWith(expect.objectContaining({path:{id:'a'},body:{sequence:2}}));await context.markDisplayed(2);expect(mocks.api.putMessengerRead).toHaveBeenCalledTimes(1);});
 it('does not retry a failing read marker until explicit retry',async()=>{await context.select('a');context.setOpen(true);await settle();mocks.api.putMessengerRead.mockRejectedValue(new Error('offline'));await context.markDisplayed(2);await context.markDisplayed(2);expect(mocks.api.putMessengerRead).toHaveBeenCalledTimes(1);context.clearError();await context.markDisplayed(2);expect(mocks.api.putMessengerRead).toHaveBeenCalledTimes(2);});
 it('retains failed replies and does not clear a newer draft',async()=>{await context.select('a');context.setDraft('a','first');mocks.api.postMessengerMessage.mockRejectedValue(new Error('offline'));expect(await context.send()).toBe(false);expect(context.snapshot.drafts.a).toBe('first');const send=deferred<any>();mocks.api.postMessengerMessage.mockReturnValue(send.promise);const sending=context.send();context.setDraft('a','second');send.resolve({data:message(3)});await sending;expect(context.snapshot.drafts.a).toBe('second');});
 it('ignores late requests and clears private drafts after logout',async()=>{const late=deferred<any>();mocks.api.getMessengerConversations.mockReturnValue(late.promise);const request=context.refresh();context.setDraft('a','private');mocks.authConsumer!({isAuthorized:{value:false}});late.resolve({data:{items:[thread('private')],unreadConversationCount:1}});await request;expect(context.snapshot.conversations).toEqual([]);expect(context.snapshot.drafts).toEqual({});});
});


describe('live lifecycle',()=>{
 it('heartbeats while the panel is closed without exposing a snapshot for a different thread',async()=>{
   mocks.api.getMessengerConversations.mockResolvedValue({data:{items:[thread('shared')],unreadConversationCount:1}});
   await context.refresh();await settle();mocks.hub.invoke.mockClear();
   mocks.hub.invoke.mockResolvedValue([{userId:'anna',isOnline:true}]);
   await vi.advanceTimersByTimeAsync(15000);
   expect(mocks.hub.invoke).toHaveBeenCalledWith('Heartbeat','shared');expect(context.snapshot.online).toEqual({});
 });
 it('bounds typing and sends a stop when the panel closes',async()=>{
   await settle();await context.select('a');context.setOpen(true);await settle();mocks.hub.invoke.mockClear();
   context.typing('Hello');context.typing('Hello again');
   expect(mocks.hub.invoke.mock.calls.filter(x=>x[0]==='Typing'&&x[2]===true)).toHaveLength(1);
   context.setOpen(false);expect(mocks.hub.invoke).toHaveBeenCalledWith('Typing','a',false);
 });
 it('clears typing labels after five seconds without a server stop',async()=>{
   await settle();await context.select('a');context.setOpen(true);await settle();
   const handler=mocks.hub.on.mock.calls.find(x=>x[0]==='TypingChanged')![1];
   handler('a','anna',true);expect(context.snapshot.typing.anna).toBeGreaterThan(0);
   await vi.advanceTimersByTimeAsync(6000);expect(context.snapshot.typing).toEqual({});
 });
 it('retries a failed initial connection and cancels retry on logout',async()=>{
   context.destroy();mocks.hub.start.mockReset().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
   context=new MessengerContext({} as never);mocks.authConsumer!({isAuthorized:{value:true},getOpenApiConfiguration:()=>({base:'http://localhost'}),getLatestToken:async()=>'',configureClient(){}});
   await settle();expect(context.snapshot.live).toBe('offline');await vi.advanceTimersByTimeAsync(5000);expect(context.snapshot.live).toBe('connected');
   mocks.authConsumer!({isAuthorized:{value:false}});const count=mocks.hub.start.mock.calls.length;await vi.advanceTimersByTimeAsync(30000);expect(mocks.hub.start).toHaveBeenCalledTimes(count);expect(mocks.hub.stop).toHaveBeenCalled();
 });
 it('connects with session cookies without token APIs',async()=>{
   mocks.authConsumer!({isAuthorized:{value:true},getOpenApiConfiguration:()=>({base:'http://localhost'}),configureClient(){}});
   expect(mocks.hubOptions).toEqual({withCredentials:true});
 });
});

describe('review regressions',()=>{
 it('keeps all history reachable when more than a page arrives during disconnect',async()=>{
   const messages=(from:number,to:number)=>Array.from({length:to-from+1},(_,index)=>message(from+index));
   mocks.api.getMessengerMessages.mockResolvedValueOnce({data:{items:messages(1,50),nextBeforeSequence:null}});
   await context.select('a');expect(context.snapshot.messages).toHaveLength(50);
   mocks.api.getMessengerMessages.mockResolvedValueOnce({data:{items:messages(61,110),nextBeforeSequence:61}});
   await context.loadDetail();expect(context.snapshot.nextBefore).toBe(61);
   mocks.api.getMessengerMessages.mockResolvedValueOnce({data:{items:messages(11,60),nextBeforeSequence:11}});
   await context.older();
   mocks.api.getMessengerMessages.mockResolvedValueOnce({data:{items:messages(1,10),nextBeforeSequence:null}});
   await context.older();expect(context.snapshot.messages.map(x=>x.sequence)).toEqual(messages(1,110).map(x=>x.sequence));
   expect(context.snapshot.nextBefore).toBeNull();
 });
 it('does not select a created conversation over newer navigation',async()=>{
   const created=deferred<any>();mocks.api.postMessengerConversation.mockReturnValue(created.promise);
   const pending=context.create({subject:'First draft',body:'First message',userIds:['anna'],groupIds:[]});
   await context.select('chosen');created.resolve({data:thread('created')});expect(await pending).toBe(true);
   expect(context.snapshot.selected).toBe('chosen');expect(context.snapshot.detail?.id).toBe('chosen');
 });
});
