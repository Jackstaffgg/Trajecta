package dev.knalis.trajectaapi.controller.rest.internal.v1;

import dev.knalis.trajectaapi.service.intrf.FileService;
import dev.knalis.trajectaapi.service.intrf.FlightTaskService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@RestController
@RequestMapping("/api/internal/v1/tasks")
@RequiredArgsConstructor
@Tag(name = "Internal Worker", description = "Internal worker-only endpoints secured by X-Worker-Token header.")
public class InternalTaskController {

    private static final String WORKER_TOKEN_HEADER = "X-Worker-Token";

    private final FlightTaskService flightTaskService;
    private final FileService fileService;

    @Value("${application.internal.worker-token}")
    private String workerToken;

    @Operation(summary = "Download raw BIN for worker", description = "Returns source telemetry file for internal worker processing. Requires X-Worker-Token header.")
    @ApiResponse(responseCode = "200", description = "Binary stream", content = @Content(mediaType = "application/octet-stream"))
    @GetMapping(value = "/{taskId}/raw", produces = MediaType.APPLICATION_OCTET_STREAM_VALUE)
    public ResponseEntity<StreamingResponseBody> getRawForWorker(
            @Parameter(description = "Task identifier", example = "42") @PathVariable Long taskId,
            @Parameter(description = "Internal worker token", required = true, example = "my-secret-worker-token")
            @RequestHeader(value = WORKER_TOKEN_HEADER, required = false) String token
    ) {
        authenticateWorker(token);

        final var rawKey = flightTaskService.getTaskRawKeyInternal(taskId);
        StreamingResponseBody stream = outputStream -> {
            try (var inputStream = fileService.getObjectStream(rawKey)) {
                inputStream.transferTo(outputStream);
            }
        };

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"source.bin\"")
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header("X-Content-Type-Options", "nosniff")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(stream);
    }

    private void authenticateWorker(String token) {
        if (token == null || token.isBlank() || workerToken == null || workerToken.isBlank()) {
            throw new BadCredentialsException("Invalid worker token");
        }

        boolean equal = MessageDigest.isEqual(
                workerToken.getBytes(StandardCharsets.UTF_8),
                token.getBytes(StandardCharsets.UTF_8)
        );

        if (!equal) {
            throw new BadCredentialsException("Invalid worker token");
        }
    }
}

