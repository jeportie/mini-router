// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   render.js                                          :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/23 17:31:26 by jeportie          #+#    #+#             //
//   Updated: 2025/08/23 17:45:32 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

import { normalize } from "./routerTools.js";
import { ensureComponent, runGuards } from "./routerInternals.js";
import { matchPathname } from "./matching/matchPathname.js";
import { buildContext } from "./context/buildContext.js";

/**
 * @param {object} env
 * @param {number} rid
 */
export async function renderPipeline(env, rid) {
    const { routes, notFound, mountEl, transition, state } = env;

    const pathname = normalize(window.location.pathname);
    const m = matchPathname(pathname, routes);
    const route = m?.route || notFound;
    const params = m?.params || {};

    if (!route) {
        mountEl.innerHTML = "<h1>Not Found</h1>";
        state.busy = false;
        return;
    }

    const ctx = buildContext(pathname, params);

    const parents = route.parents || [];
    const guardRes = await runGuards(parents, route, ctx);
    if (rid !== state.renderId) return;
    if (guardRes.action === "block") return;
    if (guardRes.action === "redirect") {
        await env.navigate(guardRes.to, { replace: true });
        state.busy = false;
        return;
    }

    if (transition && mountEl.childElementCount > 0) {
        await Promise.resolve(transition(mountEl, "out"));
        if (rid !== state.renderId) return;
    }

    state.currentView?.destroy?.();
    state.currentView = null;
    for (const lay of state.currentLayouts) lay?.destroy?.();
    state.currentLayouts = [];

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

    mountEl.innerHTML = html;

    state.currentLayouts = layoutInsts;
    for (const inst of state.currentLayouts) inst.mount?.();
    state.currentView = leaf;
    leaf.mount?.();

    if (transition) {
        await Promise.resolve(transition(mountEl, "in"));
        if (rid !== state.renderId) return;
    }

    state.busy = false;
}
