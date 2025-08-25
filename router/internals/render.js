// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   render.js                                          :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/24 01:31:52 by jeportie          #+#    #+#             //
//   Updated: 2025/08/24 01:35:58 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

import { normalize, ensureComponent, runGuards } from "./routing.js";
import { matchPathname } from "./matching/matchPathname.js";
import { buildContext } from "./context/buildContext.js";
import { domCommit } from "./pipelines/domCommit.js";

function resolveMatch(routes, notFound) {
    const pathname = normalize(window.location.pathname);
    const m = matchPathname(pathname, routes);
    return { pathname, route: m?.route || notFound, params: m?.params || {} };
}

function handleNotFound(route, mountEl, state) {
    if (route) return false;
    mountEl.innerHTML = "<h1>Not Found</h1>";
    state.busy = false;
    return true;
}

async function applyGuards({ parents, route, ctx, rid, state, navigate }) {
    const res = await runGuards(parents, route, ctx);
    if (rid !== state.renderId) { state.busy = false; return "stale"; }
    if (res?.action === "block") { state.busy = false; return "blocked"; }
    if (res?.action === "redirect") {
        await navigate(res.to, { replace: true }); state.busy = false; return "redirected";
    }
    return "continue";
}

function teardownCurrent(state) {
    state.currentView?.destroy?.();
    if (state.currentView)
        state.currentView.layout = null;
    state.currentView = null;

    for (const lay of state.currentLayouts) lay?.destroy?.();
    state.currentLayouts = [];
}

async function ensureLayouts(parents, ctx, rid, state) {
    const out = [];
    for (const p of parents || []) {
        if (!p.layout) continue;
        const Ctor = await (typeof p.layout === "function" && p.layout.length === 0
            ? p.layout().then(m => m?.default ?? m) : p.layout);
        if (rid !== state.renderId) return { stale: true, layouts: [] };
        out.push(new Ctor(ctx));
    }
    return { stale: false, layouts: out };
}

async function ensureLeaf(route, ctx, rid, state) {
    const loader = route.component || route.view;
    const Ctor = await (typeof loader === "function" && loader.length === 0
        ? loader().then(m => m?.default ?? m) : loader);
    if (rid !== state.renderId) return { stale: true, leaf: null };
    return { stale: false, leaf: new Ctor(ctx) };
}

/**
 * Orchestrator: no animation logic here.
 */
export async function renderPipeline(env, rid) {
    const { routes, notFound, mountEl, state, navigate, animationHook } = env;

    const { pathname, route, params } = resolveMatch(routes, notFound);
    if (handleNotFound(route, mountEl, state)) return;

    const ctx = buildContext(pathname, params);

    const guardStatus = await applyGuards({
        parents: route.parents || [], route, ctx, rid, state, navigate,
    });
    if (guardStatus !== "continue") return;

    const helpers = {
        isStale: () => rid !== state.renderId,
        teardown: () => teardownCurrent(state),
        commit: async (targetEl) => {
            const { stale: s1, layouts } = await ensureLayouts(route.parents, ctx, rid, state);
            if (s1 || helpers.isStale()) return;
            const { stale: s2, leaf } = await ensureLeaf(route, ctx, rid, state);
            if (s2 || helpers.isStale()) return;

            const committed = await domCommit({ mountEl, targetEl, layouts, leaf, rid, state });
            if (helpers.isStale()) return;

            state.currentLayouts = committed.layoutInstances;
            state.currentView = committed.viewInstance;
        }
    };

    try {
        await animationHook.mount({ mountEl, ctx, helpers });
    } finally {
        state.busy = false;
    }
}

