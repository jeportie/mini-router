// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   render.js                                          :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/23 17:31:26 by jeportie          #+#    #+#             //
//   Updated: 2025/08/23 18:54:34 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

import { normalize, ensureComponent, runGuards } from "./routing.js";
import { matchPathname } from "./matching/matchPathname.js";
import { buildContext } from "./context/buildContext.js";
import { domCommit } from "./pipelines/domCommit.js";

/** ------------------------ Phase helpers ----------------- */

/** Resolve the route (or notFound) and params from current location */
function resolveMatch(routes, notFound) {
    const pathname = normalize(window.location.pathname);
    const m = matchPathname(pathname, routes);
    return {
        pathname,
        route: m?.route || notFound,
        params: m?.params || {},
    };
}

/** Early 404 handling */
function handleNotFound(route, mountEl, state) {
    if (route) return false;
    mountEl.innerHTML = "<h1>Not Found</h1>";
    state.busy = false;
    return true;
}

/** Guards runner + redirect/block handling */
async function applyGuards({ parents, route, ctx, rid, state, navigate }) {
    const res = await runGuards(parents, route, ctx);
    if (rid !== state.renderId) return "stale";
    if (res.action === "block") return "blocked";
    if (res.action === "redirect") {
        await navigate(res.to, { replace: true });
        state.busy = false;
        return "redirected";
    }
    return "continue";
}

/** OUT transition only if something was already rendered */
async function transitionOutIfNeeded(transition, mountEl, rid, state) {
    if (!transition) return true;
    if (mountEl.childElementCount === 0) return true;
    await Promise.resolve(transition(mountEl, "out"));
    return rid === state.renderId;
}

/** Destroy previously mounted view + layouts */
function teardownCurrent(state) {
    state.currentView?.destroy?.();
    state.currentView = null;
    for (const lay of state.currentLayouts) lay?.destroy?.();
    state.currentLayouts = [];
}

/** Build layout instances (outer order in the returned array) */
async function instantiateLayouts(parents, ctx, rid, state) {
    const layoutInsts = [];
    for (const p of parents || []) {
        if (!p.layout) continue;
        const LayoutCtor = await ensureComponent(p.layout);
        if (rid !== state.renderId) return { stale: true, layouts: [] };
        layoutInsts.push(new LayoutCtor(ctx));
    }
    return { stale: false, layouts: layoutInsts };
}

/** Build view (leaf) instance */
async function instantiateLeaf(route, ctx, rid, state) {
    const LeafCtor = await ensureComponent(route.component || route.view);
    if (rid !== state.renderId) return { stale: true, leaf: null };
    return { stale: false, leaf: new LeafCtor(ctx) };
}

/** IN transition */
async function transitionInIfAny(transition, mountEl, rid, state) {
    if (!transition) return true;
    await Promise.resolve(transition(mountEl, "in"));
    return rid === state.renderId;
}

/** ---------------------------- Orchestrator ------------------------------- */
/**
 * @param {{
 *   routes:any[],
 *   notFound:any,
 *   mountEl:HTMLElement,
 *   transition?: (el:HTMLElement, phase:"out"|"in")=>void|Promise<void>,
 *   state:{ renderId:number, busy:boolean, currentView:any, currentLayouts:any[] },
 *   navigate:(to:string, opts?:{replace?:boolean, state?:any})=>Promise<void>,
 * }} env
 * @param {number} rid
 */
export async function renderPipeline(env, rid) {
    const { routes, notFound, mountEl, transition, state } = env;
    const { pathname, route, params } = resolveMatch(routes, notFound);
    if (handleNotFound(route, mountEl, state)) return;
    const ctx = buildContext(pathname, params);
    const guardStatus = await applyGuards({
        parents: route.parents || [],
        route,
        ctx,
        rid,
        state,
        navigate: env.navigate,
    });
    if (guardStatus !== "continue") return;
    if (!(await transitionOutIfNeeded(transition, mountEl, rid, state))) return;
    teardownCurrent(state);
    const { stale: staleLayouts, layouts } = await instantiateLayouts(route.parents, ctx, rid, state);
    if (staleLayouts) return;
    const { stale: staleLeaf, leaf } = await instantiateLeaf(route, ctx, rid, state);
    if (staleLeaf) return;
    const committed = await domCommit({ mountEl, layouts, leaf, rid, state });
    if (rid !== state.renderId) return;
    state.currentLayouts = committed.layoutInstances;
    state.currentView = committed.viewInstance;
    if (!(await transitionInIfAny(transition, mountEl, rid, state))) return;
    state.busy = false;
}
