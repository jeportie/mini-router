// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   domCommit.js                                       :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/23 18:37:54 by jeportie          #+#    #+#             //
//   Updated: 2025/08/23 18:45:29 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

/**
 * Compose layouts + leaf HTML, swap into DOM, then run mount hooks.
 * Keeps tiny race-safety checks using renderId/state.
 *
 * @param {{
 *   mountEl: HTMLElement,
 *   layouts: any[],          // array of layout instances (outermost last)
 *   leaf: any,               // view instance
 *   rid: number,             // render id captured by caller
 *   state: { renderId: number }
 * }} deps
 * @returns {Promise<{ viewInstance:any, layoutInstances:any[] }>}
 */
export async function domCommit({ mountEl, targetEl, layouts, leaf, rid, state, leafOnly }) {
    const host = targetEl || mountEl;

    // Start with leaf view HTML
    let html = await leaf.getHTML();
    if (rid !== state.renderId) return { viewInstance: null, layoutInstances: [] };
    html = typeof html === "string" ? html : String(html);

    // Wrap through layouts (inner → outer)
    if (!leafOnly) {
        for (let i = layouts.length - 1; i >= 0; i--) {
            const inst = layouts[i];
            let shell = await inst.getHTML();
            if (rid !== state.renderId) return { viewInstance: null, layoutInstances: [] };
            shell = typeof shell === "string" ? shell : String(shell);
            if (!shell.includes("<!-- router-slot -->")) {
                throw new Error("Layout missing <!-- router-slot -->");
            }
            html = shell.replace("<!-- router-slot -->", html);
        }
    }

    // Commit to DOM
    if (targetEl) {
        targetEl.innerHTML = html;
    } else {
        host.innerHTML = html;
    }

    // Mount hooks
    if (!leafOnly)
        for (const inst of layouts) inst.mount?.();
    if (!leafOnly)
        leaf.layout = layouts[layouts.length - 1] ?? null;
    else
        leaf.layout = (state.currentLayouts?.[state.currentLayouts.length - 1]) ?? null;
    leaf.mount?.();

    return {
        layoutInstances: layouts,
        viewInstance: leaf,
    };
}
