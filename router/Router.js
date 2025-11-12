// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   Router.js                                          :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/21 13:55:36 by jeportie          #+#    #+#             //
//   Updated: 2025/11/11 13:29:42 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

import { pathToRegex, expandRoutes } from "./internals/routing.js";
import { renderPipeline } from "./internals/render.js";
import { createHandlers } from "./internals/events.js";
import AbstractAnimationHook from "../transitions/AbstractAnimationHook.js";

const defaultOnBeforeNavigate = (to) => !to.startsWith("/api/");

export default class Router {
    logger;

    #routes = [];
    #notFound;
    #mountEl;
    #linkSelector;
    #onBeforeNavigate;
    #started = false;
    #beforeStartHooks = [];
    #afterStartHooks = [];
    #animationHook;
    #state = {
        renderId: 0,
        busy: false,
        currentView: null,
        currentLayouts: [],
    };
    #onPopState;
    #onClick;

    constructor(opts) {
        if (!opts || !Array.isArray(opts.routes) || opts.routes.length === 0)
            throw new Error("[Router] you must provide a non-empty routes array.");

        this.logger = opts.logger?.withPrefix("[Router]") ?? console;
        const log = this.logger;

        log.info?.("Initializing with", opts.routes.length, "routes");

        // ── Expand route tree ────────────────────────────────────────────────
        const flat = expandRoutes(opts.routes, "/", [], this.logger);

        this.#routes = flat.map((r) => {
            const { regex, keys, isCatchAll } =
                pathToRegex(r.fullPath === "/*" ? "*" : r.fullPath, this.logger);

            return {
                path: r.path,
                fullPath: r.fullPath,
                regex,
                keys,
                isCatchAll,
                view: r.view,
                component: r.component,
                layout: r.layout,
                beforeEnter: r.beforeEnter,
                transition: r.transition,
                animationHook: r.animationHook,
                parents: r.parents,
            };
        });

        log.debug?.("Expanded to", this.#routes.length, "flat routes");

        // ── Resolve 404 route ────────────────────────────────────────────────
        this.#notFound =
            this.#routes.find((r) => r.isCatchAll) ||
            (opts.notFoundPath
                ? this.#routes.find(
                    (r) =>
                        r.fullPath === opts.notFoundPath ||
                        r.path === opts.notFoundPath
                )
                : undefined);

        // ── Mount target element ─────────────────────────────────────────────
        const m = document.querySelector(opts.mountSelector ?? "#app");

        if (!m)
            throw new Error("[Router] mount element not found.");

        this.#mountEl = /** @type {HTMLElement} */ m;

        // ── Navigation configuration ────────────────────────────────────────
        this.#linkSelector = opts.linkSelector ?? "[data-link]";
        this.#onBeforeNavigate =
            typeof opts.onBeforeNavigate === "function"
                ? opts.onBeforeNavigate
                : defaultOnBeforeNavigate;

        // ── Animation hook setup ─────────────────────────────────────────────
        this.#animationHook =
            opts.animationHook instanceof Object
                ? opts.animationHook
                : new AbstractAnimationHook();

        // ── Event handlers ──────────────────────────────────────────────────
        const { onPopState, onClick } = createHandlers({
            linkSelector: this.#linkSelector,
            onNavigate: (to) =>
                typeof to === "string" ? this.navigateTo(to) : this.#render(),
            logger: this.logger,
        });

        this.#onPopState = onPopState;
        this.#onClick = onClick;

        log.debug?.("Router instance ready");
    }

    /**
     * Register a hook to run before router start.
     */
    beforeStart(fn) {
        this.#beforeStartHooks.push(fn);
    }

    /**
     * Register a hook to run after router start.
     */
    afterStart(fn) {
        this.#afterStartHooks.push(fn);
    }

    /**
     * Start the router lifecycle and render initial route.
     */
    async start() {
        const log = this.logger;

        if (this.#started)
            return;

        log.info?.("Starting router...");

        for (const fn of this.#beforeStartHooks)
            await fn();

        this.#started = true;

        window.addEventListener("popstate", this.#onPopState);
        document.body.addEventListener("click", this.#onClick);

        log.debug?.("Event listeners bound, performing initial render");
        this.#render();

        for (const fn of this.#afterStartHooks)
            await fn();

        log.info?.("Router successfully started");
    }

    /**
     * Stop the router and cleanup all listeners.
     */
    stop() {
        const log = this.logger;

        if (!this.#started)
            return;

        log.info?.("Stopping router...");
        this.#started = false;

        window.removeEventListener("popstate", this.#onPopState);
        document.body.removeEventListener("click", this.#onClick);

        log.debug?.("Listeners removed, router stopped");
    }

    /**
     * Navigate programmatically.
     * Always re-renders the view, even when navigating to the same path.
     *
     * @param {string} url - The target URL or path.
     * @param {{ replace?: boolean, state?: any }} [opts]
     */
    async navigateTo(url, opts = {}) {
        const log = this.logger;

        log.info?.("navigateTo:", url, opts);

        const next = new URL(url, location.origin);
        const curr = location;

        const samePath =
            next.pathname === curr.pathname &&
            next.search === curr.search &&
            next.hash === curr.hash;

        // ── Run beforeNavigate guard ─────────────────────────────────────────
        if (this.#onBeforeNavigate) {
            log.debug?.("Running onBeforeNavigate check for", url);
            const result = await this.#onBeforeNavigate(url);

            if (result === false) {
                log.warn?.("Navigation cancelled by onBeforeNavigate");
                return;
            }
        }

        // ── Push or replace in history ───────────────────────────────────────
        if (opts.replace)
            history.replaceState(opts.state ?? null, "", url);

        else if (!samePath)
            history.pushState(opts.state ?? null, "", url);

        // ── Force re-render ──────────────────────────────────────────────────
        log.debug?.("Forcing re-render for", url);

        this.#state.currentView?.destroy?.();
        this.#state.currentView = null;

        await this.#render();
    }

    /**
     * Internal rendering orchestration.
     */
    async #render() {
        const log = this.logger;

        this.#state.renderId++;
        this.#state.busy = true;

        log.info?.("Rendering path:", location.pathname);

        await renderPipeline(
            {
                logger: log,
                routes: this.#routes,
                notFound: this.#notFound,
                mountEl: this.#mountEl,
                state: this.#state,
                navigate: this.navigateTo.bind(this),
                animationHook: this.#animationHook,
            },
            this.#state.renderId
        );

        log.debug?.("Render complete for", location.pathname);
    }
}
