// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   render.js                                          :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/23 17:31:26 by jeportie          #+#    #+#             //
//   Updated: 2025/08/23 17:32:59 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

import { normalize, parseQuery } from "../routerTools.js";
import { ensureComponent, runGuards } from "../routerInternals.js";

/**
 * @param {{
 *   routes: any[],
 *   notFound: any,
 *   mountEl: HTMLElement,
 *   transition?: (el:HTMLElement, phase:"out"|"in")=>void|Promise<void>,
 *   state: {
 *     renderId: number,
 *     busy: boolean,
 *     currentView: any,
 *     currentLayouts: any[],
 *   },
 *   navigate: (to:string, opts?:{replace?:boolean, state?:any})=>Promise<void>,
 * }} env
 * @param {number} rid
 */
export async function renderPipeline(env, rid) {
    const { routes, notFound, mountEl, transition, state } = env;

    // match (inline for step 1, we’ll extract in step 2)
    const pathname = normalize(window.location.pathname);
    let match = null;
    for (const r of routes) {
        const m = pathname.match(r.regex);
        if (!m) continue;
        const values = m.slice(1);
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(values[i] ?? ""); });
        match = { route: r, params };
        break;
    }

    const route = match?.route || notFound;
    const params = match?.params || {};

    if (!route) {
        mountEl.innerHTML = "<h1>Not Found</h1>";
        state.busy = false;
        return;
    }

    // build context (inline for step 1)
    const ctx = {
        path: pathname,
        params,
        query: parseQuery(window.location.search),
        hash: (window.location.hash || "").replace(/^#/, ""),
        state: history.state,
    };

    // guards
    const parents = route.parents || [];
    const guardRes = await runGuards(parents, route, ctx);
    if (rid !== state.renderId) return;
    if (guardRes.action === "block") return;
    if (guardRes.action === "redirect") {
        await env.navigate(guardRes.to, { replace: true });
        state.busy = false;
        return;
    }

    // OUT phase (only if something already rendered)
    if (transition && mountEl.childElementCount > 0) {
        await Promise.resolve(transition(mountEl, "out"));
        if (rid !== state.renderId) return;
    }

    // tear down old
    state.currentView?.destroy?.();
    state.currentView = null;
    for (const lay of state.currentLayouts) lay?.destroy?.();
    state.currentLayouts = [];

    // load layouts & leaf
    /** @type {any[]} */
    const layoutInsts = [];
    for (const p of parents) {
        if (!p.layout) continue;
        const LayoutCtor = await ensureComponent(p.layout);
        if (rid !== state.renderId) return;
        layoutInsts.push(new LayoutCtor(ctx));
    }

    const LeafCtor = await ensureComponent(route.component || route.view);
    if (rid !== state.renderId) return;

    const leaf = new LeafCtor(ctx);
    let html = await leaf.getHTML();
    if (rid !== state.renderId) return;
    html = typeof html === "string" ? html : String(html);

    // compose layouts (inner → outer)
    for (let i = layoutInsts.length - 1; i >= 0; i--) {
        const inst = layoutInsts[i];
        let shell = await inst.getHTML();
        if (rid !== state.renderId) return;
        shell = typeof shell === "string" ? shell : String(shell);
        if (!shell.includes("<!-- router-slot -->")) {
            throw new Error("Layout missing <!-- router-slot -->");
        }
        html = shell.replace("<!-- router-slot -->", html);
    }

    // swap content
    mountEl.innerHTML = html;

    // mount hooks
    state.currentLayouts = layoutInsts;
    for (const inst of state.currentLayouts) inst.mount?.();
    state.currentView = leaf;
    leaf.mount?.();

    // IN phase
    if (transition) {
        await Promise.resolve(transition(mountEl, "in"));
        if (rid !== state.renderId) return;
    }

    state.busy = false;
}
