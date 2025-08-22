// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   mini-router.js                                     :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/22 17:41:17 by jeportie          #+#    #+#             //
//   Updated: 2025/08/22 17:47:00 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

import Router from "../router/Router.js";

/**
 * Usage (HTML):
 *   <mini-router id="app" autostart></mini-router>
 *
 * Usage (JS):
 *   import { defineMiniRouter, createRouteTransition } from "@your-scope/mini-spa";
 *   defineMiniRouter(); // registers <mini-router>
 *   const el = document.querySelector("mini-router");
 *   el.routes = [...];
 *   el.linkSelector = "[data-link]";
 *   el.onBeforeNavigate = (to) => !to.startsWith("/api/");
 *   el.transition = createRouteTransition("slide");
 *   el.start();
 */

export function defineMiniRouter(tagName = "mini-router") {
    if (!customElements.get(tagName)) {
        customElements.define(tagName, MiniRouterElement);
    }
}

class MiniRouterElement extends HTMLElement {
    constructor() {
        super();
        /** @type {Router|null} */
        this._router = null;

        /** user-configurable fields (mirrored to Router options) */
        this._routes = [];
        this._linkSelector = "[data-link]";
        this._onBeforeNavigate = undefined;
        this._transition = undefined;

        /** simple guard to avoid duplicate starts */
        this._started = false;
    }

    static get observedAttributes() {
        return ["autostart"];
    }

    attributeChangedCallback(name, _oldV, _newV) {
        if (name === "autostart" && this.isConnected && !this._started) {
            this.start();
        }
    }

    connectedCallback() {
        // Ensure it has an id so Router can target it with a selector
        if (!this.id) {
            this.id = "mini-router-" + Math.random().toString(36).slice(2, 8);
        }
        if (this.hasAttribute("autostart")) this.start();
    }

    disconnectedCallback() {
        this.stop();
    }

    /** Public API (mirrors Router) */
    start() {
        if (this._started) return;
        this._ensureRouter();
        this._router.start();
        this._started = true;
    }

    stop() {
        if (!this._started) return;
        this._router?.stop();
        this._started = false;
    }

    navigateTo(url, opts) {
        this._router?.navigateTo(url, opts);
    }

    /** Properties to configure before or after start() */

    get routes() { return this._routes; }
    set routes(v) {
        this._routes = Array.isArray(v) ? v : [];
        if (this._router) this._recreateRouterIfNeeded();
    }

    get linkSelector() { return this._linkSelector; }
    set linkSelector(v) {
        this._linkSelector = typeof v === "string" ? v : "[data-link]";
        if (this._router) this._router.stop(), this._router = null, this._started = false, this.start();
    }

    get onBeforeNavigate() { return this._onBeforeNavigate; }
    set onBeforeNavigate(fn) {
        this._onBeforeNavigate = typeof fn === "function" ? fn : undefined;
        if (this._router) this._router.stop(), this._router = null, this._started = false, this.start();
    }

    get transition() { return this._transition; }
    set transition(fn) {
        this._transition = typeof fn === "function" ? fn : undefined;
        if (this._router) this._router.stop(), this._router = null, this._started = false, this.start();
    }

    /** Internal */

    _ensureRouter() {
        if (this._router) return;

        // Mount directly into THIS element via its id
        this._router = new Router({
            routes: this._routes,
            mountSelector: `#${this.id}`,
            linkSelector: this._linkSelector,
            onBeforeNavigate: this._onBeforeNavigate,
            transition: this._transition,
        });
    }

    _recreateRouterIfNeeded() {
        if (!this._router) return;
        const wasStarted = this._started;
        this._router.stop();
        this._router = null;
        this._started = false;
        if (wasStarted) this.start();
    }
}
