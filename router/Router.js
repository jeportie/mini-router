
// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   Router.js                                          :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/21 13:55:36 by jeportie          #+#    #+#             //
//   Updated: 2025/08/22 11:59:59 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

import { pathToRegex, normalize, parseQuery } from "./routerTools.js";
import { expandRoutes, ensureComponent, runGuards } from "./routerInternals.js"

/**
 * Simple, framework-agnostic SPA router with:
 * - Nested routes
 * - Lazy loading (component/view as () => import(...))
 * - Route guards (beforeEnter)
 * - Nested layouts (layout with <!-- router-slot -->)
 * - Optional transitions (transition(el, "out" | "in"))
 *
 * Public API:
 *   - new Router(options)
 *   - router.start()
 *   - router.stop()
 *   - router.navigateTo(url, { replace?, state? })
 *
 * Views/Layout must implement:
 *   - async getHTML(): string
 *   - mount?(): void        (optional, runs after HTML is in the DOM)
 *   - destroy?(): void      (optional, runs before unmount)
 */

/**
 * @typedef RouterOptions
 * @prop {RouteDef[]} routes
 * @prop {string} [mountSelector="#app"]
 * @prop {string} [linkSelector="[data-link]"]
 * @prop {(to:string)=>boolean|void|Promise<boolean|void>} [onBeforeNavigate]
 * @prop {(el:HTMLElement, phase:"out"|"in")=> (void|Promise<void>)} [transition]
 * @prop {string} [notFoundPath] Optional explicit not-found path in your route table
 */
export default class Router {
    // Compiled flat route table with parents, regex, keys, optional layout & guard
    #routes = [];
    #notFound;
    #mountEl;
    #linkSelector;
    #onBeforeNavigate;
    #transition;
    #currentView = null;
    #started = false;
    #currentLayouts = [];

    // ---------- Event handlers (bound once) ----------
    #onPopState = () => { this.#render(); };

    #onClick = (event) => {
        // Only normal left-clicks
        if (event.defaultPrevented) return;
        if (event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        // Find the nearest matching link
        const target = event.target;
        if (!(target instanceof Element)) return;

        const linkEl = target.closest(this.#linkSelector);
        if (!linkEl) return;

        // Respect standard link behaviors
        if (linkEl.target === "_blank") return;
        if (linkEl.hasAttribute("download")) return;
        if (linkEl.getAttribute("rel") === "external") return;

        // Only handle same-origin, non-API links
        const urlObj = new URL(linkEl.href, window.location.origin);
        if (urlObj.origin !== window.location.origin) return;
        if (urlObj.pathname.startsWith("/api/")) return;

        // SPA navigation
        event.preventDefault();
        const pathAndQuery = urlObj.pathname + urlObj.search + urlObj.hash;
        this.navigateTo(pathAndQuery);
    };

    /**
     * @param {RouterOptions} opts
     * @throws {Error} If mount element isn't found or routes are empty
     */
    constructor(opts) {
        if (!opts || !Array.isArray(opts.routes) || opts.routes.length === 0) {
            throw new Error("Router: you must provide a non-empty routes array.");
        }

        // Flatten nested routes and precompile regexes
        const flat = expandRoutes(opts.routes, "/");
        this.#routes = flat.map((r) => {
            const { regex, keys, isCatchAll } = pathToRegex(r.fullPath === "/*" ? "*" : r.fullPath);
            return {
                path: r.path,            // original local path
                fullPath: r.fullPath,    // absolute normalized path
                regex, keys, isCatchAll,
                view: r.view,
                component: r.component,
                layout: r.layout,
                beforeEnter: r.beforeEnter,
                parents: r.parents,      // array of parent route entries (with layout/guards)
            };
        });

        // Optional explicit notFound mapping, or the first catch-all definition ("*")
        this.#notFound =
            this.#routes.find((r) => r.isCatchAll) ||
            (opts.notFoundPath
                ? this.#routes.find((r) => r.fullPath === opts.notFoundPath || r.path === opts.notFoundPath)
                : undefined);

        // Mount point in the DOM where views will be injected
        const m = document.querySelector(opts.mountSelector ?? "#app");
        if (!m) throw new Error("Router: mount element not found.");
        this.#mountEl = /** @type {HTMLElement} */ (m);

        this.#linkSelector = opts.linkSelector ?? "[data-link]";
        this.#onBeforeNavigate = opts.onBeforeNavigate;
        this.#transition = opts.transition;
    }

    /**
     * Start handling navigation:
     * - Binds `popstate` (back/forward) and delegated link clicks.
     * - Performs initial render.
     */
    start() {
        if (this.#started) return;
        this.#started = true;
        window.addEventListener("popstate", this.#onPopState);
        document.body.addEventListener("click", this.#onClick);
        this.#render();
    }

    /**
     * Stop handling navigation and remove event listeners.
     */
    stop() {
        if (!this.#started) return;
        this.#started = false;

        window.removeEventListener("popstate", this.#onPopState);
        document.body.removeEventListener("click", this.#onClick);
    }

    /**
     * Programmatically navigate within the SPA.
     *
     * @param {string} url A path + optional query string (e.g. "/posts/7?tab=comments")
     * @param {{ replace?: boolean, state?: any }} [opts]
     *   - replace: use history.replaceState instead of pushState
     *   - state:   arbitrary serializable state stored in history.state
     */
    async navigateTo(url, opts) {
        // Allow user-defined guard/confirm (sync or async). Any falsey return cancels.
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

    // ---------- Internal ----------

    /**
     * Try to match the current pathname against known routes.
     * @param {string} pathname Normalized path (e.g. "/posts/7")
     * @returns {{ route:any, params:Record<string,string> } | null}
     */
    #match(pathname) {
        for (const r of this.#routes) {
            const m = pathname.match(r.regex);
            if (!m) continue;

            const values = m.slice(1); // capture groups
            const params = {};
            r.keys.forEach((k, i) => {
                params[k] = decodeURIComponent(values[i] ?? "");
            });
            return { route: r, params };
        }
        return null;
    }

    /**
     * Build the per-view context object.
     * @param {string} pathname
     * @param {Record<string,string>} params
     * @returns {{ path:string, params:Record<string,string>,
     *      query:Record<string,string>, hash:Record<string>, state:any }}
     */
    #buildContext(pathname, params) {
        return {
            path: pathname,
            params,
            query: parseQuery(window.location.search),
            hash: (window.location.hash || "").replace(/^#/, ""), // 👈 add this
            state: history.state,
        };
    }

    /**
     * Core render pipeline with guards, layouts, lazy loading, and optional transitions:
     * - Resolve current route
     * - Build context
     * - Run guards (parents -> leaf)
     * - Transition out (optional)
     * - Destroy previous view
     * - Load layouts & leaf (lazy if needed)
     * - Compose HTML via <!-- router-slot -->
     * - Inject HTML and mount leaf
     * - Transition in (optional)
     */
    async #render() {
        const pathname = normalize(window.location.pathname);

        const m = this.#match(pathname);
        const route = m?.route || this.#notFound;
        const params = m?.params || {};

        if (!route) {
            this.#mountEl.innerHTML = "<h1>Not Found</h1>";
            return;
        }

        const ctx = this.#buildContext(pathname, params);

        // Guards
        const parents = route.parents || [];
        const guardRes = await runGuards(parents, route, ctx);
        if (guardRes.action === "block") return;
        if (guardRes.action === "redirect") {
            await this.navigateTo(guardRes.to, { replace: true });
            return;
        }

        // Transition out (optional)
        if (this.#transition) {
            await Promise.resolve(this.#transition(this.#mountEl, "out"));
        }

        // 1) destroy previous leaf view
        this.#currentView?.destroy?.();
        this.#currentView = null;

        // 2) destroy old layouts (timers, listeners, etc.)
        for (const lay of this.#currentLayouts) lay?.destroy?.();
        this.#currentLayouts = [];

        // Load layouts (outer -> inner) and component for leaf
        /** @type {any[]} */
        const layoutInsts = [];
        for (const p of parents) {
            if (p.layout) {
                const LayoutCtor = await ensureComponent(p.layout);
                layoutInsts.push(new LayoutCtor(ctx));
            }
        }

        const LeafCtor = await ensureComponent(route.component || route.view);
        const leaf = new LeafCtor(ctx);

        // Render leaf first
        let html = await leaf.getHTML();
        html = typeof html === "string" ? html : String(html);

        // wrap inner -> outer
        for (let i = layoutInsts.length - 1; i >= 0; i--) {
            const inst = layoutInsts[i];
            let shell = await inst.getHTML();
            shell = typeof shell === "string" ? shell : String(shell);
            if (!shell.includes("<!-- router-slot -->")) {
                throw new Error("Layout missing <!-- router-slot -->");
            }
            html = shell.replace("<!-- router-slot -->", html);
        }

        // Mount new DOM
        this.#mountEl.innerHTML = html;
        // Save & mount layouts
        this.#currentLayouts = layoutInsts;
        // Mount layouts (outer -> inner) so parents can wire global UI first
        for (const inst of this.#currentLayouts) inst.mount?.();
        this.#currentView = leaf;
        leaf.mount?.();

        // Transition in (optional)
        if (this.#transition) {
            await Promise.resolve(this.#transition(this.#mountEl, "in"));
        }
    }
}
