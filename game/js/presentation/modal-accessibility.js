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
export function createBackgroundInert(root,{inert=true,ariaHidden=true}={}){
    let applyInert=inert;
    let applyAriaHidden=ariaHidden;
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
            // The full-viewport overlay blocks pointer input and the focus trap
            // keeps Tab inside the dialog. Whole-shell inert recalculates style
            // for every HUD descendant (measured at 60-125 ms on a mature
            // realm), so the game opts out while the reusable manager keeps the
            // strict behavior for other hosts.
            if(applyInert)element.setAttribute("inert","");
            if(applyAriaHidden)element.setAttribute("aria-hidden","true");
            else if(element.hasAttribute("aria-hidden"))element.removeAttribute("aria-hidden");
        }
        return targets;
    }
    return {sync,setInert(value){applyInert=Boolean(value);},setAriaHidden(value){applyAriaHidden=Boolean(value);},collect:dialog=>collectBackgroundTargets(dialog,root)};
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
    // aria-modal="true" already tells assistive technology that the covered
    // game is unavailable. Hiding the whole shell with inert/aria-hidden costs
    // a full style and accessibility-tree recalculation (60-125 ms on a mature
    // realm), so this host relies on the modal contract and the Tab focus trap.
    background.setInert(false);
    background.setAriaHidden(false);
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
        // Focusing a control in a freshly revealed panel forces Chromium to
        // settle the whole ledger's style and scroll geometry on the click
        // task (measured at 60-122 ms on the mature realm). Focus the dialog
        // container itself unless the author explicitly asked for a field;
        // the Tab trap still reaches every control and screen readers announce
        // the dialog title. This keeps the open path free of layout work.
        const target=dialog.querySelector("[autofocus]")||dialog;
        if(target===dialog&&!dialog.hasAttribute("tabindex"))dialog.setAttribute("tabindex","-1");
        target.focus({preventScroll:true});
    }

    function fallbackFocus(){
        const main=document.getElementById("main-container")||document.body;
        if(main===document.body&&!main.hasAttribute("tabindex"))main.setAttribute("tabindex","-1");
        // The game shell is always focusable; use the same non-measuring focus
        // path as the dialog so closing never charges a layout to the task.
        main.focus({preventScroll:true});
    }

    function openDialog(dialog,opener){
        const existing=stack.findIndex(entry=>entry.dialog===dialog);
        if(existing>=0)stack.splice(existing,1);
        stack.push({dialog,opener:opener||null});
        updateModalState();
        // Do not move focus on the click task. The panel has just replaced its
        // contents and Chromium would have to settle the new ledger's style and
        // scroll geometry before focus can land, which measured 60-120 ms on a
        // mature realm. Wait for the first frame so that work is paid by the
        // incremental renderer; focus itself then has a clean layout to enter.
        // Two frames: the first lets the panel's deferred first paint and the
        // fixed dialog settle; focusing on that same frame still forced a
        // whole-document layout into the hydration task.
        requestAnimationFrame(()=>requestAnimationFrame(()=>{if(topDialog()===dialog)focusInside(dialog);}));
    }

    function closeDialog(dialog){
        const index=stack.findIndex(entry=>entry.dialog===dialog);
        if(index<0)return;
        const wasTop=index===stack.length-1;
        const [entry]=stack.splice(index,1);
        updateModalState();
        if(!wasTop)return;
        const next=topDialog();
        if(next){requestAnimationFrame(()=>{if(topDialog()===next)focusInside(next);});return;}
        // Restore focus after the page has settled. Focusing the opener while
        // the just-hidden dialog still owns pending layout forced a full-page
        // reflow. The opener is a connected, non-hidden control, so the next
        // frame can take focus without scrolling or revealing anything.
        requestAnimationFrame(()=>{
            if(topDialog())return;
            if(entry.opener?.isConnected&&!entry.opener.closest(".hidden")){entry.opener.focus({preventScroll:true});return;}
            fallbackFocus();
        });
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
