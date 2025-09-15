// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   AuthService.js                                     :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/09/15 12:18:11 by jeportie          #+#    #+#             //
//   Updated: 2025/09/15 12:28:55 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

/**
 * Generic authentication service.
 * - Stores and retrieves JWT tokens.
 * - Persists a "has session" flag in localStorage.
 * - Can auto-refresh using a caller-provided refreshFn.
 * - Logs through a configurable logger (default = console).
 */
export class AuthService {
    #token = null;
    #storageKey;
    #refreshFn;
    logger;

    constructor({ storageKey = "session", refreshFn, logger = console } = {}) {
        this.#storageKey = storageKey;
        this.#refreshFn = refreshFn;
        this.logger = logger;
    }

    async initFromStorage() {
        if (!localStorage.getItem(this.#storageKey)) {
            return false;
        }

        try {
            const newToken = await this.#refreshFn?.();
            if (newToken) {
                this.setToken(newToken);
                this.logger.info?.("[Auth] Session restored");
                return true;
            }
            this.logger.warn?.("[Auth] RefreshFn returned no token");
        } catch (err) {
            this.logger.error?.("[Auth] Refresh exception:", err);
        }

        this.clear();
        return false;
    }

    isLoggedIn() {
        return !!this.#token;
    }

    getToken() {
        return this.#token;
    }

    setToken(token) {
        this.#token = token;
        localStorage.setItem(this.#storageKey, "true");
    }

    clear() {
        this.#token = null;
        localStorage.removeItem(this.#storageKey);
        this.logger.info?.("[Auth] Session cleared");
    }

    isTokenExpired(skewSec = 10) {
        const t = this.#token;
        if (!t) return true;

        const parts = t.split(".");
        if (parts.length !== 3) return true;

        try {
            const payload = JSON.parse(atob(parts[1]));
            const now = Math.floor(Date.now() / 1000);
            return (payload.exp ?? 0) <= (now + skewSec);
        } catch {
            return true;
        }
    }
}

