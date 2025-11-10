// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   mini-router.js                                     :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/22 17:41:17 by jeportie          #+#    #+#             //
//   Updated: 2025/08/24 01:37:57 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

import Router from "../router/Router.js";
import AbstractAnimationHook from "../transitions/AbstractAnimationHook.js";

const defaultOnBeforeNavigate = (to) => !to.startsWith("/api/");

export function defineMiniRouter(tagName = "mini-router") {
    if (!customElements.get(tagName)) customElements.define(tagName, MiniRouterElement);
}

class MiniRouterElement extends HTMLElement {
    constructor() {
        super();
        this._router = null;
        this._routes = [];
        this._linkSelector = "[data-link]";
        this._onBeforeNavigate = defaultOnBeforeNavigate;
        this._animationHook = new AbstractAnimationHook(); // <—
        this._started = false;
        this._logger = console;
    }

    get logger() {
        return this._logger;
    }

    set logger(v) {
        this._logger = v || console; if (this._router) this._recreate();
    }

    static get observedAttributes() { return ["autostart"]; }
    attributeChangedCallback(name) {
        if (name === "autostart" && this.isConnected && !this._started) this.start();
    }
    connectedCallback() {
        if (!this.id) this.id = "mini-router-" + Math.random().toString(36).slice(2, 8);
        if (this.hasAttribute("autostart")) this.start();
    }
    disconnectedCallback() { this.stop(); }

    async start() {
        if (this._started)
            return (Promise.resolve());
        this._ensureRouter();
        this._started = true;
        window.navigateTo = (url, opts = {}) => {
            console.log("[window.navigateTo]", url, opts);
            return this._router.navigateTo(url, opts);
        };
        try {
            await this._router.start();
            this.dispatchEvent(new CustomEvent("router:started"));
        } catch (err) {
            this._renderStartError(err);
            // don't rethrow; main can call start() without catch
            this.dispatchEvent(new CustomEvent("router:error", { detail: err }));
        }
    }

    stop() { if (!this._started) return; this._router?.stop(); this._started = false; }

    navigateTo(url, opts) { this._router?.navigateTo(url, opts); }

    get routes() { return this._routes; }
    set routes(v) { this._routes = Array.isArray(v) ? v : []; if (this._router) this._recreate(); }

    get linkSelector() { return this._linkSelector; }
    set linkSelector(v) { this._linkSelector = typeof v === "string" ? v : "[data-link]"; if (this._router) this._recreate(); }

    get onBeforeNavigate() { return this._onBeforeNavigate; }
    set onBeforeNavigate(fn) { this._onBeforeNavigate = typeof fn === "function" ? fn : undefined; if (this._router) this._recreate(); }

    get animationHook() { return this._animationHook; }
    set animationHook(h) { this._animationHook = h || new AbstractAnimationHook(); if (this._router) this._recreate(); }

    _renderStartError(err) {
        this.innerHTML = `
            <div class="min-h-screen flex items-center justify-center p-6">
                <div
                    class="w-full max-w-md rounded-2xl border border-red-200 bg-red-50/80 p-6 shadow-lg"
                    role="alert"
                    aria-live="assertive"
                >
                    <h2 class="text-lg font-semibold text-red-800 flex items-center justify-center gap-2">
                        <span aria-hidden="true">⚠️</span>
                        <span>App failed to start</span>
                    </h2>            
                    <pre class="mt-3 text-sm text-red-700 bg-red-100/70 rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-words">
                        ${(err && err.message) || "Unknown error"}
                    </pre>
                </div>
            </div>
        `;
    }

    _ensureRouter() {
        if (this._router) return;
        this._router = new Router({
            routes: this._routes,
            mountSelector: `#${this.id}`,
            linkSelector: this._linkSelector,
            onBeforeNavigate: this._onBeforeNavigate,
            animationHook: this._animationHook,
            logger: this._logger,
        });
    }
    _recreate() {
        const was = this._started;
        this._router?.stop();
        this._router = null; this._started = false;
        if (was) this.start();
    }

    beforeStart(fn) {
        this._ensureRouter();
        this._router.beforeStart(fn);
    }

    afterStart(fn) {
        this._ensureRouter();
        this._router.afterStart(fn);
    }
}

