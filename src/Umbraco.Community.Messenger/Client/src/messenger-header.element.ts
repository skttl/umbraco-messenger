import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { html,css,customElement,state,nothing,repeat } from '@umbraco-cms/backoffice/external/lit';
import { MESSENGER_CONTEXT, type MessengerContext, type MessengerSnapshot } from './messenger.context';
import type { MessageResponse } from './api/types.gen';
import { en } from './locales';

@customElement('messenger-header-app')
export class MessengerHeaderElement extends UmbLitElement {
  #context?:MessengerContext;
  @state() private _data?:MessengerSnapshot;
  @state() private _search='';
  @state() private _filter:'active'|'unread'|'former'='active';
  @state() private _flow:'new'|'invite'|'leave'|undefined;
  @state() private _subject='';
  @state() private _body='';
  @state() private _recipientQuery='';
  @state() private _recipients:Record<string,string>={};
  @state() private _share=false;
  #listeners?:AbortController;
  #observer?:IntersectionObserver;
  #observed='';
  #lastThread?:string;
  #lastMessage?:string;
  #directoryTimer?:ReturnType<typeof setTimeout>;
  constructor(){super();this.consumeContext(MESSENGER_CONTEXT,context=>{this.#context=context;this.observe(context?.state,data=>{const loggedOut=data&&!data.authorized&&this._data?.authorized;this._data=data;if(loggedOut){this.#closeFlow();this.#close();this._subject="";this._body="";this._recipients={};this._recipientQuery="";this._search="";this._filter="active";}},'messenger-state');});}
  #t(key:keyof typeof en.messenger){return this.localize.term(`messenger_${key}`);}
  get #panel(){return this.shadowRoot?.querySelector<HTMLDialogElement>('#panel');}
  get #dialog(){return this.shadowRoot?.querySelector<HTMLDialogElement>('#flow');}
  override connectedCallback(){
    super.connectedCallback();this.#listeners=new AbortController();const signal=this.#listeners.signal;
    window.addEventListener('keydown',this.#escape,{signal});
    window.addEventListener('focus',this.#readVisible,{signal});
    document.addEventListener('visibilitychange',this.#readVisible,{signal});
  }
  override disconnectedCallback(){this.#context?.setOpen(false);this.#listeners?.abort();this.#observer?.disconnect();clearTimeout(this.#directoryTimer);super.disconnectedCallback();}
  #escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&this._data?.open&&!this.#dialog?.open){event.preventDefault();this.#close();}};
  #toggle(){const panel=this.#panel;if(!panel)return;if(this._data?.open){this.#close();return;}this.#context?.setOpen(true);if('showPopover' in HTMLElement.prototype)panel.showPopover();else panel.show();}
  #close(){const panel=this.#panel;if(panel){if('hidePopover' in HTMLElement.prototype&&panel.matches(':popover-open'))panel.hidePopover();else if(panel.open)panel.close();}this.#context?.setOpen(false);}
  #onToggle=(event:Event)=>{const open=(event as ToggleEvent).newState==='open';if(this._data?.open!==open)this.#context?.setOpen(open);};
  async #openFlow(flow:'new'|'invite'|'leave'){
    this._flow=flow;this._subject='';this._body='';this._recipientQuery='';this._recipients={};this._share=false;this.#context?.clearError();this.#context?.stopTyping();
    await this.updateComplete;this.#dialog?.showModal();if(flow!=='leave')void this.#context?.directory();
  }
  #closeFlow(){this.#dialog?.close();this._flow=undefined;this.#readVisible();}
  async #submit(event:Event){
    event.preventDefault();if(!this.#context)return;
    const userIds=Object.keys(this._recipients).filter(x=>x.startsWith('u:')).map(x=>x.slice(2));
    const groupIds=Object.keys(this._recipients).filter(x=>x.startsWith('g:')).map(x=>x.slice(2));
    let ok=false;
    if(this._flow==='leave')ok=await this.#context.leave();
    else if(this._flow==='invite'&&(userIds.length||groupIds.length))ok=await this.#context.invite({userIds,groupIds,shareHistory:this._share});
    else if(this._flow==='new'&&this._subject.trim()&&this._subject.length<=120&&this._body.trim()&&this._body.length<=4000&&(userIds.length||groupIds.length))ok=await this.#context.create({subject:this._subject.trim(),body:this._body.trim(),userIds,groupIds});
    if(ok)this.#closeFlow();
  }
  #choose(key:string,label:string,checked:boolean){const selection={...this._recipients};if(checked)selection[key]=label;else delete selection[key];this._recipients=selection;}
  #searchRecipients(event:Event){this._recipientQuery=(event.target as HTMLInputElement).value;clearTimeout(this.#directoryTimer);this.#directoryTimer=setTimeout(()=>void this.#context?.directory(this._recipientQuery),250);}
  #date(value:string){return new Date(value).toLocaleString(this.localize.lang()||undefined,{dateStyle:'short',timeStyle:'short'});}
  #error(){const error=this._data?.error;return error?html`<div class="error" role="alert"><span>${this.#t(error as keyof typeof en.messenger)}</span><uui-button look="secondary" label=${this.#t('retry')} @click=${()=>{this.#context?.clearError();if(this._flow&&this._flow!=='leave')void this.#context?.directory(this._recipientQuery);else{void this.#context?.refresh();if(this._data?.selected)void this.#context?.loadDetail();}}}>${this.#t('retry')}</uui-button></div>`:nothing;}
  #icon(){return html`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 15H7l-4 4V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v6a4 4 0 0 1-4 4Z"/><path d="M8 18h9l4 3V10a2 2 0 0 0-2-2"/></svg>`;}
  override render(){
    const data=this._data,count=data?.unreadCount??0;
    return html`
      <uui-button id="launcher" compact look="primary" label=${`${this.#t('open')}${count?`, ${count} ${this.#t('unread')}`:''}`} aria-controls="panel" aria-expanded=${data?.open?'true':'false'} @click=${this.#toggle}>
        ${this.#icon()}${count?html`<span class="badge" aria-hidden="true">${count>99?'99+':count}</span>`:nothing}
      </uui-button>
      <dialog id="panel" popover="manual" aria-labelledby="panel-title" @toggle=${this.#onToggle}>
        <header class="panel-head"><div class="brand">${this.#icon()}<h2 id="panel-title">${this.#t('title')}</h2></div><uui-button compact label=${this.#t('close')} @click=${this.#close}><umb-icon name="icon-delete"></umb-icon></uui-button></header>
        ${data?.live!=='connected'?html`<div class="live" role="status">${this.#t(data?.live==='connecting'?'connecting':data?.live==='reconnecting'?'reconnecting':'liveOffline')}</div>`:nothing}
        ${!this._flow?this.#error():nothing}
        ${data?.selected?this.#thread():this.#list()}
      </dialog>
      ${this.#flow()}
    `;
  }
  #list(){
    const data=this._data;const items=(data?.conversations??[]).filter(x=>(this._filter==='former'?!x.isActive:x.isActive&&(this._filter!=='unread'||x.unreadCount>0))&&x.subject.toLocaleLowerCase().includes(this._search.toLocaleLowerCase()));
    return html`<section class="list-tools"><uui-button look="primary" color="positive" label=${this.#t('new')} @click=${()=>this.#openFlow('new')}><umb-icon name="icon-add"></umb-icon>${this.#t('new')}</uui-button><uui-input type="search" label=${this.#t('search')} placeholder=${this.#t('search')} .value=${this._search} @input=${(e:Event)=>{this._search=(e.target as HTMLInputElement).value;}}></uui-input><nav class="filters" aria-label=${this.#t('title')}>${(['active','unread','former'] as const).map(filter=>html`<button type="button" class=${filter===this._filter?'selected':''} aria-pressed=${filter===this._filter} @click=${()=>{this._filter=filter;}}>${this.#t(filter==='unread'?'unreadFilter':filter)}</button>`)}</nav></section>
      <section class="conversation-list" aria-busy=${data?.loading?'true':'false'}>
        ${data?.loading&&!data.conversations.length?html`<p class="empty"><uui-loader></uui-loader> ${this.#t('loading')}</p>`:nothing}
        ${!data?.loading&&!items.length?html`<div class="empty"><strong>${this.#t('empty')}</strong><p>${this.#t('emptyHint')}</p></div>`:nothing}
        ${repeat(items,x=>x.id,x=>html`<button type="button" class="conversation ${x.unreadCount?'unread':''}" @click=${()=>this.#context?.select(x.id)} aria-label=${`${this.#t('loadThread')}: ${x.subject}${x.unreadCount?`, ${x.unreadCount} ${this.#t('unreadMessages')}`:''}`}>
          <span class="row"><strong>${x.subject}</strong>${x.unreadCount?html`<span class="count">${x.unreadCount}</span>`:nothing}</span>
          <span class="preview">${x.lastMessage?.body??''}</span>
          <span class="row meta"><span>${x.muted?html`<umb-icon name="icon-bell-off" title=${this.#t('muted')}></umb-icon>`:nothing}${x.participants.filter(p=>p.isActive).map(p=>p.name).join(', ')}</span><time>${x.lastMessage?this.#date(x.lastMessage.createdUtc):''}</time></span>
        </button>`)}
      </section>`;
  }
  #thread(){
    const data=this._data!,detail=data.detail;
    return html`<div class="thread-head"><uui-button compact label=${this.#t('back')} @click=${()=>this.#context?.select()}><umb-icon name="icon-arrow-left"></umb-icon>${this.#t('back')}</uui-button>
      ${detail?html`<h3>${detail.subject}</h3>${detail.isActive?html`<div class="participants" aria-label=${this.#t('participants')}>${detail.participants.filter(p=>p.isActive).map(p=>html`<span><i class=${data.online[p.id]?'online':''} title=${this.#t(data.online[p.id]?'online':'offline')}></i>${p.name}</span>`)}</div><div class="thread-actions"><uui-button compact label=${this.#t('add')} @click=${()=>this.#openFlow('invite')}><umb-icon name="icon-add"></umb-icon>${this.#t('add')}</uui-button><uui-button compact label=${this.#t(detail.muted?'unmute':'mute')} ?disabled=${data.busy} @click=${()=>this.#context?.mute()}><umb-icon name=${detail.muted?'icon-bell':'icon-bell-off'}></umb-icon>${this.#t(detail.muted?'unmute':'mute')}</uui-button><uui-button compact label=${this.#t('leave')} @click=${()=>this.#openFlow('leave')}><umb-icon name="icon-out"></umb-icon>${this.#t('leave')}</uui-button></div>`:html`<p class="former-note">${this.#t('left')}</p>`}`:nothing}
      </div>
      <section class="messages" aria-label=${this.#t('message')} aria-busy=${data.detailLoading?'true':'false'} @scroll=${this.#readVisible}>
        ${data.detailLoading?html`<p class="empty"><uui-loader></uui-loader> ${this.#t('loading')}</p>`:nothing}
        ${data.nextBefore!==null?html`<uui-button look="secondary" label=${this.#t('earlier')} ?disabled=${data.busy} @click=${()=>this.#context?.older()}>${this.#t('earlier')}</uui-button>`:nothing}
        ${repeat(data.messages,x=>x.id,message=>this.#message(message))}
      </section>
      ${detail?.isActive?html`<div class="typing" role="status">${Object.keys(data.typing).map(id=>detail.participants.find(p=>p.id===id)?.name).filter(Boolean).join(', ')}${Object.keys(data.typing).length?` ${this.#t('typing')}`:''}</div><form class="composer" @submit=${(e:Event)=>{e.preventDefault();void this.#context?.send();}}><uui-textarea label=${this.#t('reply')} placeholder=${this.#t('reply')} maxlength="4000" .value=${data.drafts[detail.id]??''} @input=${(e:Event)=>{const body=(e.target as HTMLTextAreaElement).value;this.#context?.setDraft(detail.id,body);this.#context?.typing(body);}}></uui-textarea><div class="composer-foot"><small>${(data.drafts[detail.id]??'').length}/4000</small><uui-button type="submit" look="primary" color="positive" label=${this.#t('send')} ?disabled=${data.busy||!data.drafts[detail.id]?.trim()||(data.drafts[detail.id]?.length??0)>4000}>${this.#t('send')}</uui-button></div></form>`:nothing}`;
  }
  #message(message:MessageResponse){return html`<article class="message" data-sequence=${message.sequence}><div class="row"><strong>${message.senderName}</strong><time datetime=${message.createdUtc}>${this.#date(message.createdUtc)}</time></div><p>${message.body}</p></article>`;}
  #flow(){
    const flow=this._flow,dir=this._data?.directory,selection=Object.keys(this._recipients).length;
    const activeIds=new Set(this._data?.detail?.participants.filter(x=>x.isActive).map(x=>x.id));
    const valid=selection>0&&(flow!=='new'||(this._subject.trim().length>0&&this._subject.length<=120&&this._body.trim().length>0&&this._body.length<=4000));
    return html`<dialog id="flow" aria-labelledby="flow-title" @close=${()=>{this._flow=undefined;}}><form @submit=${this.#submit}><header><h2 id="flow-title">${this.#t(flow==='leave'?'leaveTitle':flow==='invite'?'add':'new')}</h2></header>
      ${flow==='leave'?html`<p>${this.#t('leaveHint')}</p>`:html`
        ${flow==='new'?html`<label>${this.#t('subject')}<uui-input label=${this.#t('subject')} maxlength="120" .value=${this._subject} @input=${(e:Event)=>{this._subject=(e.target as HTMLInputElement).value;}} autofocus></uui-input><small>${this.#t('subjectLimit')}</small></label>`:nothing}
        <label>${this.#t('recipients')}<uui-input type="search" maxlength="100" label=${this.#t('findPeople')} placeholder=${this.#t('findPeople')} .value=${this._recipientQuery} @input=${this.#searchRecipients}></uui-input></label>
        <p class="hint">${this.#t('groupHint')}</p>
        <div class="recipient-list" aria-busy=${this._data?.directoryLoading?'true':'false'}>${this._data?.directoryLoading?html`<uui-loader></uui-loader>`:nothing}
          ${(['users','groups'] as const).map(kind=>html`<fieldset><legend>${this.#t(kind==='users'?'people':'groups')}</legend>${(dir?.[kind]??[]).filter(x=>flow!=='invite'||kind==='groups'||!activeIds.has(x.id)).map(x=>{const key=`${kind==='users'?'u':'g'}:${x.id}`;return html`<label class="recipient"><input type="checkbox" .checked=${!!this._recipients[key]} @change=${(e:Event)=>this.#choose(key,x.name,(e.target as HTMLInputElement).checked)}><span>${x.name}</span></label>`;})}</fieldset>`)}
          ${!this._data?.directoryLoading&&!dir?.users.length&&!dir?.groups.length?html`<p>${this.#t('noRecipients')}</p>`:nothing}
        </div><p class="hint">${selection?html`${this.#t('selected')}: ${Object.values(this._recipients).join(', ')}`:this.#t('noneSelected')}</p>
        ${flow==='invite'?html`<fieldset><legend>${this.#t('history')}</legend><label class="recipient"><input type="radio" name="history" .checked=${!this._share} @change=${()=>{this._share=false;}}>${this.#t('future')}</label><label class="recipient"><input type="radio" name="history" .checked=${this._share} @change=${()=>{this._share=true;}}>${this.#t('share')}</label><p class="hint">${this.#t('shareHint')}</p></fieldset>`:html`<label>${this.#t('message')}<uui-textarea label=${this.#t('message')} maxlength="4000" .value=${this._body} @input=${(e:Event)=>{this._body=(e.target as HTMLTextAreaElement).value;}}></uui-textarea><small>${this.#t('bodyLimit')}</small></label>`}
      `}
      ${flow?this.#error():nothing}
      <footer><uui-button look="secondary" label=${this.#t('cancel')} ?disabled=${this._data?.busy} @click=${this.#closeFlow} autofocus=${flow==='leave'?true:nothing}>${this.#t('cancel')}</uui-button><uui-button type="submit" look="primary" color=${flow==='leave'?'danger':'positive'} label=${this.#t(flow==='leave'?'leave':flow==='invite'?'invite':'send')} ?disabled=${this._data?.busy||(flow!=='leave'&&!valid)}>${this.#t(flow==='leave'?'leave':flow==='invite'?'invite':'send')}</uui-button></footer>
    </form></dialog>`;
  }
  #readVisible=()=>{
    if(this._flow||!this._data?.open)return;
    const root=this.shadowRoot?.querySelector<HTMLElement>('.messages');if(!root)return;
    const bounds=root.getBoundingClientRect();let sequence=0;
    root.querySelectorAll<HTMLElement>('[data-sequence]').forEach(el=>{const rect=el.getBoundingClientRect();if(rect.bottom>bounds.top&&rect.top<bounds.bottom)sequence=Math.max(sequence,Number(el.dataset.sequence));});
    if(sequence)void this.#context?.markDisplayed(sequence);
  };
  protected override updated(){
    const data=this._data;if(!data?.open)return;
    const root=this.shadowRoot?.querySelector<HTMLElement>('.messages');if(!root)return;
    const last=data.messages.at(-1)?.id;
    const threadChanged=this.#lastThread!==data.selected;
    if(last&&(threadChanged||(!this.#lastMessage&&data.messages.length)||root.scrollHeight-root.scrollTop-root.clientHeight<100)){if(last!==this.#lastMessage)root.scrollTop=root.scrollHeight;}
    this.#lastThread=data.selected;this.#lastMessage=last;
    const key=`${data.selected}:${data.messages.map(x=>x.id).join(',')}`;
    if(key!==this.#observed){this.#observed=key;this.#observer?.disconnect();this.#observer=new IntersectionObserver(this.#readVisible,{root,threshold:0.1});root.querySelectorAll('[data-sequence]').forEach(el=>this.#observer?.observe(el));}
    this.#readVisible();
  }
  static override styles=css`
    :host{display:block;font:inherit;color:inherit}uui-button{font:inherit}#launcher{position:relative;--uui-button-background-color:transparent;--uui-button-background-color-hover:var(--uui-color-emphasis)}#launcher svg{display:block}.badge{position:absolute;top:1px;right:-3px;min-width:14px;height:16px;padding:0 3px;border-radius:10px;background:#F4A340;color:#1B264F;font-size:10px;font-weight:700;line-height:16px}
    dialog{font:inherit;color:var(--uui-color-text);background:var(--uui-color-surface);border:1px solid var(--uui-color-border);box-shadow:var(--uui-shadow-depth-5);padding:0}#panel{position:fixed;inset:var(--umb-header-layout-height,70px) 0 0 auto;width:min(480px,100vw);height:calc(100dvh - var(--umb-header-layout-height,70px));max-height:none;max-width:100vw;margin:0;border-radius:0;border-right:0;border-bottom:0;overflow:hidden}#panel:popover-open,#panel[open]{display:flex;flex-direction:column}#panel::backdrop{background:transparent;pointer-events:none}.panel-head{padding:var(--uui-size-space-4);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--uui-color-border)}.brand{display:flex;align-items:center;gap:var(--uui-size-space-3)}h2{font-size:18px;margin:0}h3{font-size:20px;line-height:1.3;margin:12px 0;overflow-wrap:anywhere}.live{padding:8px 16px;background:var(--uui-color-surface-alt);font-size:12px}.list-tools{padding:16px 16px 0;display:grid;gap:14px}.list-tools>uui-button{justify-self:start}uui-input,uui-textarea{width:100%}.filters{display:flex;gap:18px;border-bottom:1px solid var(--uui-color-border)}.filters button{appearance:none;border:0;border-bottom:3px solid transparent;background:transparent;color:var(--uui-color-text-alt);padding:8px 0;cursor:pointer;font:inherit}.filters button.selected{border-color:var(--uui-color-selected);color:var(--uui-color-text);font-weight:700}.conversation-list{overflow:auto;flex:1}.conversation{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--uui-color-border);background:var(--uui-color-surface);color:var(--uui-color-text);padding:18px 20px;cursor:pointer;font:inherit}.conversation:hover,.conversation:focus-visible{background:var(--uui-color-surface-emphasis)}.conversation.unread{box-shadow:inset 3px 0 var(--uui-color-selected)}.row{display:flex;gap:12px;align-items:baseline;justify-content:space-between}.row strong{overflow-wrap:anywhere}.count{border-radius:12px;background:var(--uui-color-selected);color:var(--uui-color-selected-contrast);font-size:11px;font-weight:700;padding:2px 6px}.preview{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:7px 0;color:var(--uui-color-text-alt)}.meta,time{font-size:11px;color:var(--uui-color-text-alt)}.meta>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.meta time{flex-shrink:0}umb-icon{vertical-align:middle}.empty{padding:32px 24px;color:var(--uui-color-text-alt);text-align:center}.empty p{max-width:28ch;margin:10px auto}.thread-head{padding:8px 16px 12px;border-bottom:1px solid var(--uui-color-border)}.thread-head>uui-button{margin-left:-10px}.participants{display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--uui-color-text-alt)}.participants i{display:inline-block;width:7px;height:7px;margin-right:5px;border-radius:50%;background:var(--uui-color-border)}.participants i.online{background:var(--uui-color-positive)}.thread-actions{display:flex;flex-wrap:wrap;gap:2px;margin:12px -8px -8px;font-size:11px}.messages{min-height:0;overflow:auto;overscroll-behavior:contain;flex:1;padding:18px;background:var(--uui-color-surface-alt)}.message{padding:14px;background:var(--uui-color-surface);border:1px solid var(--uui-color-border);border-radius:var(--uui-border-radius);margin-bottom:12px;overflow-wrap:anywhere}.message strong{font-size:12px}.message p{white-space:pre-wrap;line-height:1.55;margin:8px 0 0}.message time{white-space:nowrap}.typing{font-size:11px;color:var(--uui-color-text-alt);padding:2px 18px;min-height:18px}.composer{padding:0 16px 14px}.composer uui-textarea{min-height:75px}.composer-foot{display:flex;align-items:center;justify-content:space-between;margin-top:8px}.composer-foot small{color:var(--uui-color-text-alt)}.former-note,.hint{font-size:12px;color:var(--uui-color-text-alt);line-height:1.5}.error{padding:12px 16px;display:flex;gap:8px;align-items:center;justify-content:space-between;background:var(--uui-color-danger);color:var(--uui-color-danger-contrast);font-size:12px}.error uui-button{flex-shrink:0}#flow{width:min(520px,calc(100vw - 40px));max-height:calc(100dvh - 40px);border-radius:var(--uui-border-radius);margin:auto;padding:24px;overflow:auto}#flow:modal{overscroll-behavior:contain}#flow::backdrop{background:rgba(0,0,0,.35);overflow:hidden;overscroll-behavior:contain}#flow header{margin-bottom:20px}#flow label:not(.recipient){display:grid;gap:6px;margin-top:16px}#flow small{color:var(--uui-color-text-alt)}#flow footer{display:flex;gap:8px;justify-content:flex-end;margin-top:20px}.recipient-list{max-height:210px;overflow:auto;border:1px solid var(--uui-color-border);padding:8px 12px}.recipient{display:flex;align-items:center;gap:10px;padding:7px 0;cursor:pointer}.recipient input{accent-color:var(--uui-color-selected);width:16px;height:16px}fieldset{border:0;padding:8px 0;margin:0}legend{font-size:12px;font-weight:700}button:focus-visible,input:focus-visible{outline:2px solid var(--uui-color-focus);outline-offset:2px}
    @media(max-width:500px){#panel{top:0;height:100dvh;width:100vw}.thread-actions{font-size:10px}.message .row{flex-wrap:wrap;gap:3px}}`;
}
export default MessengerHeaderElement;



