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
    #routes = [];
    #notFound;
    #mountEl;
    #linkSelector;
    #onBeforeNavigate;
    #started = false;

    // animation hook
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
        const force = opts?.force === true;
        if (this.#state.busy && !force) return;
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
                state: this.#state,
                navigate: this.navigateTo.bind(this),
                animationHook: this.#animationHook,
            },
            this.#state.renderId
        );
    }
}
