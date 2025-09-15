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
        await navigate(res.to, { replace: true, force: true });
        state.busy = false;
        return "redirected";
    }
    return "continue";
}

function teardownCurrent(state, nextLayoutCtor) {
    state.currentView?.destroy?.();
    if (state.currentView)
        state.currentView.layout = null;
    state.currentView = null;

    const last = state.currentLayouts[state.currentLayouts.length - 1];
    const reuse =
        last && nextLayoutCtor &&
        last.constructor === nextLayoutCtor;

    for (let i = 0; i < state.currentLayouts.length; i++) {
        const lay = state.currentLayouts[i];
        if (!reuse || i < state.currentLayouts.length - 1) {
            lay?.destroy?.();
        }
    }
    if (!reuse) state.currentLayouts = [];
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
    const { routes, notFound, mountEl, state, navigate, animationHook, logger = console } = env;

    const { pathname, route, params } = resolveMatch(routes, notFound);
    logger.info?.("[Render] Resolving route for:", pathname);
    if (handleNotFound(route, mountEl, state)) return;

    const maybeLayout = route.parents?.at(-1)?.layout ?? null;
    const nextLayoutCtor = maybeLayout ? await ensureComponent(maybeLayout) : null;

    const ctx = buildContext(pathname, params);

    const guardStatus = await applyGuards({
        parents: route.parents || [], route, ctx, rid, state, navigate,
    });
    if (guardStatus !== "continue") {
        logger.warn?.("[Render] Guard result:", guardStatus);
        return;
    }

    // ── choose the active hook (route → nearest parent → global)
    const parentWithHook = (route.parents || []).slice().reverse().find(p => p.animationHook);
    const activeHook = route.animationHook || parentWithHook?.animationHook || animationHook;

    const helpers = {
        isStale: () => rid !== state.renderId,
        teardown: () => teardownCurrent(state, nextLayoutCtor),
        teardownLeaf: () => {
            state.currentView?.destroy?.();
            if (state.currentView)
                state.currentView.layout = null;
            state.currentView = null;
        },
        // NEW: tells hooks whether we’re staying under the same top layout
        sameLayout: () => {
            const last = state.currentLayouts?.[state.currentLayouts.length - 1] ?? null;
            return !!(last && nextLayoutCtor && last.constructor === nextLayoutCtor);
        },
        commit: async ({ targetEl, leafOnly } = {}) => {
            const { stale: s1, layouts } = leafOnly
                ? { stale: false, layouts: [] }
                : await ensureLayouts(route.parents, ctx, rid, state);
            if (s1 || helpers.isStale()) return;
            const { stale: s2, leaf } = await ensureLeaf(route, ctx, rid, state);
            if (s2 || helpers.isStale()) return;

            const committed = await domCommit({ mountEl, targetEl, layouts, leaf, rid, state, leafOnly });
            if (helpers.isStale())
                return;
            if (!leafOnly)
                state.currentLayouts = committed.layoutInstances;
            state.currentView = committed.viewInstance;
            logger.info?.("[Render] Mounted view:", committed.viewInstance?.constructor?.name);
        }
    };

    try {
        await activeHook.mount({ mountEl, ctx, helpers });
    } finally {
        state.busy = false;
    }
}

