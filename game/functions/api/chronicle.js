// Cloudflare Pages Function: server-side LLM proxy for the Atelier.
//
// Set ZAI_API_KEY as a Pages secret. The browser only calls this same-origin
// route, so the provider key is never sent to or stored in the game client.
// The deterministic offline chronicler remains usable when this function or
// the upstream provider is unavailable.
const ALLOWED_KINDS = new Set(["book", "artifact", "conversation"]);
const MAX_PROMPT = 8000;

function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"
        }
    });
}

function parseJsonContent(value) {
    const text = String(value || "").trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "");
    if (!text) throw new Error("empty_model_response");
    return JSON.parse(text);
}

export async function onRequestPost({request, env}) {
    if (!env.ZAI_API_KEY) {
        return json({error: "ai_not_configured", message: "The server-side AI key is not configured."}, 503);
    }
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
        return json({error: "invalid_content_type"}, 415);
    }
    let body;
    try {
        body = await request.json();
    } catch {
        return json({error: "invalid_json"}, 400);
    }
    const kind = String(body?.kind || "");
    const prompt = String(body?.prompt || "");
    if (!ALLOWED_KINDS.has(kind) || !prompt.trim() || prompt.length > MAX_PROMPT) {
        return json({error: "invalid_chronicle_request"}, 400);
    }
    const base = String(env.ZAI_API_BASE || "https://api.z.ai/api/paas/v4").replace(/\/+$/, "");
    const model = String(env.ZAI_MODEL || "glm-4-flash");
    let upstream;
    try {
        upstream = await fetch(base + "/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + env.ZAI_API_KEY
            },
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: "system",
                        content: "You are the court chronicler for a living medieval fantasy strategy game. Return ONLY one valid JSON object matching the requested shape. Never add markdown fences, commentary, keys for game mechanics, or facts not grounded in the supplied realm record."
                    },
                    {role: "user", content: prompt}
                ],
                temperature: 0.85,
                max_tokens: 900,
                response_format: {type: "json_object"}
            }),
            signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout
                ? AbortSignal.timeout(25000)
                : undefined
        });
    } catch {
        return json({error: "provider_unreachable"}, 502);
    }
    if (!upstream.ok) {
        return json({error: "provider_error", status: upstream.status}, 502);
    }
    let payload;
    try {
        payload = await upstream.json();
    } catch {
        return json({error: "provider_invalid_json"}, 502);
    }
    let entry;
    try {
        entry = parseJsonContent(payload?.choices?.[0]?.message?.content);
    } catch {
        return json({error: "model_invalid_json"}, 502);
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return json({error: "model_invalid_shape"}, 502);
    }
    return json({entry, model});
}

export function onRequestGet() {
    return json({error: "method_not_allowed"}, 405);
}
