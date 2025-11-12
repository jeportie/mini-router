// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   render.js                                          :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/24 01:31:52 by jeportie          #+#    #+#             //
//   Updated: 2025/11/11 13:11:12 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

import { normalize, ensureComponent, runGuards } from "./routing.js";
import { matchPathname } from "./matching/matchPathname.js";
import { buildContext } from "./context/buildContext.js";
import { domCommit } from "./pipelines/domCommit.js";

/**
 * Resolve the route match for the current pathname.
 */
function resolveMatch(routes, notFound) {
    const pathname = normalize(window.location.pathname);
    const match = matchPathname(pathname, routes);

    return {
        pathname,
        route: match?.route || notFound,
        params: match?.params || {},
    };
}

/**
 * Handle 404 cases gracefully.
 */
function handleNotFound(route, mountEl, state) {
    if (route)
        return false;

    mountEl.innerHTML = "<h1>Not Found</h1>";
    state.busy = false;
    return true;
}

/**
 * Execute navigation guards for parent chain and leaf route.
 */
async function applyGuards({ parents, route, ctx, rid, state, navigate, logger }) {
    logger.debug?.("Running guards for route:", route.fullPath);

    const res = await runGuards(parents, route, ctx);

    if (rid !== state.renderId) {
        state.busy = false;
        return "stale";
    }

    if (res?.action === "block") {
        state.busy = false;
        logger.warn?.("Navigation blocked by guard");
        return "blocked";
    }

    if (res?.action === "redirect") {
        logger.info?.("Redirecting due to guard →", res.to);
        await navigate(res.to, { replace: true, force: true });
        state.busy = false;
        return "redirected";
    }

    return "continue";
}

/**
 * Clean up the current view and layouts before rendering a new route.
 */
function teardownCurrent(state, nextLayoutCtor, logger) {
    logger.debug?.("Tearing down current view and layouts...");

    state.currentView?.destroy?.();

    if (state.currentView)
        state.currentView.layout = null;

    state.currentView = null;

    const last = state.currentLayouts[state.currentLayouts.length - 1];

    const reuse =
        last &&
        nextLayoutCtor &&
        last.constructor === nextLayoutCtor;

    for (let i = 0; i < state.currentLayouts.length; i++) {
        const layout = state.currentLayouts[i];

        if (!reuse || i < state.currentLayouts.length - 1)
            layout?.destroy?.();
    }

    if (!reuse)
        state.currentLayouts = [];
}

/**
 * Ensure all required layouts are instantiated for this route.
 */
async function ensureLayouts(parents, ctx, rid, state, logger) {
    const layouts = [];

    for (const p of parents || []) {
        if (!p.layout)
            continue;

        const Ctor = await (
            typeof p.layout === "function" && p.layout.length === 0
                ? p.layout().then((m) => m?.default ?? m)
                : p.layout
        );

        if (rid !== state.renderId)
            return { stale: true, layouts: [] };

        layouts.push(new Ctor(ctx, logger.withPrefix("[Layout]")));
    }

    return { stale: false, layouts };
}

/**
 * Ensure the leaf (final view) component is instantiated.
 */
async function ensureLeaf(route, ctx, rid, state, logger) {
    const loader = route.component || route.view;

    const Ctor = await (
        typeof loader === "function" && loader.length === 0
            ? loader().then((m) => m?.default ?? m)
            : loader
    );

    if (rid !== state.renderId)
        return { stale: true, leaf: null };

    return { stale: false, leaf: new Ctor(ctx, logger.withPrefix("[View]")) };
}

/**
 * Main rendering orchestrator (no animation logic here).
 */
export async function renderPipeline(env, rid) {
    const {
        routes,
        notFound,
        mountEl,
        state,
        navigate,
        animationHook,
        logger = console,
    } = env;

    const log = logger.withPrefix("[Render]");
    log.info?.("Starting render pipeline...");

    const { pathname, route, params } = resolveMatch(routes, notFound);
    log.debug?.("Resolved route:", pathname);

    if (handleNotFound(route, mountEl, state))
        return;

    const maybeLayout = route.parents?.at(-1)?.layout ?? null;
    const nextLayoutCtor = maybeLayout ? await ensureComponent(maybeLayout) : null;
    const ctx = buildContext(pathname, params);
    log.debug?.("Built route context:", ctx);

    const guardStatus = await applyGuards({
        parents: route.parents || [],
        route,
        ctx,
        rid,
        state,
        navigate,
        logger: log,
    });

    if (guardStatus !== "continue") {
        log.warn?.("Guard result:", guardStatus);
        return;
    }

    // ── Determine which animation hook to use ────────────────────────────────
    const parentWithHook = (route.parents || [])
        .slice()
        .reverse()
        .find((p) => p.animationHook);

    const activeHook =
        route.animationHook ||
        parentWithHook?.animationHook ||
        animationHook;

    // ── Define rendering helpers ─────────────────────────────────────────────
    const helpers = {
        isStale: () => rid !== state.renderId,

        teardown: () => teardownCurrent(state, nextLayoutCtor, log),

        teardownLeaf: () => {
            state.currentView?.destroy?.();

            if (state.currentView)
                state.currentView.layout = null;

            state.currentView = null;
        },

        sameLayout: () => {
            const last =
                state.currentLayouts?.[state.currentLayouts.length - 1] ?? null;

            return !!(
                last &&
                nextLayoutCtor &&
                last.constructor === nextLayoutCtor
            );
        },

        commit: async ({ targetEl, leafOnly } = {}) => {
            log.debug?.("Committing DOM changes...");

            const { stale: s1, layouts } = leafOnly
                ? { stale: false, layouts: [] }
                : await ensureLayouts(route.parents, ctx, rid, state, log);

            if (s1 || helpers.isStale())
                return;

            const { stale: s2, leaf } = await ensureLeaf(
                route,
                ctx,
                rid,
                state,
                log
            );

            if (s2 || helpers.isStale())
                return;

            const committed = await domCommit({
                mountEl,
                targetEl,
                layouts,
                leaf,
                rid,
                state,
                leafOnly,
            });

            if (helpers.isStale())
                return;

            if (!leafOnly)
                state.currentLayouts = committed.layoutInstances;

            state.currentView = committed.viewInstance;

            log.info?.(
                "Mounted view:",
                committed.viewInstance?.constructor?.name
            );
        },
    };

    // ── Execute animation hook ───────────────────────────────────────────────
    try {
        log.debug?.("Executing active animation hook...");
        await activeHook.mount({ mountEl, ctx, helpers });
    } finally {
        state.busy = false;
        log.debug?.("Render pipeline complete.");
    }
}
