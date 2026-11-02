import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { html,css,customElement,state,property,nothing } from '@umbraco-cms/backoffice/external/lit';
import { MESSENGER_CONTEXT, type MessengerContext, type MessengerSnapshot } from './messenger.context';
import { en } from './locales';
import '@umbraco-cms/backoffice/components';
import type { UmbModalContext, UmbModalExtensionElement } from '@umbraco-cms/backoffice/modal';

@customElement('messenger-flow')
export class MessengerFlowElement extends UmbLitElement implements UmbModalExtensionElement {
  @property({attribute:false}) modalContext?:UmbModalContext;
  @property({attribute:false}) data?:{flow:'new'|'invite'|'leave'};
  #context?:MessengerContext;
  @state() private _data?:MessengerSnapshot;
  @state() private _subject='';
  @state() private _body='';
  @state() private _recipientQuery='';
  @state() private _recipients:Record<string,string>={};
  @state() private _share=false;
  #directoryTimer?:ReturnType<typeof setTimeout>;
  #wrapper?:Element;
  get _flow(){return this.data?.flow??'new';}
  constructor(){super();this.consumeContext(MESSENGER_CONTEXT,context=>{this.#context=context;this.observe(context?.state,data=>{this._data=data;if(data&&!data.authorized)this.modalContext?.reject();},'messenger-state');});}
  #t(key:keyof typeof en.messenger){return this.localize.term(`messenger_${key}`);}
  override connectedCallback(){
    super.connectedCallback();
    this.#wrapper=this.closest('uui-modal-sidebar,uui-modal-dialog')??undefined;
    this.#wrapper?.addEventListener('uui:modal-close',this.#guardClose,true);
    window.addEventListener('keydown',this.#guardEscape,true);
    if(this._flow!=='leave')void this.#context?.directory();
  }
  override disconnectedCallback(){clearTimeout(this.#directoryTimer);this.#wrapper?.removeEventListener('uui:modal-close',this.#guardClose,true);window.removeEventListener('keydown',this.#guardEscape,true);super.disconnectedCallback();}
  #guardClose=(event:Event)=>{if(this._data?.authorized&&this._data.busy&&!this.modalContext?.isResolved?.()){event.preventDefault();event.stopImmediatePropagation();}};
  #guardEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')this.#guardClose(event);};
  #closeFlow(){if(!this._data?.busy)this.modalContext?.reject();}
  async #submit(event:Event){
    event.preventDefault();if(!this.#context||this._data?.busy)return;
    const userIds=Object.keys(this._recipients).filter(x=>x.startsWith('u:')).map(x=>x.slice(2));
    const groupIds=Object.keys(this._recipients).filter(x=>x.startsWith('g:')).map(x=>x.slice(2));
    let ok=false;
    if(this._flow==='leave')ok=await this.#context.leave();
    else if(this._flow==='invite'&&(userIds.length||groupIds.length))ok=await this.#context.invite({userIds,groupIds,shareHistory:this._share});
    else if(this._flow==='new'&&this._subject.trim()&&this._subject.length<=120&&this._body.trim()&&this._body.length<=100000&&(userIds.length||groupIds.length))ok=await this.#context.create({subject:this._subject.trim(),body:this._body.trim(),userIds,groupIds});
    if(ok)this.modalContext?.submit();
  }
  #choose(key:string,label:string,checked:boolean){const selection={...this._recipients};if(checked)selection[key]=label;else delete selection[key];this._recipients=selection;}
  #searchRecipients(event:Event){this._recipientQuery=(event.target as HTMLInputElement).value;clearTimeout(this.#directoryTimer);this.#directoryTimer=setTimeout(()=>void this.#context?.directory(this._recipientQuery),250);}
  #error(){const error=this._data?.error;return error?html`<div class="error" role="alert"><span>${this.#t(error as keyof typeof en.messenger)}</span><uui-button look="secondary" label=${this.#t('retry')} @click=${()=>{this.#context?.clearError();if(this._flow!=='leave')void this.#context?.directory(this._recipientQuery);}}>${this.#t('retry')}</uui-button></div>`:nothing;}
  override render(){
    const flow=this._flow,dir=this._data?.directory,selection=Object.keys(this._recipients).length;
    const activeIds=new Set(this._data?.detail?.participants.filter(x=>x.isActive).map(x=>x.id));
    const valid=selection>0&&(flow!=='new'||(this._subject.trim().length>0&&this._subject.length<=120&&this._body.trim().length>0&&this._body.length<=100000));
    return html`<umb-body-layout headline=${this.#t(flow==='leave'?'leaveTitle':flow==='invite'?'add':'new')}><form id="flow" @submit=${this.#submit}>
      ${flow==='leave'?html`<p>${this.#t('leaveHint')}</p>`:html`
        ${flow==='new'?html`<label>${this.#t('subject')}<uui-input label=${this.#t('subject')} maxlength="120" ?disabled=${this._data?.busy} .value=${this._subject} @input=${(e:Event)=>{this._subject=(e.target as HTMLInputElement).value;}} autofocus></uui-input><small>${this.#t('subjectLimit')}</small></label>`:nothing}
        <label>${this.#t('recipients')}<uui-input type="search" maxlength="100" label=${this.#t('findPeople')} placeholder=${this.#t('findPeople')} ?disabled=${this._data?.busy} .value=${this._recipientQuery} @input=${this.#searchRecipients}></uui-input></label>
        <p class="hint">${this.#t('groupHint')}</p>
        <div class="recipient-list" aria-busy=${this._data?.directoryLoading?'true':'false'}>${this._data?.directoryLoading?html`<uui-loader></uui-loader>`:nothing}
          ${(['users','groups'] as const).map(kind=>html`<fieldset><legend>${this.#t(kind==='users'?'people':'groups')}</legend>${(dir?.[kind]??[]).filter(x=>flow!=='invite'||kind==='groups'||!activeIds.has(x.id)).map(x=>{const key=`${kind==='users'?'u':'g'}:${x.id}`;return html`<label class="recipient"><input type="checkbox" ?disabled=${this._data?.busy} .checked=${!!this._recipients[key]} @change=${(e:Event)=>this.#choose(key,x.name,(e.target as HTMLInputElement).checked)}><span>${x.name}</span></label>`;})}</fieldset>`)}
          ${!this._data?.directoryLoading&&!dir?.users.length&&!dir?.groups.length?html`<p>${this.#t('noRecipients')}</p>`:nothing}
        </div><p class="hint">${selection?html`${this.#t('selected')}: ${Object.values(this._recipients).join(', ')}`:this.#t('noneSelected')}</p>
        ${flow==='invite'?html`<fieldset><legend>${this.#t('history')}</legend><label class="recipient"><input type="radio" name="history" ?disabled=${this._data?.busy} .checked=${!this._share} @change=${()=>{this._share=false;}}>${this.#t('future')}</label><label class="recipient"><input type="radio" name="history" ?disabled=${this._data?.busy} .checked=${this._share} @change=${()=>{this._share=true;}}>${this.#t('share')}</label><p class="hint">${this.#t('shareHint')}</p></fieldset>`:html`<label>${this.#t('message')}<uui-textarea label=${this.#t('message')} maxlength="100000" ?disabled=${this._data?.busy} .value=${this._body} @input=${(e:Event)=>{this._body=(e.target as HTMLTextAreaElement).value;}}></uui-textarea></label>`}
      `}
      ${flow?this.#error():nothing}
      ${this._data?.busy?html`<p role="status">${this.#t("saving")}</p>`:nothing}
      </form><div slot="actions"><uui-button look="secondary" label=${this.#t('cancel')} ?disabled=${this._data?.busy} @click=${this.#closeFlow} autofocus=${flow==='leave'?true:nothing}>${this.#t('cancel')}</uui-button><uui-button @click=${this.#submit} look="primary" color=${flow==='leave'?'danger':'positive'} label=${this.#t(flow==='leave'?'leave':flow==='invite'?'invite':'send')} ?disabled=${this._data?.busy||(flow!=='leave'&&!valid)}>${this.#t(flow==='leave'?'leave':flow==='invite'?'invite':'send')}</uui-button></div>
    </umb-body-layout>`;
  }
  static override styles=css`
    :host{display:block;height:100%;color:var(--uui-color-text)}uui-input,uui-textarea{width:100%}uui-textarea{min-height:180px}#flow label:not(.recipient){display:grid;gap:6px;margin-top:16px}small,.hint{color:var(--uui-color-text-alt);font-size:12px;line-height:1.5}[slot=actions]{display:flex;gap:8px}.recipient-list{max-height:35dvh;overflow:auto;border:1px solid var(--uui-color-border);padding:8px 12px;background:var(--uui-color-surface)}.recipient{display:flex;align-items:center;gap:10px;padding:7px 0;cursor:pointer}.recipient input{accent-color:var(--uui-color-selected);width:16px;height:16px}fieldset{border:0;padding:8px 0;margin:0}legend{font-size:12px;font-weight:700}.error{padding:12px;display:flex;align-items:center;gap:8px;justify-content:space-between;background:var(--uui-color-danger);color:var(--uui-color-danger-contrast)}input:focus-visible{outline:2px solid var(--uui-color-focus);outline-offset:2px}`;
}
export default MessengerFlowElement;