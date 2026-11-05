// Accessible focus management for the game's layered dialog system.
const DIALOG_SELECTOR='[role="dialog"][aria-modal="true"]';
const FOCUSABLE_SELECTOR='a[href],area[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),iframe,[contenteditable="true"],[tabindex]:not([tabindex="-1"])';

function isVisible(element){
    return Boolean(element&&element.isConnected&&!element.closest(".hidden")&&element.getClientRects().length);
}

function focusableElements(dialog){
    return [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)].filter(element=>
        isVisible(element)&&element.getAttribute("aria-hidden")!=="true"&&!element.closest("[inert]")
    );
}

export function setupModalAccessibility(){
    const dialogs=[...document.querySelectorAll(DIALOG_SELECTOR)];
    if(!dialogs.length)return;
    const stack=[];
    const visibility=new WeakMap();
    let clickedTrigger=null;

    function topDialog(){
        for(let index=stack.length-1;index>=0;index--){
            if(isVisible(stack[index].dialog))return stack[index].dialog;
        }
        return null;
    }

    function updateBodyLock(){
        document.body.classList.toggle("ui-modal-open",Boolean(topDialog()));
    }

    function focusInside(dialog){
        if(!dialog)return;
        const target=dialog.querySelector("[autofocus]")||focusableElements(dialog)[0]||dialog;
        if(target===dialog&&!dialog.hasAttribute("tabindex"))dialog.setAttribute("tabindex","-1");
        target.focus({preventScroll:true});
    }

    function fallbackFocus(){
        const main=document.getElementById("main-container")||document.body;
        if(main===document.body&&!main.hasAttribute("tabindex"))main.setAttribute("tabindex","-1");
        main.focus({preventScroll:true});
    }

    function openDialog(dialog,opener){
        const existing=stack.findIndex(entry=>entry.dialog===dialog);
        if(existing>=0)stack.splice(existing,1);
        stack.push({dialog,opener:opener||null});
        updateBodyLock();
        queueMicrotask(()=>{if(topDialog()===dialog)focusInside(dialog);});
    }

    function closeDialog(dialog){
        const index=stack.findIndex(entry=>entry.dialog===dialog);
        if(index<0)return;
        const wasTop=index===stack.length-1;
        const [entry]=stack.splice(index,1);
        updateBodyLock();
        if(!wasTop)return;
        const next=topDialog();
        if(next){focusInside(next);return;}
        if(isVisible(entry.opener)){entry.opener.focus({preventScroll:true});return;}
        fallbackFocus();
    }

    document.addEventListener("click",event=>{
        const trigger=event.target.closest("button,a,[role='button'],input");
        if(!trigger)return;
        clickedTrigger=trigger;
        window.setTimeout(()=>{if(clickedTrigger===trigger)clickedTrigger=null;},0);
    },true);

    for(const dialog of dialogs){
        if(!dialog.hasAttribute("tabindex"))dialog.setAttribute("tabindex","-1");
        const visible=isVisible(dialog);
        visibility.set(dialog,visible);
        if(visible)openDialog(dialog,null);
    }

    const observer=new MutationObserver(records=>{
        for(const record of records){
            const dialog=record.target;
            const wasVisible=visibility.get(dialog)===true;
            const nowVisible=isVisible(dialog);
            if(nowVisible&&!wasVisible){
                const opener=clickedTrigger&&isVisible(clickedTrigger)&&!dialog.contains(clickedTrigger)
                    ?clickedTrigger:document.activeElement;
                openDialog(dialog,opener);
            }else if(!nowVisible&&wasVisible){
                closeDialog(dialog);
            }
            visibility.set(dialog,nowVisible);
        }
    });
    dialogs.forEach(dialog=>observer.observe(dialog,{attributes:true,attributeFilter:["class"]}));

    document.addEventListener("keydown",event=>{
        if(event.key!=="Tab")return;
        const dialog=topDialog();
        if(!dialog)return;
        const items=focusableElements(dialog);
        if(!items.length){event.preventDefault();focusInside(dialog);return;}
        const first=items[0],last=items[items.length-1],active=document.activeElement;
        if(event.shiftKey&&(active===first||!dialog.contains(active))){
            event.preventDefault();last.focus({preventScroll:true});
        }else if(!event.shiftKey&&(active===last||!dialog.contains(active))){
            event.preventDefault();first.focus({preventScroll:true});
        }
    });

    document.addEventListener("focusin",event=>{
        const dialog=topDialog();
        if(dialog&&!dialog.contains(event.target))focusInside(dialog);
    },true);
}
