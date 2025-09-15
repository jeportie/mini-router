// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   guards.js                                          :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/09/15 13:44:06 by jeportie          #+#    #+#             //
//   Updated: 2025/09/15 13:48:30 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

/**
 * Build a guard that enforces authentication before entering a route.
 *
 * @param {AuthService} auth - your AuthService instance.
 * @param {Object} opts
 * @param {string} [opts.loginPath="/login"] - where to redirect when unauthenticated.
 * @param {Function} [opts.checkSessionFn] - async fn returning true if session is valid.
 * @param {{ info:Function, warn:Function, error:Function }} [opts.logger=console]
 *
 * @returns {Function} - a guard usable in route.beforeEnter.
 */
export function requireAuth(auth, { loginPath = "/login", checkSessionFn, logger = console } = {}) {
    return async function(ctx) {
        logger.info?.("[Guard] Checking auth for path:", ctx?.path, "...");

        const wanted =
            (ctx?.path || location.pathname) +
            (location.search || "") +
            (location.hash || "");
        const next = encodeURIComponent(wanted);

        if (!auth.isLoggedIn()) {
            logger.warn?.("[Guard] Not logged in.");
            return `${loginPath}?next=${next}`;
        }

        // Proactive refresh if token looks expired
        if (auth.isTokenExpired()) {
            logger.info?.("[Guard] Token looks expired, trying refresh...");
            const ok = await auth.initFromStorage();
            if (!ok) {
                logger.warn?.("[Guard] Refresh failed, redirecting to login");
                return `${loginPath}?next=${next}`;
            }
        }

        // Definitive backend check (optional)
        if (typeof checkSessionFn === "function") {
            try {
                const valid = await checkSessionFn();
                if (valid) {
                    logger.info?.("[Guard] Backend session check OK");
                    return true;
                }
                logger.warn?.("[Guard] Backend session check failed");
            } catch (err) {
                logger.error?.("[Guard] checkSessionFn exception:", err);
            }
            auth.clear();
            return `${loginPath}?next=${next}`;
        }

        // If no backend check, just trust local token
        return true;
    };
}

/**
 * Global guard: block navigation to URLs starting with /api/.
 *
 * @param {string} to - destination URL.
 * @returns {boolean} false if navigation should be blocked.
 */
export function onBeforeNavigate(to) {
    if (to.startsWith("/api/")) return false;
}
