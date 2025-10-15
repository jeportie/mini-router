// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   Router.js                                          :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/21 13:55:36 by jeportie          #+#    #+#             //
//   Updated: 2025/08/24 01:43:05 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

import { pathToRegex, expandRoutes } from "./internals/routing.js";
import { renderPipeline } from "./internals/render.js";
import { createHandlers } from "./internals/events.js";
import AbstractAnimationHook from "../transitions/AbstractAnimationHook.js";

/**
 * @typedef RouterOptions
 * @prop {RouteDef[]} routes
 * @prop {string} [mountSelector="#app"]
 * @prop {string} [linkSelector="[data-link]"]
 * @prop {(to:string)=>boolean|void|Promise<boolean|void>} [onBeforeNavigate]
 * @prop {AbstractAnimationHook} [animationHook]   // pluggable animation hook
 * @prop {string} [notFoundPath]
 */
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
        if (!opts || !Array.isArray(opts.routes) || opts.routes.length === 0) {
            throw new Error("Router: you must provide a non-empty routes array.");
        }
        this.logger = opts.logger ?? console;
        this.logger.info?.("[Router] Initializing with", opts.routes.length, "routes");

        const flat = expandRoutes(opts.routes, "/");
        this.#routes = flat.map((r) => {
            const { regex, keys, isCatchAll } = pathToRegex(r.fullPath === "/*" ? "*" : r.fullPath);
            return {
                path: r.path,
                fullPath: r.fullPath,
                regex, keys, isCatchAll,
                view: r.view,
                component: r.component,
                layout: r.layout,
                beforeEnter: r.beforeEnter,
                transition: r.transition, // left for userland; renderer no longer interprets this
                animationHook: r.animationHook,
                parents: r.parents,
            };
        });

        this.#notFound =
            this.#routes.find((r) => r.isCatchAll) ||
            (opts.notFoundPath
                ? this.#routes.find((r) => r.fullPath === opts.notFoundPath || r.path === opts.notFoundPath)
                : undefined);

        const m = document.querySelector(opts.mountSelector ?? "#app");
        if (!m) throw new Error("Router: mount element not found.");
        this.#mountEl = /** @type {HTMLElement} */ (m);

        this.#linkSelector = opts.linkSelector ?? "[data-link]";
        this.#onBeforeNavigate = opts.onBeforeNavigate;

        // resolve animation hook (default = hard swap)
        this.#animationHook =
            opts.animationHook instanceof Object ? opts.animationHook : new AbstractAnimationHook();

        const { onPopState, onClick } = createHandlers({
            linkSelector: this.#linkSelector,
            onNavigate: (to) =>
                typeof to === "string" ? this.navigateTo(to) : this.#render(),
        });
        this.#onPopState = onPopState;
        this.#onClick = onClick;
    }

    beforeStart(fn) {
        this.#beforeStartHooks.push(fn);
    }

    afterStart(fn) {
        this.#afterStartHooks.push(fn);
    }

    async start() {
        if (this.#started)
            return;
        this.logger.info?.("[Router] Starting...");
        for (const fn of this.#beforeStartHooks) {
            await fn();
        }

        this.#started = true;
        window.addEventListener("popstate", this.#onPopState);
        document.body.addEventListener("click", this.#onClick);
        this.#render();

        for (const fn of this.#afterStartHooks) {
            await fn();
        }
    }

    stop() {
        if (!this.#started)
            return;
        this.logger.info?.("[Router] Stopping router");
        this.#started = false;
        window.removeEventListener("popstate", this.#onPopState);
        document.body.removeEventListener("click", this.#onClick);
    }

    /**
     * Navigate programmatically.
     * Always re-renders the view, even when navigating to the same path.
     * @param {string} url - The target URL or path.
     * @param {{ replace?: boolean, state?: any }} [opts]
     */
    async navigateTo(url, opts = {}) {
        console.info("[Router:navigateTo]", url, opts);

        const next = new URL(url, location.origin);
        const curr = location;

        const samePath =
            next.pathname === curr.pathname &&
            next.search === curr.search &&
            next.hash === curr.hash;

        // ── Always navigate ────────────────────────────────
        if (this.#onBeforeNavigate) {
            this.logger.info?.("[Router] onBeforeNavigate check for", url);
            const result = await this.#onBeforeNavigate(url);
            if (result === false)
                return;
        }

        // ── Replace or push to history ─────────────────────
        if (opts.replace)
            history.replaceState(opts.state ?? null, "", url);
        else if (!samePath)
            history.pushState(opts.state ?? null, "", url);
        // if samePath, skip pushing but still re-render

        // ── Force new render ───────────────────────────────
        this.logger.info?.("[Router] Forcing render for", url);
        this.#state.currentView?.destroy?.();
        this.#state.currentView = null;
        await this.#render();
    }

    async #render() {
        this.#state.renderId++;
        this.#state.busy = true;
        this.logger.info?.("[Router] Rendering path:", location.pathname);
        await renderPipeline(
            {
                logger: this.logger,
                routes: this.#routes,
                notFound: this.#notFound,
                mountEl: this.#mountEl,
                state: this.#state,
                navigate: this.navigateTo.bind(this),
                animationHook: this.#animationHook,
            },
            this.#state.renderId
        );
    }
}
