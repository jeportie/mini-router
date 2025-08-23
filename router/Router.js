// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   Router.js                                          :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/21 13:55:36 by jeportie          #+#    #+#             //
//   Updated: 2025/08/23 16:07:18 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

import { pathToRegex, normalize, parseQuery } from "./routerTools.js";
import { expandRoutes, ensureComponent, runGuards } from "./routerInternals.js";

/**
 * @typedef RouterOptions
 * @prop {RouteDef[]} routes
 * @prop {string} [mountSelector="#app"]
 * @prop {string} [linkSelector="[data-link]"]
 * @prop {(to:string)=>boolean|void|Promise<boolean|void>} [onBeforeNavigate]
 * @prop {(el:HTMLElement, phase:"out"|"in")=> (void|Promise<void>)} [transition]
 * @prop {string} [notFoundPath]
 */

export default class Router {
    // internals
    #routes = [];
    #notFound;
    #mountEl;
    #linkSelector;
    #onBeforeNavigate;
    #transition;
    #currentView = null;
    #currentLayouts = [];
    #started = false;
    #renderId = 0;
    #isAnimating = false;

    // ------------ Events ------------
    #onPopState = () => { this.#render(); };

    #onClick = (event) => {
        if (this.#isAnimating) return;
        if (event.defaultPrevented) return;
        if (event.button !== 0) return; // left-click
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        const target = event.target;
        if (!(target instanceof Element)) return;

        const linkEl = target.closest(this.#linkSelector);
        if (!linkEl) return;

        if (linkEl.target === "_blank") return;
        if (linkEl.hasAttribute("download")) return;
        if (linkEl.getAttribute("rel") === "external") return;

        const urlObj = new URL(linkEl.href, window.location.origin);
        if (urlObj.origin !== window.location.origin) return;
        if (urlObj.pathname.startsWith("/api/")) return;

        event.preventDefault();
        const pathAndQuery = urlObj.pathname + urlObj.search + urlObj.hash;
        this.navigateTo(pathAndQuery);
    };

    /**
     * @param {RouterOptions} opts
     */
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
        this.#transition = opts.transition;
    }

    // ------------ Public API ------------
    start() {
        if (this.#started) return;
        this.#started = true;
        window.addEventListener("popstate", this.#onPopState);
        document.body.addEventListener("click", this.#onClick);
        this.#render();
        console.log("router successfully started");
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
        if (this.#isAnimating) return;

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

    // ------------ Internals ------------
    #match(pathname) {
        for (const r of this.#routes) {
            const m = pathname.match(r.regex);
            if (!m) continue;
            const values = m.slice(1);
            const params = {};
            r.keys.forEach((k, i) => { params[k] = decodeURIComponent(values[i] ?? ""); });
            return { route: r, params };
        }
        return null;
    }

    #buildContext(pathname, params) {
        return {
            path: pathname,
            params,
            query: parseQuery(window.location.search),
            hash: (window.location.hash || "").replace(/^#/, ""),
            state: history.state,
        };
    }

    async #render() {
        const rid = ++this.#renderId;
        this.#isAnimating = true;

        const pathname = normalize(window.location.pathname);
        const m = this.#match(pathname);
        const route = m?.route || this.#notFound;
        const params = m?.params || {};

        if (!route) {
            this.#mountEl.innerHTML = "<h1>Not Found</h1>";
            this.#isAnimating = false;
            return;
        }

        const ctx = this.#buildContext(pathname, params);

        // Guards (from parents to leaf)
        const parents = route.parents || [];
        const guardRes = await runGuards(parents, route, ctx);
        if (rid !== this.#renderId) return;
        if (guardRes.action === "block") return;
        if (guardRes.action === "redirect") {
            await this.navigateTo(guardRes.to, { replace: true });
            this.#isAnimating = false;
            return;
        }

        const mount = this.#mountEl;

        // OUT phase only if something is already rendered
        if (this.#transition && mount.childElementCount > 0) {
            await Promise.resolve(this.#transition(mount, "out"));
            if (rid !== this.#renderId) return;
        }

        // Tear down previous instances
        this.#currentView?.destroy?.();
        this.#currentView = null;
        for (const lay of this.#currentLayouts) lay?.destroy?.();
        this.#currentLayouts = [];

        // Lazy load layouts and leaf
        /** @type {any[]} */
        const layoutInsts = [];
        for (const p of parents) {
            if (p.layout) {
                const LayoutCtor = await ensureComponent(p.layout);
                if (rid !== this.#renderId) return;
                layoutInsts.push(new LayoutCtor(ctx));
            }
        }

        const LeafCtor = await ensureComponent(route.component || route.view);
        if (rid !== this.#renderId) return;

        const leaf = new LeafCtor(ctx);
        let html = await leaf.getHTML();
        if (rid !== this.#renderId) return;

        html = typeof html === "string" ? html : String(html);

        // Compose layouts (inner -> outer) with <!-- router-slot -->
        for (let i = layoutInsts.length - 1; i >= 0; i--) {
            const inst = layoutInsts[i];
            let shell = await inst.getHTML();
            if (rid !== this.#renderId) return;
            shell = typeof shell === "string" ? shell : String(shell);
            if (!shell.includes("<!-- router-slot -->")) {
                throw new Error("Layout missing <!-- router-slot -->");
            }
            html = shell.replace("<!-- router-slot -->", html);
        }

        // Swap content
        mount.innerHTML = html;

        // Mount hooks
        this.#currentLayouts = layoutInsts;
        for (const inst of this.#currentLayouts) inst.mount?.();
        this.#currentView = leaf;
        leaf.mount?.();

        // IN phase
        if (this.#transition) {
            await Promise.resolve(this.#transition(mount, "in"));
            if (rid !== this.#renderId) return;
        }

        this.#isAnimating = false;
    }
}
