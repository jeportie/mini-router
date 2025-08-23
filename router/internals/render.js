// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   render.js                                          :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/23 17:31:26 by jeportie          #+#    #+#             //
//   Updated: 2025/08/23 23:18:52 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

import { normalize, ensureComponent, runGuards } from "./routing.js";
import { matchPathname } from "./matching/matchPathname.js";
import { buildContext } from "./context/buildContext.js";
import { domCommit } from "./pipelines/domCommit.js";
import { pickEngine } from "../transitions/index.js";

/** ------------------------ Phase helpers ----------------- */

function resolveMatch(routes, notFound) {
    const pathname = normalize(window.location.pathname);
    const m = matchPathname(pathname, routes);
    return {
        pathname,
        route: m?.route || notFound,
        params: m?.params || {},
    };
}

function handleNotFound(route, mountEl, state) {
    if (route) return false;
    mountEl.innerHTML = "<h1>Not Found</h1>";
    state.busy = false;
    return true;
}

async function applyGuards({ parents, route, ctx, rid, state, navigate }) {
    const res = await runGuards(parents, route, ctx);
    if (rid !== state.renderId) {
        state.busy = false;
        return "stale";
    }
    if (res.action === "block") {
        state.busy = false;
        return "blocked";
    }
    if (res.action === "redirect") {
        await navigate(res.to, { replace: true });
        state.busy = false;
        return "redirected";
    }
    return "continue";
}

/** read per-navigation override from history.state */
function navStateEngineSpec() {
    const st = history.state;
    if (!st) return null;
    // support both { trans:{...} } and putting fields at top-level
    if (st.trans) return st.trans;
    if (st.engine || st.variant || st.tag) return st;
    return null;
}

async function runPhase(engine, mountEl, phase, ctx, rid, state) {
    await Promise.resolve(engine.run(mountEl, phase, ctx));
    return rid === state.renderId;
}

function teardownCurrent(state) {
    state.currentView?.destroy?.();
    state.currentView = null;
    for (const lay of state.currentLayouts) lay?.destroy?.();
    state.currentLayouts = [];
}

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

async function instantiateLeaf(route, ctx, rid, state) {
    const LeafCtor = await ensureComponent(route.component || route.view);
    if (rid !== state.renderId) return { stale: true, leaf: null };
    return { stale: false, leaf: new LeafCtor(ctx) };
}

/** ---------------------------- Orchestrator ------------------------------- */
/**
 * @param {{
 *   routes:any[],
 *   notFound:any,
 *   mountEl:HTMLElement,
 *   transitionEngine:any,                   // default engine (already normalized)
 *   engineRegistry: Record<string,(spec:any)=>{run:Function}>,
 *   state:{ renderId:number, busy:boolean, currentView:any, currentLayouts:any[] },
 *   navigate:(to:string, opts?:{replace?:boolean, state?:any})=>Promise<void>,
 * }} env
 * @param {number} rid
 */
export async function renderPipeline(env, rid) {
    const { routes, notFound, mountEl, transitionEngine, engineRegistry, state } = env;
    const { pathname, route, params } = resolveMatch(routes, notFound);
    if (handleNotFound(route, mountEl, state)) return;
    const ctx = buildContext(pathname, params);
    const effectiveEngine = pickEngine({
        routerDefault: transitionEngine,
        routeMeta: route?.transition,
        navStateSpec: navStateEngineSpec(),
        registry: engineRegistry,
    });
    const guardStatus = await applyGuards({
        parents: route.parents || [],
        route,
        ctx,
        rid,
        state,
        navigate: env.navigate,
    });
    if (guardStatus !== "continue") return;
    if (mountEl.childElementCount > 0) {
        if (!(await runPhase(effectiveEngine, mountEl, "out", ctx, rid, state))) return;
    }
    teardownCurrent(state);
    const { stale: staleLayouts, layouts } = await instantiateLayouts(route.parents, ctx, rid, state);
    if (staleLayouts) return;
    const { stale: staleLeaf, leaf } = await instantiateLeaf(route, ctx, rid, state);
    if (staleLeaf) return;
    const committed = await domCommit({ mountEl, layouts, leaf, rid, state });
    if (rid !== state.renderId) return;
    state.currentLayouts = committed.layoutInstances;
    state.currentView = committed.viewInstance;
    if (!(await runPhase(effectiveEngine, mountEl, "in", ctx, rid, state))) return;
    state.busy = false;
}
