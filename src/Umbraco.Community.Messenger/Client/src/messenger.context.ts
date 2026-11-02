import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import { UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';
import { HubConnectionBuilder } from '@umbraco-cms/backoffice/external/signalr';
import type { HubConnection } from '@umbraco-cms/backoffice/external/signalr';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import * as api from './api/sdk.gen';
import type { ConversationResponse, MessageResponse, DirectoryResponse, CreateConversationRequest, RecipientsRequest } from './api/types.gen';

export interface MessengerSnapshot {
  authorized:boolean; conversations:ConversationResponse[]; unreadCount:number; selected?:string; detail?:ConversationResponse;
  messages:MessageResponse[]; nextBefore:number|null; open:boolean; loading:boolean; detailLoading:boolean;
  busy:boolean; error?:string; live:'connecting'|'connected'|'reconnecting'|'offline';
  drafts:Record<string,string>; directory:DirectoryResponse; directoryLoading:boolean;
  online:Record<string,boolean>; typing:Record<string,number>;
}
const empty = ():MessengerSnapshot => ({authorized:false,conversations:[],unreadCount:0,messages:[],nextBefore:null,open:false,loading:false,detailLoading:false,busy:false,live:'offline',drafts:{},directory:{users:[],groups:[]},directoryLoading:false,online:{},typing:{}});
export const MESSENGER_CONTEXT = new UmbContextToken<MessengerContext>('Messenger.Context');

export class MessengerContext extends UmbContextBase {
  #state = new UmbObjectState<MessengerSnapshot>(empty());
  readonly state = this.#state.asObservable();
  get snapshot(){return this.#state.getValue();}
  #auth?:typeof UMB_AUTH_CONTEXT.TYPE;
  #connection?:HubConnection;
  #authorized=false;
  #epoch=0; #navigation=0; #listRequest=0; #detailRequest=0; #directoryRequest=0;
  #readAttempted=new Map<string,number>();
  #heartbeat?:ReturnType<typeof setInterval>;
  #expiry?:ReturnType<typeof setInterval>;
  #retry?:ReturnType<typeof setTimeout>;
  #typingStop?:ReturnType<typeof setTimeout>;
  #typingAt=0; #typingConversation?:string;
  #listeners?:AbortController;
  constructor(host:UmbControllerHost){
    super(host,MESSENGER_CONTEXT);
    this.consumeContext(UMB_AUTH_CONTEXT,auth=>{
      if(this.#auth!==auth){this.#reset();this.#auth=auth;}
      this.observe(auth?.isAuthorized, authorized=>{
        if(authorized && !this.#authorized){this.#authorized=true;this.#set({authorized:true});this.#connect();void this.refresh();}
        else if(!authorized){this.#reset();}
      },'messenger-auth');
    });
    this.#listen();
  }
  #set(change:Partial<MessengerSnapshot>){this.#state.setValue({...this.snapshot,...change});}
  #listen(){
    if(this.#listeners)return;
    this.#listeners=new AbortController();
    const signal=this.#listeners.signal;
    document.addEventListener('visibilitychange',this.#focus,{signal});
    window.addEventListener('focus',this.#focus,{signal});
    window.addEventListener('blur',this.#blur,{signal});
  }
  #focus=()=>{if(this.#authorized && document.visibilityState==='visible'){void this.refresh();if(this.snapshot.open && this.snapshot.selected)void this.loadDetail();}};
  #blur=()=>{this.stopTyping();};
  override hostConnected(){super.hostConnected();this.#listen();}
  override hostDisconnected(){this.#reset();this.#listeners?.abort();this.#listeners=undefined;super.hostDisconnected();}
  override destroy(){this.#reset();this.#listeners?.abort();this.#listeners=undefined;super.destroy();}
  #reset(){
    this.#epoch++;this.#authorized=false;this.#listRequest++;this.#detailRequest++;this.#directoryRequest++;
    clearInterval(this.#heartbeat);clearInterval(this.#expiry);clearTimeout(this.#retry);clearTimeout(this.#typingStop);
    this.#heartbeat=undefined;this.#expiry=undefined;this.#retry=undefined;this.#typingStop=undefined;
    this.#typingConversation=undefined;this.#typingAt=0;this.#readAttempted.clear();
    const old=this.#connection;this.#connection=undefined;if(old)void old.stop().catch(()=>{});
    this.#state.setValue(empty());
  }
  #valid(epoch:number){return this.#authorized && epoch===this.#epoch;}
  async #connect(){
    if(!this.#authorized || !this.#auth || this.#connection)return;
    const epoch=this.#epoch,auth=this.#auth;
    this.#set({live:'connecting'});
    const base=(auth.getOpenApiConfiguration().base??window.location.origin).replace(/\/$/,'');
    const connection=new HubConnectionBuilder().withUrl(`${base}/umbraco/messengerHub`,{accessTokenFactory:()=>auth.getLatestToken(),withCredentials:true}).withAutomaticReconnect().build();
    this.#connection=connection;
    const current=()=>this.#valid(epoch)&&this.#connection===connection;
    connection.on('ConversationChanged',(id:string)=>{if(!current())return;void this.refresh();if(this.snapshot.open && this.snapshot.selected===id)void this.loadDetail();});
    connection.on('TypingChanged',(id:string,user:string,typing:boolean)=>{
      if(!current() || !this.snapshot.open || this.snapshot.selected!==id || !this.snapshot.detail?.isActive)return;
      const items={...this.snapshot.typing};if(typing)items[user]=Date.now()+5000;else delete items[user];this.#set({typing:items});
    });
    connection.on('PresenceChanged',(id:string,user:string,online:boolean)=>{if(current()&&this.snapshot.open&&this.snapshot.selected===id&&this.snapshot.detail?.isActive)this.#set({online:{...this.snapshot.online,[user]:online}});});
    connection.onreconnecting(()=>{if(current())this.#set({live:'reconnecting',online:{},typing:{}});});
    connection.onreconnected(()=>{if(current()){this.#set({live:'connected'});void this.refresh();if(this.snapshot.open&&this.snapshot.selected)void this.loadDetail();void this.#beat();}});
    connection.onclose(()=>{if(current()){this.#connection=undefined;this.#set({live:'offline',online:{},typing:{}});this.#scheduleReconnect(epoch);}});
    try{
      await connection.start();
      if(!current()){await connection.stop();return;}
      this.#set({live:'connected'});void this.#beat();
      clearInterval(this.#heartbeat);this.#heartbeat=setInterval(()=>void this.#beat(),15000);
      clearInterval(this.#expiry);this.#expiry=setInterval(()=>{const typing=Object.fromEntries(Object.entries(this.snapshot.typing).filter(([,until])=>until>Date.now()));if(Object.keys(typing).length!==Object.keys(this.snapshot.typing).length)this.#set({typing});},1000);
    }catch{if(current()){this.#connection=undefined;this.#set({live:'offline'});void connection.stop().catch(()=>{});this.#scheduleReconnect(epoch);}}
  }
  #scheduleReconnect(epoch:number){clearTimeout(this.#retry);if(this.#valid(epoch))this.#retry=setTimeout(()=>{this.#retry=undefined;void this.#connect();},5000);}
  async #beat(){
    const connection=this.#connection,epoch=this.#epoch;
    const id=this.snapshot.open&&this.snapshot.detail?.isActive?this.snapshot.detail.id:this.snapshot.conversations.find(x=>x.isActive)?.id;
    if(!connection||!id||this.snapshot.live!=='connected')return;
    try{const presence=await connection.invoke<Array<{userId:string;isOnline:boolean}>>('Heartbeat',id);if(this.#valid(epoch)&&this.#connection===connection&&this.snapshot.open&&this.snapshot.selected===id&&this.snapshot.detail?.isActive)this.#set({online:Object.fromEntries(presence.map(x=>[x.userId,x.isOnline]))});}catch{/* Membership can change while a heartbeat is in flight. */}
  }
  async refresh(){
    if(!this.#authorized)return;
    const epoch=this.#epoch,request=++this.#listRequest;
    this.#set({loading:true});
    try{const {data}=await api.getMessengerConversations({throwOnError:true});if(!this.#valid(epoch)||request!==this.#listRequest)return;
      this.#set({conversations:data.items,unreadCount:data.items.filter(x=>x.isActive&&!x.muted&&x.unreadCount>0).length,loading:false});
      const selected=data.items.find(x=>x.id===this.snapshot.selected);if(selected&&!selected.isActive)this.#set({online:{},typing:{}});
    }catch{if(this.#valid(epoch)&&request===this.#listRequest)this.#set({loading:false,error:'loadError'});}
  }
  setOpen(open:boolean){this.#set({open});if(!open)this.stopTyping();else{void this.refresh();if(this.snapshot.selected)void this.loadDetail();void this.#beat();}}
  async select(id?:string){++this.#navigation;this.stopTyping();++this.#detailRequest;this.#set({selected:id,detail:undefined,messages:[],nextBefore:null,online:{},typing:{},error:undefined,detailLoading:!!id});if(id)await this.loadDetail();}
  async loadDetail(){
    const id=this.snapshot.selected;if(!id||!this.#authorized)return;
    const epoch=this.#epoch,request=++this.#detailRequest;
    try{const [detail,page]=await Promise.all([api.getMessengerConversation({path:{id},throwOnError:true}),api.getMessengerMessages({path:{id},query:{take:50},throwOnError:true})]);
      if(!this.#valid(epoch)||request!==this.#detailRequest||id!==this.snapshot.selected)return;
      this.#set({detail:detail.data,messages:page.data.items,nextBefore:page.data.nextBeforeSequence,detailLoading:false,...(!detail.data.isActive?{typing:{},online:{}}:{})});
      void this.#beat();
    }catch{if(this.#valid(epoch)&&request===this.#detailRequest)this.#set({detailLoading:false,error:'loadError'});}
  }
  async older(){
    const {selected:id,nextBefore}=this.snapshot;if(!id||nextBefore===null||this.snapshot.busy)return;
    const epoch=this.#epoch,request=this.#detailRequest;this.#set({busy:true,error:undefined});
    try{const {data}=await api.getMessengerMessages({path:{id},query:{beforeSequence:nextBefore,take:50},throwOnError:true});if(!this.#valid(epoch)||request!==this.#detailRequest||id!==this.snapshot.selected)return;const messages=new Map([...data.items,...this.snapshot.messages].map(x=>[x.id,x]));this.#set({messages:[...messages.values()].sort((a,b)=>a.sequence-b.sequence),nextBefore:data.nextBeforeSequence});}
    catch{if(this.#valid(epoch)&&id===this.snapshot.selected)this.#set({error:'loadError'});}finally{if(this.#valid(epoch))this.#set({busy:false});}
  }
  setDraft(id:string,body:string){this.#set({drafts:{...this.snapshot.drafts,[id]:body}});}
  async send(){
    const {detail,drafts}=this.snapshot;if(!detail?.isActive||this.snapshot.busy)return false;
    const body=drafts[detail.id]?.trim();if(!body||body.length>100000)return false;
    const epoch=this.#epoch;this.#set({busy:true,error:undefined});this.stopTyping();
    try{await api.postMessengerMessage({path:{id:detail.id},body:{body},throwOnError:true});if(!this.#valid(epoch))return false;if(this.snapshot.drafts[detail.id]===drafts[detail.id])this.setDraft(detail.id,'');await this.refresh();if(this.snapshot.selected===detail.id)await this.loadDetail();return true;}
    catch{if(this.#valid(epoch))this.#set({error:'sendError'});return false;}finally{if(this.#valid(epoch))this.#set({busy:false});}
  }
  async markDisplayed(sequence:number){
    const {detail,open}=this.snapshot;
    if(!this.#authorized||!open||!detail?.isActive||document.visibilityState!=='visible'||!document.hasFocus()||sequence<=detail.lastReadSequence||!this.snapshot.messages.some(x=>x.sequence===sequence)||(this.#readAttempted.get(detail.id)??0)>=sequence)return;
    const epoch=this.#epoch;this.#readAttempted.set(detail.id,sequence);
    try{await api.putMessengerRead({path:{id:detail.id},body:{sequence},throwOnError:true});if(this.#valid(epoch)){if(this.snapshot.detail?.id===detail.id)this.#set({detail:{...this.snapshot.detail,lastReadSequence:Math.max(sequence,this.snapshot.detail.lastReadSequence)}});void this.refresh();}}
    catch{if(this.#valid(epoch))this.#set({error:'readError'});}
  }
  typing(body:string){
    if(!body.trim()){this.stopTyping();return;}
    const id=this.snapshot.detail?.isActive&&this.snapshot.open?this.snapshot.detail.id:undefined;
    if(!id||this.snapshot.live!=='connected')return;
    if(this.#typingConversation!==id||Date.now()-this.#typingAt>=2000){this.#typingConversation=id;this.#typingAt=Date.now();void this.#connection?.invoke('Typing',id,true).catch(()=>{});}
    clearTimeout(this.#typingStop);this.#typingStop=setTimeout(()=>this.stopTyping(),2500);
  }
  stopTyping(){clearTimeout(this.#typingStop);const id=this.#typingConversation;this.#typingConversation=undefined;if(id)void this.#connection?.invoke('Typing',id,false).catch(()=>{});}
  async directory(query=''){
    const epoch=this.#epoch,request=++this.#directoryRequest;this.#set({directoryLoading:true,error:undefined});
    try{const {data}=await api.getMessengerDirectory({query:{query:query.slice(0,100)},throwOnError:true});if(this.#valid(epoch)&&request===this.#directoryRequest)this.#set({directory:data,directoryLoading:false});}catch{if(this.#valid(epoch)&&request===this.#directoryRequest)this.#set({directoryLoading:false,error:'directoryError'});}
  }
  async create(body:CreateConversationRequest){return this.#mutate(async()=>{const {data}=await api.postMessengerConversation({body,throwOnError:true});return data.id;});}
  async invite(body:RecipientsRequest){const id=this.snapshot.detail?.id;if(!id)return false;return this.#mutate(async()=>{await api.postMessengerParticipants({path:{id},body,throwOnError:true});return id;});}
  async mute(){const detail=this.snapshot.detail;if(!detail?.isActive)return false;return this.#mutate(async()=>{await api.putMessengerMute({path:{id:detail.id},body:{muted:!detail.muted},throwOnError:true});return detail.id;});}
  async leave(){const detail=this.snapshot.detail;if(!detail?.isActive)return false;this.stopTyping();return this.#mutate(async()=>{await api.deleteMessengerMembership({path:{id:detail.id},throwOnError:true});return detail.id;});}
  async #mutate(action:()=>Promise<string>){
    if(!this.#authorized||this.snapshot.busy)return false;
    const epoch=this.#epoch,navigation=this.#navigation;this.#set({busy:true,error:undefined});
    try{const id=await action();if(!this.#valid(epoch))return false;await this.refresh();if(!this.#valid(epoch))return false;if(this.#navigation===navigation){if(this.snapshot.selected===id)await this.loadDetail();else await this.select(id);}return true;}
    catch{if(this.#valid(epoch))this.#set({error:'actionError'});return false;}finally{if(this.#valid(epoch))this.#set({busy:false});}
  }
  clearError(){this.#readAttempted.clear();this.#set({error:undefined});}
}
export { MessengerContext as api };
