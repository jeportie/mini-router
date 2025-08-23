// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   Router.js                                          :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/21 13:55:36 by jeportie          #+#    #+#             //
//   Updated: 2025/08/24 00:07:00 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

import { pathToRegex, expandRoutes } from "./internals/routing.js";
import { renderPipeline } from "./internals/render.js";
import { createHandlers } from "./internals/events.js";
import { toEngine } from "./transitions/index.js";
import { tailwindEngine } from "./transitions/tailwindEngine.js";
import { noopEngine } from "./transitions/noopEngine.js";
import { wcEngine } from "./transitions/wcEngine.js";

/**
 * @typedef RouterOptions
 * @prop {RouteDef[]} routes
 * @prop {string} [mountSelector="#app"]
 * @prop {string} [linkSelector="[data-link]"]
 * @prop {(to:string)=>boolean|void|Promise<boolean|void>} [onBeforeNavigate]
 * @prop {(el:HTMLElement, phase:"out"|"in")=> (void|Promise<void>) | { run:(el:HTMLElement,phase:"out"|"in",ctx?:any)=>void|Promise<void> } | { engine:string, [key:string]:any }} [transition]
 * @prop {"container"|"overlap"|"auto"} [transitionMode]  // used when transition is a function/engine object
 * @prop {string} [notFoundPath]
 */
export default class Router {
    #routes = [];
    #notFound;
    #mountEl;
    #linkSelector;
    #onBeforeNavigate;
    #started = false;

    // engines
    #engineRegistry;
    #defaultEngine;

    // keep raw for resolving variant/mode later
    #routerDefaultSpec;
    #routerDefaultMode;

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

        // Build registry (add more later: waapi, svg, canvas...)
        this.#engineRegistry = {
            tailwind: (spec = {}) => tailwindEngine(spec.variant || "fade"),
            wc: (spec = {}) => wcEngine(spec.tag || "page-transition"),
            noop: () => noopEngine(),
        };

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
                transition: r.transition,
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

        // store raw + mode, and also normalize to an engine for execution
        this.#routerDefaultSpec = opts.transition;
        this.#routerDefaultMode = opts.transitionMode ?? "auto";
        this.#defaultEngine = toEngine(opts.transition, this.#engineRegistry);

        const { onPopState, onClick } = createHandlers({
            linkSelector: this.#linkSelector,
            onNavigate: (to) =>
                typeof to === "string" ? this.navigateTo(to) : this.#render(),
        });
        this.#onPopState = onPopState;
        this.#onClick = onClick;
    }

    start() {
        if (this.#started) return;
        this.#started = true;
        window.addEventListener("popstate", this.#onPopState);
        document.body.addEventListener("click", this.#onClick);
        this.#render();
    }

    stop() {
        if (!this.#started) return;
        this.#started = false;
        window.removeEventListener("popstate", this.#onPopState);
        document.body.removeEventListener("click", this.#onClick);
    }

    /**
     * @param {string} url
     * @param {{ replace?: boolean, state?: any }} [opts]
     */
    async navigateTo(url, opts) {
        if (this.#state.busy) return;
        const next = new URL(url, location.origin);
        const curr = location;
        if (next.pathname === curr.pathname &&
            next.search === curr.search &&
            next.hash === curr.hash &&
            !opts?.replace) {
            return; // nothing to do
        }
        if (this.#onBeforeNavigate) {
            const result = await this.#onBeforeNavigate(url);
            if (result === false) return;
        }
        if (opts?.replace) {
            history.replaceState(opts?.state ?? null, "", url);
        } else {
            history.pushState(opts?.state ?? null, "", url);
        }
        this.#render();
    }

    async #render() {
        this.#state.renderId++;
        this.#state.busy = true;
        await renderPipeline(
            {
                routes: this.#routes,
                notFound: this.#notFound,
                mountEl: this.#mountEl,
                transitionEngine: this.#defaultEngine,
                engineRegistry: this.#engineRegistry,
                routerDefaultSpec: this.#routerDefaultSpec,
                routerDefaultMode: this.#routerDefaultMode,
                state: this.#state,
                navigate: this.navigateTo.bind(this),
            },
            this.#state.renderId
        );
    }
}

