package dev.knalis.trajectaapi.security;

import dev.knalis.trajectaapi.config.props.RequestLoggingProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;
import java.util.UUID;

@Component
@Slf4j
@RequiredArgsConstructor
public class RequestLoggingFilter extends OncePerRequestFilter {

    private static final String REQUEST_ID_HEADER = "X-Request-Id";
    private static final String MDC_REQUEST_ID_KEY = "requestId";
    private static final Set<String> SENSITIVE_QUERY_KEYS = Set.of(
            "token", "password", "secret", "key", "authorization", "jwt", "api_key"
    );

    private final RequestLoggingProperties properties;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        String path = request.getRequestURI();
        if (properties.getExcludePathPrefixes() == null) {
            return false;
        }
        for (String prefix : properties.getExcludePathPrefixes()) {
            if (prefix != null && !prefix.isBlank() && path.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        long startedAt = System.currentTimeMillis();
        String requestId = resolveRequestId(request);
        MDC.put(MDC_REQUEST_ID_KEY, requestId);
        response.setHeader(REQUEST_ID_HEADER, requestId);

        try {
            filterChain.doFilter(request, response);
        } finally {
            long durationMs = System.currentTimeMillis() - startedAt;
            logRequest(request, response, durationMs, requestId);
            MDC.remove(MDC_REQUEST_ID_KEY);
        }
    }

    private void logRequest(HttpServletRequest request, HttpServletResponse response, long durationMs, String requestId) {
        String pattern = "http method={} path={} status={} durationMs={} requestId={}";
        String method = request.getMethod();
        String path = safePath(request);
        int status = response.getStatus();

        if (status >= 500) {
            log.warn(pattern, method, path, status, durationMs, requestId);
            return;
        }

        if (status >= 400 || durationMs >= properties.getSlowThresholdMs()) {
            log.info(pattern, method, path, status, durationMs, requestId);
            return;
        }

        switch (properties.getSuccessLogLevel()) {
            case INFO -> log.info(pattern, method, path, status, durationMs, requestId);
            case OFF -> {
                return;
            }
            default -> log.debug(pattern, method, path, status, durationMs, requestId);
        }
    }

    private String resolveRequestId(HttpServletRequest request) {
        String incoming = request.getHeader(REQUEST_ID_HEADER);
        if (incoming == null || incoming.isBlank()) {
            return UUID.randomUUID().toString();
        }
        String normalized = incoming.trim();
        return normalized.length() > 120 ? normalized.substring(0, 120) : normalized;
    }

    private String safePath(HttpServletRequest request) {
        String query = request.getQueryString();
        if (query == null || query.isBlank()) {
            return request.getRequestURI();
        }

        String[] pairs = query.split("&");
        StringBuilder masked = new StringBuilder();
        for (int i = 0; i < pairs.length; i++) {
            String pair = pairs[i];
            int idx = pair.indexOf('=');
            String key = idx >= 0 ? pair.substring(0, idx) : pair;
            String value = idx >= 0 ? pair.substring(idx + 1) : "";

            if (i > 0) {
                masked.append('&');
            }

            if (isSensitiveKey(key)) {
                masked.append(key).append("=***");
            } else {
                masked.append(key);
                if (idx >= 0) {
                    masked.append('=').append(value);
                }
            }
        }

        return request.getRequestURI() + "?" + masked;
    }

    private boolean isSensitiveKey(String key) {
        String normalized = key == null ? "" : key.toLowerCase();
        for (String sensitive : SENSITIVE_QUERY_KEYS) {
            if (normalized.contains(sensitive)) {
                return true;
            }
        }
        return false;
    }
}





