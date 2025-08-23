// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   render.js                                          :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/23 17:31:26 by jeportie          #+#    #+#             //
//   Updated: 2025/08/24 00:07:00 by jeportie         ###   ########.fr       //
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
    if (st.engine || st.variant || st.tag || st.mode) return st;
    return null;
}

// helpers to extract variant/mode from raw specs
function getVariantFromSpec(spec) {
    if (!spec || typeof spec !== "object") return undefined;
    if (typeof spec.variant === "string") return spec.variant;
    if (spec.trans && typeof spec.trans.variant === "string") return spec.trans.variant;
    return undefined;
}
function getModeFromSpec(spec) {
    if (!spec || typeof spec !== "object") return undefined;
    const v = spec.mode ?? (spec.trans && spec.trans.mode);
    if (v === "container" || v === "overlap" || v === "auto") return v;
    return undefined;
}

async function runPhase(engine, el, phase, ctx, rid, state) {
    await Promise.resolve(engine.run(el, phase, ctx));
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
 *   routerDefaultSpec:any,                  // RAW transition spec from Router options
 *   routerDefaultMode:"container"|"overlap"|"auto",
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

    // Resolve variant + mode (per-nav > per-route > router default)
    const navSpec = navStateEngineSpec();
    const variant =
        getVariantFromSpec(navSpec) ??
        getVariantFromSpec(route?.transition) ??
        getVariantFromSpec(env.routerDefaultSpec) ??
        "fade";

    let mode =
        getModeFromSpec(navSpec) ??
        getModeFromSpec(route?.transition) ??
        (typeof env.routerDefaultSpec === "object" ? getModeFromSpec(env.routerDefaultSpec) : undefined) ??
        env.routerDefaultMode ?? "auto";

    if (mode === "auto") {
        mode = (variant === "slide") ? "overlap" : "container";
    }
    const useOverlap = (mode === "overlap");

    const guardStatus = await applyGuards({
        parents: route.parents || [],
        route,
        ctx,
        rid,
        state,
        navigate: env.navigate,
    });
    if (guardStatus !== "continue") return;

    if (!useOverlap) {
        // ---------- CONTAINER MODE (fade/zoom/default) ----------
        if (mountEl.childElementCount > 0) {
            if (!(await runPhase(effectiveEngine, mountEl, "out", ctx, rid, state))) return;
        }
        teardownCurrent(state);
        const { stale: staleLayouts, layouts } = await instantiateLayouts(route.parents, ctx, rid, state);
        if (staleLayouts) { state.busy = false; return; }
        const { stale: staleLeaf, leaf } = await instantiateLeaf(route, ctx, rid, state);
        if (staleLeaf) { state.busy = false; return; }
        const committed = await domCommit({ mountEl, layouts, leaf, rid, state });
        if (rid !== state.renderId) { state.busy = false; return; }
        state.currentLayouts = committed.layoutInstances;
        state.currentView = committed.viewInstance;
        if (!(await runPhase(effectiveEngine, mountEl, "in", ctx, rid, state))) return;
        state.busy = false;
        return;
    }

    // ---------- OVERLAP MODE (two .view-slot layers) ----------
    // Ensure container can hold absolutely positioned children
    if (getComputedStyle(mountEl).position === "static") {
        mountEl.style.position = "relative";
    }

    // Wrap existing content (if any) into .view-slot as "old"
    let oldSlot = mountEl.querySelector(".view-slot");
    if (!oldSlot && mountEl.childElementCount > 0) {
        const wrap = document.createElement("div");
        wrap.className = "view-slot route-leave";
        wrap.style.position = "absolute";
        wrap.style.inset = "0";
        wrap.innerHTML = mountEl.innerHTML;
        mountEl.innerHTML = "";
        mountEl.appendChild(wrap);
        oldSlot = wrap;
    }

    // Create the "new" slot
    const newSlot = document.createElement("div");
    newSlot.className = "view-slot route-enter";
    newSlot.style.position = "absolute";
    newSlot.style.inset = "0";
    mountEl.appendChild(newSlot);

    // Teardown previous instances BEFORE mounting the new ones
    teardownCurrent(state);

    // Instantiate + commit into the NEW SLOT
    const { stale: staleLayouts2, layouts: layouts2 } = await instantiateLayouts(route.parents, ctx, rid, state);
    if (staleLayouts2) { newSlot.remove(); state.busy = false; return; }
    const { stale: staleLeaf2, leaf: leaf2 } = await instantiateLeaf(route, ctx, rid, state);
    if (staleLeaf2) { newSlot.remove(); state.busy = false; return; }

    // IMPORTANT: domCommit should accept { targetEl } and default to mountEl if missing
    const committed2 = await domCommit({ mountEl, targetEl: newSlot, layouts: layouts2, leaf: leaf2, rid, state });
    if (rid !== state.renderId) { newSlot.remove(); state.busy = false; return; }
    state.currentLayouts = committed2.layoutInstances;
    state.currentView = committed2.viewInstance;

    // Animate both slots concurrently
    const tasks = [];
    tasks.push(Promise.resolve(effectiveEngine.run(newSlot, "in", ctx)));
    if (oldSlot) tasks.push(Promise.resolve(effectiveEngine.run(oldSlot, "out", ctx)));
    await Promise.all(tasks);
    if (rid !== state.renderId) { newSlot.remove(); state.busy = false; return; }

    // Cleanup old
    oldSlot?.remove();

    // Finalize
    state.busy = false;
}

