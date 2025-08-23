// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   render.js                                          :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/23 17:31:26 by jeportie          #+#    #+#             //
//   Updated: 2025/08/24 01:25:00 by jeportie         ###   ########.fr       //
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

/** ------------------------ Mode/Variant resolution ------------------------ */

function decideVariantMode(effectiveEngine, route, env) {
    const navSpec = navStateEngineSpec();
    const engineDefaultVariant = effectiveEngine?.variant;

    const variant =
        getVariantFromSpec(navSpec) ??
        getVariantFromSpec(route?.transition) ??
        getVariantFromSpec(env.routerDefaultSpec) ??
        engineDefaultVariant ??
        "fade";

    let mode =
        getModeFromSpec(navSpec) ??
        getModeFromSpec(route?.transition) ??
        (typeof env.routerDefaultSpec === "object" ? getModeFromSpec(env.routerDefaultSpec) : undefined) ??
        env.routerDefaultMode ??
        "auto";

    if (mode === "auto") {
        mode = (variant === "slide") ? "overlap" : "container";
    }
    return { variant, mode, useOverlap: mode === "overlap", isSlide: variant === "slide" };
}

/** ------------------------ Orchestrator branches ------------------------- */

async function runContainerMode({ env, ctx, rid, effectiveEngine, route }) {
    const { mountEl, state } = env;

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
}

async function runOverlapStackMode({ env, ctx, rid, effectiveEngine, route }) {
    // Two stacked absolute slots (fade/crossfade/etc.)
    const { mountEl, state } = env;

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

    teardownCurrent(state);

    const { stale: staleLayouts2, layouts: layouts2 } = await instantiateLayouts(route.parents, ctx, rid, state);
    if (staleLayouts2) { newSlot.remove(); state.busy = false; return; }
    const { stale: staleLeaf2, leaf: leaf2 } = await instantiateLeaf(route, ctx, rid, state);
    if (staleLeaf2) { newSlot.remove(); state.busy = false; return; }

    const committed2 = await domCommit({ mountEl, targetEl: newSlot, layouts: layouts2, leaf: leaf2, rid, state });
    if (rid !== state.renderId) { newSlot.remove(); state.busy = false; return; }

    state.currentLayouts = committed2.layoutInstances;
    state.currentView = committed2.viewInstance;

    const tasks = [];
    tasks.push(Promise.resolve(effectiveEngine.run(newSlot, "in", ctx)));
    if (oldSlot) tasks.push(Promise.resolve(effectiveEngine.run(oldSlot, "out", ctx)));
    await Promise.all(tasks);
    if (rid !== state.renderId) { newSlot.remove(); state.busy = false; return; }

    // Cleanup old
    oldSlot?.remove();

    state.busy = false;
}

async function runSlideTrackPushMode({ env, ctx, rid, effectiveEngine, route }) {
    // True push: new view enters from right, pushes old view right; no overlap.
    const { mountEl, state } = env;

    if (getComputedStyle(mountEl).position === "static") {
        mountEl.style.position = "relative";
    }

    const hadContent = mountEl.childElementCount > 0;

    // If first render, just mount new content with no animation
    if (!hadContent) {
        teardownCurrent(state);
        const { stale: staleLayouts, layouts } = await instantiateLayouts(route.parents, ctx, rid, state);
        if (staleLayouts) { state.busy = false; return; }
        const { stale: staleLeaf, leaf } = await instantiateLeaf(route, ctx, rid, state);
        if (staleLeaf) { state.busy = false; return; }
        const committed = await domCommit({ mountEl, layouts, leaf, rid, state });
        if (rid !== state.renderId) { state.busy = false; return; }
        state.currentLayouts = committed.layoutInstances;
        state.currentView = committed.viewInstance;
        state.busy = false;
        return;
    }

    // Prepare side-by-side slots inside a track
    const oldSlot = document.createElement("div");
    oldSlot.className = "view-slot";
    oldSlot.innerHTML = mountEl.innerHTML;

    const newSlot = document.createElement("div");
    newSlot.className = "view-slot";

    const track = document.createElement("div");
    track.className = "view-track route-enter";
    // Clear and insert track with both slots
    mountEl.innerHTML = "";
    track.appendChild(oldSlot);
    track.appendChild(newSlot);
    mountEl.appendChild(track);

    // Teardown previous instances BEFORE mounting the new ones
    teardownCurrent(state);

    const { stale: staleLayouts2, layouts: layouts2 } = await instantiateLayouts(route.parents, ctx, rid, state);
    if (staleLayouts2) { mountEl.innerHTML = ""; state.busy = false; return; }
    const { stale: staleLeaf2, leaf: leaf2 } = await instantiateLeaf(route, ctx, rid, state);
    if (staleLeaf2) { mountEl.innerHTML = ""; state.busy = false; return; }

    // Inject new page into the right slot
    const committed2 = await domCommit({ mountEl, targetEl: newSlot, layouts: layouts2, leaf: leaf2, rid, state });
    if (rid !== state.renderId) { mountEl.innerHTML = ""; state.busy = false; return; }
    state.currentLayouts = committed2.layoutInstances;
    state.currentView = committed2.viewInstance;

    // Animate the TRACK (engine toggles classes; CSS slides track from 0% to -50%)
    await Promise.resolve(effectiveEngine.run(track, "in", ctx));
    if (rid !== state.renderId) { state.busy = false; return; }

    // Unwrap: move new content out of the track back into mountEl, drop track
    const frag = document.createDocumentFragment();
    while (newSlot.firstChild) frag.appendChild(newSlot.firstChild);
    mountEl.innerHTML = "";
    mountEl.appendChild(frag);

    state.busy = false;
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

    const { variant, mode, useOverlap, isSlide } = decideVariantMode(effectiveEngine, route, env);

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
        await runContainerMode({ env, ctx, rid, effectiveEngine, route });
        return;
    }

    if (isSlide) {
        await runSlideTrackPushMode({ env, ctx, rid, effectiveEngine, route });
        return;
    }

    await runOverlapStackMode({ env, ctx, rid, effectiveEngine, route });
}
