/**
 * Some browser extensions (Bitdefender's `bis_skin_checked` / `bis_register`, and others that tag
 * nodes with `__processed_<uuid>__`) add attributes to every element before React hydrates.
 * React then reports a hydration mismatch even though the app's HTML is correct.
 *
 * This snippet runs in <head> before hydration, strips those foreign attributes as they appear,
 * and disconnects itself shortly after the page has loaded. It never touches app attributes.
 */
export const EXTENSION_ATTRIBUTE_PATTERN = /^(bis_[a-z_]+|__processed_[0-9a-f-]+__|data-gr-ext-installed|data-new-gr-c-s-check-loaded|cz-shortcut-listen)$/i;

/** Pure helper (unit-tested): which attribute names should be removed from an element. */
export function foreignAttributes(names: string[]): string[] {
  return names.filter((n) => EXTENSION_ATTRIBUTE_PATTERN.test(n));
}

export const extensionGuardScript = `(function(){try{
var re=${EXTENSION_ATTRIBUTE_PATTERN.toString()};
function clean(el){if(!el||!el.attributes)return;for(var i=el.attributes.length-1;i>=0;i--){var n=el.attributes[i].name;if(re.test(n))el.removeAttribute(n);}}
function sweep(root){clean(root);var all=root.getElementsByTagName?root.getElementsByTagName('*'):[];for(var i=0;i<all.length;i++)clean(all[i]);}
var mo=new MutationObserver(function(list){for(var i=0;i<list.length;i++){var m=list[i];
if(m.type==='attributes'){if(re.test(m.attributeName))m.target.removeAttribute(m.attributeName);}
else{for(var j=0;j<m.addedNodes.length;j++){var n=m.addedNodes[j];if(n.nodeType===1)sweep(n);}}}});
mo.observe(document.documentElement,{subtree:true,childList:true,attributes:true});
sweep(document.documentElement);
function stop(){setTimeout(function(){mo.disconnect();},3000);}
if(document.readyState==='complete')stop();else window.addEventListener('load',stop,{once:true});
}catch(e){}})();`;
