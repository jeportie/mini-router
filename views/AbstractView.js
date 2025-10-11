// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   AbstractView.js                                    :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/14 18:36:41 by jeportie          #+#    #+#             //
//   Updated: 2025/08/22 17:33:10 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

/**
 * View context passed to each view instance by the router.
 * Contains information about the current navigation state.
 *
 * @typedef {Object} ViewCtx
 * @property {string} path - The matched route path (e.g. "/posts/123").
 * @property {Object.<string, string>} params - Route params extracted from dynamic segments (e.g. `{ id: "123" }`).
 * @property {Object.<string, string>} query - Query parameters (e.g. `{ search: "foo" }`).
 * @property {string} hash - The hash fragment from the URL (e.g. "#section1").
 * @property {*} state - Arbitrary state object passed through navigation.
 */

/**
 * Base class for all views in the router system.
 * A view is tied to a route and responsible for rendering
 * HTML, binding events, and cleaning up when destroyed.
 */
export default class AbstractView {
    /** @type {ViewCtx} */
    #ctx;

    /**
     * @param {ViewCtx} ctx - Context provided by the router
     */
    constructor(ctx) {
        this.#ctx = ctx;
        console.debug?.("[View] Created with ctx:", this.#ctx);
    }

    /**
     * Read-only access to the view context.
     * @returns {ViewCtx}
     */
    get ctx() {
        return this.#ctx;
    }

    /**
     * Change the document title.
     * Useful for per-view page titles.
     *
     * @param {string} title - New title
     */
    setTitle(title) {
        document.title = title;
    }

    /**
     * Return the HTML content of the view.
     * Should be overridden by subclasses.
     *
     * @example
     * async getHTML() {
     *   return "<h1>Dashboard</h1>";
     * }
     *
     * @returns {Promise<string>}
     */
    async getHTML() {
        return ("");
    }

    /**
     * Auto-imports and executes all modules in ./logic/
     * Each module should export functions (not default exports).
     * Called automatically before mount().
     */
    async #autoRunLogicModules() {
        // Resolve path relative to the current view
        try {
            const logicModules = import.meta.glob("./tasks/*.js");
            // const logicModules = import.meta.glob("./tasks/*.ts");
            const modulePaths = Object.keys(logicModules);
            if (!modulePaths.length) return;

            console.groupCollapsed(`[View] Auto-executing logic modules (${modulePaths.length})`);
            for (const path of modulePaths) {
                const mod = await logicModules[path]();
                for (const fnName of Object.keys(mod)) {
                    const fn = mod[fnName];
                    if (typeof fn === "function") {
                        try {
                            fn(); // execute logic
                            console.debug("→ executed", fnName, "from", path);
                        } catch (err) {
                            console.error("⚠️ Error executing", fnName, err);
                        }
                    }
                }
            }
            console.groupEnd();
        } catch (err) {
            console.error("⚠️ Auto logic import failed:", err);
        }
    }

    /**
     * Mount lifecycle
     * Override this for additional custom setup, but call super.mount()
     * to ensure logic modules are executed automatically.
     */
    async mount() {
        await this.#autoRunLogicModules();
    }

    /**
     * Called before the view is destroyed.
     * Cleanup timers, sockets, and event listeners here.
     */
    destroy() { }

    /* ---------------------------------------------------------------------- */
    /* 🧩 UI Utilities (available in all views)                                */
    /* ---------------------------------------------------------------------- */

    /**
     * Fade out and remove an element.
     * @param {HTMLElement} el
     * @param {number} duration
     */
    fadeOut(el, duration = 300) {
        if (!el) return;
        el.style.transition = `opacity ${duration}ms ease`;
        el.style.opacity = "0";
        setTimeout(() => el.remove(), duration);
    }

    /**
     * Show an alert message inside a container.
     * @param {HTMLElement} container
     * @param {string} message
     * @param {"success"|"error"|"info"|"warning"} type
     */
    showAlert(container, message, type = "info") {
        if (!container) return;
        const div = document.createElement("div");
        div.textContent = message;
        div.className = `ui-alert ui-alert-${type} mb-4`;
        container.prepend(div);
        setTimeout(() => this.fadeOut(div, 500), 4000);
    }
}

