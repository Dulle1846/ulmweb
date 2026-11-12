// Accessible focus management for the game's layered dialog system.
const DIALOG_SELECTOR='[role="dialog"][aria-modal="true"]';
const FOCUSABLE_SELECTOR='a[href],area[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),iframe,[contenteditable="true"],[tabindex]:not([tabindex="-1"])';
const NON_CONTENT_TAGS=Object.freeze(["SCRIPT","STYLE","LINK","META","TEMPLATE"]);

function isVisible(element){
    return Boolean(element&&element.isConnected&&!element.closest(".hidden")&&element.getClientRects().length);
}

// Focus guards run on every focus change. A layout query there would force the
// freshly rendered management panel to lay out inside the click task, which is
// especially expensive on a throttled device. The dialog contract uses the
// shared .hidden class, so the open state can be read without touching layout.
function isOpenDialog(dialog){
    return Boolean(dialog&&dialog.isConnected&&!dialog.classList.contains("hidden")&&!dialog.closest(".hidden"));
}

function focusableElements(dialog){
    return [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)].filter(element=>
        isVisible(element)&&element.getAttribute("aria-hidden")!=="true"&&!element.closest("[inert]")
    );
}

function collectBackgroundTargets(dialog, root){
    const targets=new Set();
    if(!dialog||dialog===root||!root.contains(dialog))return targets;
    let node=dialog;
    while(node&&node!==root){
        const parent=node.parentElement;
        if(!parent)return new Set();
        for(const child of parent.children){
            if(child===node)continue;
            if(child.contains&&child.contains(dialog))continue;
            if(NON_CONTENT_TAGS.includes(child.tagName))continue;
            targets.add(child);
        }
        node=parent;
    }
    return node===root?targets:new Set();
}

// Keeps the original inert/aria-hidden values for every element the dialog
// manager has touched. Re-syncing from the base state makes nested dialogs
// safe: only the top dialog is active, and every close path restores exactly
// what was there before, with no leaked inert attributes.
export function createBackgroundInert(root){
    const states=new Map();
    function remember(element){
        if(states.has(element))return;
        states.set(element,{
            hadInert:element.hasAttribute("inert"),
            ariaHidden:element.getAttribute("aria-hidden")
        });
    }
    function restore(element){
        const state=states.get(element);
        if(!state)return;
        if(state.hadInert)element.setAttribute("inert","");
        else element.removeAttribute("inert");
        if(state.ariaHidden===null)element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden",state.ariaHidden);
    }
    function sync(dialog){
        const targets=collectBackgroundTargets(dialog,root);
        for(const element of states.keys()){
            if(!targets.has(element))restore(element);
        }
        for(const element of targets){
            remember(element);
            element.setAttribute("inert","");
            element.setAttribute("aria-hidden","true");
        }
        return targets;
    }
    return {sync,collect:dialog=>collectBackgroundTargets(dialog,root)};
}

export function activateSkipLink(event,main){
    if(!main)return false;
    event?.preventDefault?.();
    main.focus?.({preventScroll:true});
    main.scrollIntoView?.({block:"start"});
    return true;
}

export function setupModalAccessibility(){
    const dialogs=[...document.querySelectorAll(DIALOG_SELECTOR)];
    if(!dialogs.length)return;
    const stack=[];
    const visibility=new WeakMap();
    const background=createBackgroundInert(document.body);
    let clickedTrigger=null;

    function topDialog(){
        for(let index=stack.length-1;index>=0;index--){
            if(isOpenDialog(stack[index].dialog))return stack[index].dialog;
        }
        return null;
    }

    function updateModalState(){
        const top=topDialog();
        document.body.classList.toggle("ui-modal-open",Boolean(top));
        background.sync(top);
    }

    function focusInside(dialog){
        if(!dialog)return;
        // Pick the first usable control without measuring every button in the
        // dialog. focusableElements() is still used by the Tab trap, where the
        // complete list is required, but opening a panel must not force layout.
        const target=dialog.querySelector("[autofocus]")
            ||[...dialog.querySelectorAll(FOCUSABLE_SELECTOR)].find(element=>
                !element.closest(".hidden")&&element.getAttribute("aria-hidden")!=="true"&&!element.closest("[inert]"))
            ||dialog;
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
        updateModalState();
        queueMicrotask(()=>{if(topDialog()===dialog)focusInside(dialog);});
    }

    function closeDialog(dialog){
        const index=stack.findIndex(entry=>entry.dialog===dialog);
        if(index<0)return;
        const wasTop=index===stack.length-1;
        const [entry]=stack.splice(index,1);
        updateModalState();
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

    const skipLink=document.getElementById("skip-to-game");
    const mainContent=document.getElementById("main-container");
    if(skipLink&&mainContent){
        skipLink.addEventListener("click",event=>{
            if(topDialog())return;
            activateSkipLink(event,mainContent);
        });
    }

    for(const dialog of dialogs){
        if(!dialog.hasAttribute("tabindex"))dialog.setAttribute("tabindex","-1");
        const visible=isOpenDialog(dialog);
        visibility.set(dialog,visible);
        if(visible)openDialog(dialog,null);
    }

    const observer=new MutationObserver(records=>{
        for(const record of records){
            const dialog=record.target;
            const wasVisible=visibility.get(dialog)===true;
            const nowVisible=isOpenDialog(dialog);
            if(nowVisible&&!wasVisible){
                const opener=clickedTrigger&&isOpenDialog(clickedTrigger)&&!dialog.contains(clickedTrigger)
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
