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
     * Automatically imports and executes all functions
     * exported from JS modules in ./logic/
     */
    async #autoRunLogicModules() {
        try {
            // Get the current view file path dynamically
            const currentUrl = import.meta.url;
            const basePath = currentUrl.split("/").slice(0, -1).join("/");

            // Dynamically discover ./logic folder relative to current view
            const logicPath = `${basePath}/tasks`;
            const response = await fetch(`${logicPath}/index.js`).catch(() => null);

            if (!response || !response.ok) {
                console.debug("[View] No logic/index.js found → skipping auto import");
                return;
            }

            // Import the logic index dynamically
            const module = await import(`${logicPath}/index.js`);

            // Execute all exported functions
            const fnNames = Object.keys(module);
            console.groupCollapsed(`[View] Auto-executing logic modules (${fnNames.length})`);
            for (const fnName of fnNames) {
                const fn = module[fnName];
                if (typeof fn === "function") {
                    try {
                        fn(this);
                        console.debug("→ executed", fnName);
                    } catch (err) {
                        console.error("⚠️ Error executing", fnName, err);
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

